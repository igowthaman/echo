'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Peer, type DataConnection, type MediaConnection } from 'peerjs';
import { addContactAction } from '@/app/actions/contacts';
import { loadMessages, openHistory, saveMessage, type ChatMessage } from './history';

export type { ChatMessage } from './history';

export type Me = { id: string; username: string; displayName: string; avatarVersion: number | null };
export type Profile = { id: string; username: string; displayName: string; avatarVersion: number | null };

const toProfile = (u: Profile): Profile => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  avatarVersion: u.avatarVersion ?? null,
});
export type ContactWithPresence = Profile & { online: boolean };

/** connecting → online; offline when the signalling server can't be reached; taken when another tab holds this ID. */
export type PeerStatus = 'connecting' | 'online' | 'offline' | 'taken';

export type Conversation = Profile & {
  isContact: boolean;
  /** Signed in to Echo right now. */
  online: boolean;
  /** A direct chat connection is open. */
  connected: boolean;
  unread: number;
  lastAt: number;
};

export type ChatRequest = { id: string; profile?: Profile };

export type CallKind = 'audio' | 'video';
export type CallState =
  | { phase: 'idle' }
  | { phase: 'incoming' | 'outgoing'; peer: string; kind: CallKind }
  | { phase: 'active'; peer: string; kind: CallKind; startedAt: number };

export const MAX_MESSAGE_LENGTH = 4000;
const PRESENCE_REFRESH_MS = 20_000;
const CONNECT_TIMEOUT_MS = 15_000;
const RING_TIMEOUT_MS = 45_000;
const MAX_QUEUED_FROM_STRANGER = 50;
// A closed tab doesn't always close the data channel on the other side, so
// both ends ping and drop a connection that has gone quiet.
const HEARTBEAT_MS = 5_000;
const SILENCE_LIMIT_MS = 15_000;

// What travels over a data connection. Everything received is checked
// against this shape: the other side is another person's browser.
type HangupReason = 'busy' | 'not-contact' | 'declined';
type WireMessage =
  | { type: 'chat'; id: string; text: string; sentAt: number }
  | { type: 'hangup'; reason?: HangupReason }
  | { type: 'ping' };

function parseWire(data: unknown): WireMessage | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type === 'ping') return { type: 'ping' };
  if (d.type === 'hangup') {
    const reason = d.reason === 'busy' || d.reason === 'not-contact' || d.reason === 'declined' ? d.reason : undefined;
    return { type: 'hangup', reason };
  }
  if (
    d.type === 'chat' &&
    typeof d.id === 'string' &&
    d.id.length > 0 &&
    d.id.length <= 64 &&
    typeof d.text === 'string' &&
    d.text.trim().length > 0 &&
    d.text.length <= MAX_MESSAGE_LENGTH &&
    typeof d.sentAt === 'number' &&
    Number.isFinite(d.sentAt)
  ) {
    return { type: 'chat', id: d.id, text: d.text, sentAt: d.sentAt };
  }
  return null;
}

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function signallingOptions() {
  const secure = window.location.protocol === 'https:';
  return {
    host: window.location.hostname,
    port: Number(window.location.port) || (secure ? 443 : 80),
    secure,
    path: '/peerjs/api',
  };
}

const FALLBACK_ICE: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function fetchIceConfig(): Promise<RTCConfiguration> {
  try {
    const response = await fetch('/api/turn', { cache: 'no-store' });
    if (response.ok) {
      const body = (await response.json()) as { iceServers?: RTCIceServer[] };
      if (Array.isArray(body.iceServers)) return { iceServers: body.iceServers };
    }
  } catch {
    // Fall back to STUN only.
  }
  return FALLBACK_ICE;
}

const mediaConstraints = (kind: CallKind): MediaStreamConstraints => ({
  audio: { echoCancellation: true, noiseSuppression: true },
  video: kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
});

function mediaErrorMessage(error: unknown, kind: CallKind): string {
  const device = kind === 'video' ? 'camera and microphone' : 'microphone';
  if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
    return 'Calls need a secure connection. Open Echo over https or on localhost.';
  }
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return `Echo needs your ${device}. Allow access in your browser, then try again.`;
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return `No ${device} found. Connect one, then try again.`;
  }
  if (name === 'NotReadableError') return `Your ${device} is being used by another app.`;
  return `Couldn't start your ${device}.`;
}

type Pending = { connection: DataConnection; queue: unknown[]; buffer: (data: unknown) => void };
type ActiveCall = {
  media: MediaConnection;
  peer: string;
  kind: CallKind;
  local?: MediaStream;
  ringTimer?: ReturnType<typeof setTimeout>;
};

export function useEcho(me: Me, initialContacts: ContactWithPresence[]) {
  const peerRef = useRef<Peer | null>(null);
  const connections = useRef(new Map<string, DataConnection>());
  const outgoing = useRef(new WeakSet<DataConnection>());
  const quiet = useRef(new Set<string>());
  const pending = useRef(new Map<string, Pending>());
  const contactIds = useRef(new Set(initialContacts.map((c) => c.id)));
  const dbRef = useRef<IDBDatabase | null>(null);
  const selectedRef = useRef<string | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const lastHeard = useRef(new Map<DataConnection, number>());

  const [status, setStatus] = useState<PeerStatus>('connecting');
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Record<string, Profile>>(() =>
    Object.fromEntries(
      initialContacts.map((c) => [c.id, toProfile(c)]),
    ),
  );
  const [contacts, setContacts] = useState<string[]>(() => initialContacts.map((c) => c.id));
  const [presence, setPresence] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialContacts.map((c) => [c.id, c.online])),
  );
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [requests, setRequests] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [call, setCall] = useState<CallState>({ phase: 'idle' });
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  // Event handlers registered once (PeerJS callbacks, timers) read these.
  const profilesRef = useRef(profiles);
  const presenceRef = useRef(presence);
  const knownIdsRef = useRef<string[]>([]);
  useEffect(() => {
    profilesRef.current = profiles;
    presenceRef.current = presence;
    knownIdsRef.current = [...new Set([...contacts, ...Object.keys(messages), ...(selected ? [selected] : [])])];
  });

  const nameOf = (id: string) => profilesRef.current[id]?.displayName ?? 'They';

  // ---------- people ----------

  async function refreshPeople(ids: string[]) {
    const unique = [...new Set(ids)].filter((id) => id !== me.id).slice(0, 100);
    if (unique.length === 0) return;
    try {
      const response = await fetch(`/api/users?ids=${unique.join(',')}`, { cache: 'no-store' });
      if (!response.ok) return;
      const { users } = (await response.json()) as { users: ContactWithPresence[] };
      setProfiles((all) => {
        const next = { ...all };
        for (const u of users) next[u.id] = toProfile(u);
        return next;
      });
      setPresence((all) => {
        const next = { ...all };
        for (const id of unique) next[id] = users.some((u) => u.id === id && u.online);
        return next;
      });
    } catch {
      // Offline for a moment; the next refresh tries again.
    }
  }

  /** Saves someone as a contact. Returns false (and undoes it) if the server didn't save it. */
  async function makeContact(id: string): Promise<boolean> {
    if (contactIds.current.has(id)) return true;
    contactIds.current.add(id);
    setContacts((all) => (all.includes(id) ? all : [...all, id]));
    const saved = await addContactAction(id).catch(() => null);
    if (saved) {
      setProfiles((all) => ({ ...all, [id]: saved }));
      return true;
    }
    contactIds.current.delete(id);
    setContacts((all) => all.filter((contact) => contact !== id));
    return false;
  }

  // ---------- connections ----------

  function dropConnection(peer: string, connection: DataConnection) {
    connection.close();
    if (connections.current.get(peer) !== connection) return;
    connections.current.delete(peer);
    setConnected((all) => ({ ...all, [peer]: false }));
  }

  function attach(connection: DataConnection) {
    const peer = connection.peer;
    const previous = connections.current.get(peer);
    if (previous && previous !== connection) {
      // Both people connected at the same moment. Keep the connection
      // opened by the lower user ID, so both ends keep the same one.
      const keepPrevious = outgoing.current.has(previous) && !outgoing.current.has(connection) && me.id < peer;
      if (keepPrevious) {
        connection.close();
        return;
      }
    }
    connections.current.set(peer, connection);
    if (previous && previous !== connection) previous.close();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const onOpen = () => {
      clearTimeout(timer);
      lastHeard.current.set(connection, Date.now());
      quiet.current.delete(peer);
      setConnected((all) => ({ ...all, [peer]: true }));
    };
    connection.on('data', (data) => {
      lastHeard.current.set(connection, Date.now());
      handleData(peer, data);
    });
    connection.on('close', () => {
      clearTimeout(timer);
      lastHeard.current.delete(connection);
      if (connections.current.get(peer) !== connection) return;
      connections.current.delete(peer);
      setConnected((all) => ({ ...all, [peer]: false }));
    });
    connection.on('error', (connectionError) => setError(connectionError.message));
    if (connection.open) {
      onOpen();
    } else {
      connection.on('open', onOpen);
      timer = setTimeout(() => {
        if (connection.open) return;
        dropConnection(peer, connection);
        if (!quiet.current.delete(peer)) setError(`Couldn't connect to ${nameOf(peer)}. Try again.`);
      }, CONNECT_TIMEOUT_MS);
    }
  }

  /** Opens a chat connection unless one is open or opening. `quietly` hides "isn't online" errors. */
  function ensureConnection(peer: string, quietly = false) {
    const client = peerRef.current;
    if (!client?.open || connections.current.has(peer)) return;
    if (quietly) quiet.current.add(peer);
    else quiet.current.delete(peer);
    const connection = client.connect(peer, { reliable: true, serialization: 'json' });
    outgoing.current.add(connection);
    attach(connection);
  }

  function handleIncoming(connection: DataConnection) {
    const peer = connection.peer;
    if (contactIds.current.has(peer)) {
      attach(connection);
      return;
    }
    // Not a contact: hold what they send until this user accepts.
    pending.current.get(peer)?.connection.close();
    const queue: unknown[] = [];
    const buffer = (data: unknown) => {
      if (queue.length < MAX_QUEUED_FROM_STRANGER) queue.push(data);
    };
    connection.on('data', buffer);
    connection.on('close', () => {
      if (pending.current.get(peer)?.connection !== connection) return;
      pending.current.delete(peer);
      setRequests((all) => all.filter((id) => id !== peer));
    });
    pending.current.set(peer, { connection, queue, buffer });
    setRequests((all) => (all.includes(peer) ? all : [...all, peer]));
    refreshPeople([peer]);
  }

  function accept(peer: string) {
    const request = pending.current.get(peer);
    pending.current.delete(peer);
    setRequests((all) => all.filter((id) => id !== peer));
    if (!request) return;
    request.connection.off('data', request.buffer);
    makeContact(peer);
    attach(request.connection);
    request.queue.forEach((data) => handleData(peer, data));
    select(peer);
  }

  function decline(peer: string) {
    const request = pending.current.get(peer);
    pending.current.delete(peer);
    setRequests((all) => all.filter((id) => id !== peer));
    request?.connection.close();
  }

  // ---------- messages ----------

  function select(peer: string | null) {
    selectedRef.current = peer;
    setSelected(peer);
    if (peer) setUnread((counts) => ({ ...counts, [peer]: 0 }));
  }

  function addMessage(message: ChatMessage) {
    setMessages((all) => {
      const list = all[message.peer] ?? [];
      if (list.some((m) => m.id === message.id)) return all;
      return { ...all, [message.peer]: [...list, message] };
    });
    saveMessage(dbRef.current, message);
  }

  function handleData(peer: string, data: unknown) {
    const wire = parseWire(data);
    if (!wire || wire.type === 'ping') return;
    if (wire.type === 'hangup') {
      if (callRef.current?.peer !== peer) return;
      endCall(false);
      if (wire.reason === 'busy') setError(`${nameOf(peer)} is on another call.`);
      if (wire.reason === 'not-contact') setError(`${nameOf(peer)} needs to accept your chat request before you can call.`);
      if (wire.reason === 'declined') setError(`${nameOf(peer)} declined the call.`);
      return;
    }
    addMessage({ id: wire.id, peer, from: 'them', text: wire.text, sentAt: wire.sentAt });
    if (selectedRef.current !== peer) {
      setUnread((counts) => ({ ...counts, [peer]: (counts[peer] ?? 0) + 1 }));
    }
  }

  /**
   * Finds someone by username, saves them as a contact and opens their
   * conversation. Returns an error message to show, or null when it worked.
   */
  async function addContact(rawUsername: string): Promise<string | null> {
    const username = rawUsername.trim().toLowerCase();
    if (!username) return 'Enter a username.';
    if (username === me.username) return "That's your own username.";
    let found: ContactWithPresence;
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(username)}`, { cache: 'no-store' });
      if (response.status === 404) return `No one on Echo has the username ${username}.`;
      if (!response.ok) throw new Error(String(response.status));
      found = (await response.json()) as ContactWithPresence;
    } catch {
      return "Couldn't look that username up. Check your connection and try again.";
    }
    setProfiles((all) => ({ ...all, [found.id]: toProfile(found) }));
    setPresence((all) => ({ ...all, [found.id]: found.online }));
    if (!(await makeContact(found.id))) return `Couldn't save ${found.displayName} to your contacts. Try again.`;
    select(found.id);
    if (found.online) ensureConnection(found.id);
    return null;
  }

  /** Sends a message. Returns false if there's no open connection. */
  function send(peer: string, rawText: string): boolean {
    const text = rawText.trim();
    const connection = connections.current.get(peer);
    if (!text || text.length > MAX_MESSAGE_LENGTH || !connection?.open) return false;
    const message: ChatMessage = { id: newId(), peer, from: 'me', text, sentAt: Date.now() };
    connection.send({ type: 'chat', id: message.id, text, sentAt: message.sentAt } satisfies WireMessage);
    addMessage(message);
    return true;
  }

  // ---------- calls ----------

  function sendHangup(peer: string, reason?: HangupReason) {
    const connection = connections.current.get(peer);
    if (connection?.open) connection.send({ type: 'hangup', reason } satisfies WireMessage);
  }

  function endCall(notify: boolean, reason?: HangupReason) {
    const active = callRef.current;
    if (!active) return;
    callRef.current = null;
    clearTimeout(active.ringTimer);
    if (notify) sendHangup(active.peer, reason);
    active.media.close();
    active.local?.getTracks().forEach((track) => track.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    setCall({ phase: 'idle' });
  }

  function wireCall(active: ActiveCall) {
    const { media } = active;
    media.on('stream', (remote) => {
      if (callRef.current !== active) return;
      clearTimeout(active.ringTimer);
      setRemoteStream(remote);
      setCall((current) =>
        current.phase === 'active' ? current : { phase: 'active', peer: active.peer, kind: active.kind, startedAt: Date.now() },
      );
    });
    media.on('close', () => {
      if (callRef.current === active) endCall(false);
    });
    media.on('error', (mediaError) => {
      if (callRef.current !== active) return;
      setError(mediaError.message);
      endCall(false);
    });
    // Some browsers never fire 'close' on the other side, so watch the link itself.
    media.on('iceStateChanged', (state) => {
      if (callRef.current !== active || (state !== 'failed' && state !== 'closed')) return;
      if (state === 'failed') setError(`The call with ${nameOf(active.peer)} dropped.`);
      endCall(false);
    });
  }

  async function startCall(peer: string, kind: CallKind) {
    const client = peerRef.current;
    if (callRef.current) return;
    if (!client?.open) {
      setError("You're not connected to Echo yet. Try again in a moment.");
      return;
    }
    if (!presenceRef.current[peer]) {
      setError(`${nameOf(peer)} isn't online right now.`);
      return;
    }
    setError('');
    setCall({ phase: 'outgoing', peer, kind });
    let local: MediaStream;
    try {
      local = await navigator.mediaDevices.getUserMedia(mediaConstraints(kind));
    } catch (mediaError) {
      setCall({ phase: 'idle' });
      setError(mediaErrorMessage(mediaError, kind));
      return;
    }
    if (!peerRef.current?.open) {
      local.getTracks().forEach((track) => track.stop());
      setCall({ phase: 'idle' });
      return;
    }
    // The chat connection carries the "hang up" signal.
    ensureConnection(peer);
    const active: ActiveCall = { media: peerRef.current.call(peer, local, { metadata: { kind } }), peer, kind, local };
    active.ringTimer = setTimeout(() => {
      if (callRef.current !== active) return;
      endCall(true);
      setError(`${nameOf(peer)} didn't answer.`);
    }, RING_TIMEOUT_MS);
    callRef.current = active;
    setLocalStream(local);
    wireCall(active);
  }

  function handleIncomingCall(media: MediaConnection) {
    const kind: CallKind = media.metadata?.kind === 'video' ? 'video' : 'audio';
    if (!contactIds.current.has(media.peer)) {
      sendHangup(media.peer, 'not-contact');
      media.close();
      return;
    }
    if (callRef.current) {
      sendHangup(media.peer, 'busy');
      media.close();
      return;
    }
    const active: ActiveCall = { media, peer: media.peer, kind };
    active.ringTimer = setTimeout(() => {
      if (callRef.current === active && !active.local) endCall(false);
    }, RING_TIMEOUT_MS);
    callRef.current = active;
    wireCall(active);
    setCall({ phase: 'incoming', peer: media.peer, kind });
  }

  async function acceptCall() {
    const active = callRef.current;
    if (!active || active.local) return;
    let local: MediaStream;
    try {
      local = await navigator.mediaDevices.getUserMedia(mediaConstraints(active.kind));
    } catch (mediaError) {
      setError(mediaErrorMessage(mediaError, active.kind));
      endCall(true);
      return;
    }
    if (callRef.current !== active) {
      // They hung up while the camera was starting.
      local.getTracks().forEach((track) => track.stop());
      return;
    }
    clearTimeout(active.ringTimer);
    active.local = local;
    setLocalStream(local);
    active.media.answer(local);
    setCall({ phase: 'active', peer: active.peer, kind: active.kind, startedAt: Date.now() });
  }

  function toggleMute() {
    const local = callRef.current?.local;
    if (!local) return;
    const next = !muted;
    local.getAudioTracks().forEach((track) => (track.enabled = !next));
    setMuted(next);
  }

  function toggleCamera() {
    const local = callRef.current?.local;
    if (!local) return;
    const next = !cameraOff;
    local.getVideoTracks().forEach((track) => (track.enabled = !next));
    setCameraOff(next);
  }

  // ---------- effects ----------

  // Load this user's chat history from IndexedDB.
  useEffect(() => {
    let cancelled = false;
    openHistory(me.id).then(async (db) => {
      if (cancelled || !db) {
        db?.close();
        return;
      }
      dbRef.current = db;
      const history = await loadMessages(db);
      if (cancelled) return;
      setMessages((current) => {
        const merged: Record<string, ChatMessage[]> = {};
        const seen = new Set<string>();
        for (const m of [...history, ...Object.values(current).flat()]) {
          const key = `${m.peer}\u0000${m.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          (merged[m.peer] ??= []).push(m);
        }
        Object.values(merged).forEach((list) => list.sort((a, b) => a.sentAt - b.sentAt));
        return merged;
      });
      // Names and online state for people from history who aren't contacts.
      refreshPeople(history.map((m) => m.peer));
    });
    return () => {
      cancelled = true;
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, [me.id]);

  // Register with the signalling server under this user's ID.
  useEffect(() => {
    let cancelled = false;
    let idTakenRetries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const openConnections = connections.current;
    const pendingConnections = pending.current;

    const start = async () => {
      if (cancelled) return;
      setStatus('connecting');
      const config = await fetchIceConfig();
      if (cancelled) return;
      const peer = new Peer(me.id, { ...signallingOptions(), config });
      peerRef.current = peer;

      peer.on('open', () => {
        idTakenRetries = 0;
        setStatus('online');
      });
      peer.on('connection', handleIncoming);
      peer.on('call', handleIncomingCall);
      peer.on('disconnected', () => {
        if (peer.destroyed || cancelled) return;
        setStatus('offline');
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!peer.destroyed && !cancelled) peer.reconnect();
        }, 3000);
      });
      peer.on('error', (peerError) => {
        if (peerError.type === 'unavailable-id') {
          // Usually the previous page load's socket hasn't closed yet.
          peer.destroy();
          if (idTakenRetries++ < 3) {
            clearTimeout(timer);
            timer = setTimeout(start, 1000);
          } else {
            setStatus('taken');
          }
          return;
        }
        if (peerError.type === 'peer-unavailable') {
          const id = peerError.message.replace(/^Could not connect to peer /, '');
          const connection = connections.current.get(id);
          if (connection && !connection.open) dropConnection(id, connection);
          if (callRef.current?.peer === id) endCall(false);
          if (!quiet.current.delete(id)) setError(`${nameOf(id)} isn't online right now.`);
          return;
        }
        if (!peer.open) setStatus('offline');
        setError(peerError.message);
      });
    };

    start();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      endCall(false);
      peerRef.current?.destroy();
      peerRef.current = null;
      openConnections.clear();
      pendingConnections.clear();
      setConnected({});
      setRequests([]);
    };
    // The handlers above only read refs and call state setters, so capturing them once is safe.
  }, [me.id]);

  // Ping every open connection and drop the ones that have gone quiet.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [peer, connection] of connections.current) {
        if (!connection.open) continue;
        if (now - (lastHeard.current.get(connection) ?? now) > SILENCE_LIMIT_MS) {
          lastHeard.current.delete(connection);
          dropConnection(peer, connection);
          continue;
        }
        connection.send({ type: 'ping' } satisfies WireMessage);
      }
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [me.id]);

  // Keep names and online dots fresh.
  useEffect(() => {
    const refresh = () => refreshPeople(knownIdsRef.current);
    const interval = setInterval(refresh, PRESENCE_REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [me.id]);

  // Opening a contact's conversation connects to them when they're online.
  const selectedOnline = selected ? !!presence[selected] : false;
  useEffect(() => {
    if (selected && selectedOnline && status === 'online' && contactIds.current.has(selected)) {
      ensureConnection(selected, true);
    }
  }, [selected, selectedOnline, status]);

  const conversations = useMemo<Conversation[]>(() => {
    const ids = new Set<string>([
      ...contacts,
      ...Object.keys(messages),
      ...Object.keys(connected).filter((id) => connected[id]),
    ]);
    if (selected) ids.add(selected);
    ids.delete(me.id);
    return [...ids]
      .map((id) => ({
        id,
        username: profiles[id]?.username ?? '',
        displayName: profiles[id]?.displayName ?? 'Someone',
        avatarVersion: profiles[id]?.avatarVersion ?? null,
        isContact: contacts.includes(id),
        online: !!presence[id],
        connected: !!connected[id],
        unread: unread[id] ?? 0,
        lastAt: messages[id]?.at(-1)?.sentAt ?? 0,
      }))
      .sort(
        (a, b) =>
          b.lastAt - a.lastAt || Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName),
      );
  }, [contacts, messages, connected, selected, profiles, presence, unread, me.id]);

  return {
    me,
    status,
    error,
    clearError: () => setError(''),
    conversations,
    messages,
    requests: requests.map((id): ChatRequest => ({ id, profile: profiles[id] })),
    selected,
    select,
    addContact,
    connect: (peer: string) => ensureConnection(peer),
    send,
    accept,
    decline,
    calls: {
      state: call,
      localStream,
      remoteStream,
      muted,
      cameraOff,
      start: startCall,
      accept: acceptCall,
      decline: () => endCall(true, 'declined'),
      hangUp: () => endCall(true),
      toggleMute,
      toggleCamera,
    },
    nameOf: (id: string) => profiles[id]?.displayName ?? 'Someone',
    profileOf: (id: string): Profile | undefined => profiles[id],
  };
}

export type Echo = ReturnType<typeof useEcho>;
