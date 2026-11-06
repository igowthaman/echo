'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Peer, type DataConnection, type MediaConnection } from 'peerjs';
import { addContactAction } from '@/app/actions/contacts';
import {
  addGroupMembersAction,
  createGroupAction,
  leaveGroupAction,
  removeGroupMemberAction,
  renameGroupAction,
  setGroupAdminAction,
  type GroupResult,
} from '@/app/actions/groups';
import type { Group, GroupMember, GroupRole } from '@/lib/groups';
import { loadMessages, openHistory, saveMessage, type ChatMessage } from './history';

export type { ChatMessage } from './history';
export type { Group, GroupMember, GroupRole };

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

/** A group call someone in the group is on right now. */
export type GroupCallInvite = { callId: string; kind: CallKind; participants: string[]; seenAt: number };

export type GroupConversation = {
  group: Group;
  /** The conversation key: "g:<groupId>". */
  key: string;
  myRole: GroupRole;
  unread: number;
  lastAt: number;
  onlineCount: number;
  call: GroupCallInvite | null;
};

export type GroupCallView = {
  groupId: string;
  callId: string;
  kind: CallKind;
  startedAt: number;
  local: MediaStream;
  /** Everyone else on the call, with their stream once it arrives. */
  streams: Record<string, MediaStream | null>;
};

export type GroupRing = { groupId: string; callId: string; kind: CallKind; from: string };

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_CALL_PARTICIPANTS = 4;
export const groupKey = (groupId: string) => `g:${groupId}`;
export const isGroupKey = (key: string) => key.startsWith('g:');

const PRESENCE_REFRESH_MS = 20_000;
const CONNECT_TIMEOUT_MS = 15_000;
const RING_TIMEOUT_MS = 45_000;
const MAX_QUEUED_FROM_STRANGER = 50;
// A closed tab doesn't always close the data channel on the other side, so
// both ends ping and drop a connection that has gone quiet.
const HEARTBEAT_MS = 5_000;
const SILENCE_LIMIT_MS = 15_000;
// Group members swap what they're missing from the last 30 days.
const SYNC_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SYNC_IDS = 1000;
const SYNC_BATCH_COUNT = 50;
const SYNC_BATCH_CHARS = 60_000;
// People on a group call repeat who is on it; a notice nobody repeats expires.
const CALL_ROSTER_EVERY_MS = 15_000;
const CALL_INVITE_STALE_MS = 45_000;

// What travels over a data connection. Everything received is checked
// against these shapes: the other side is another person's browser.
type HangupReason = 'busy' | 'not-contact' | 'declined';
type GroupText = { id: string; author: string; text: string; sentAt: number };
type WireMessage =
  | { type: 'chat'; id: string; text: string; sentAt: number }
  | { type: 'hangup'; reason?: HangupReason }
  | { type: 'ping' }
  | ({ type: 'group-chat'; groupId: string } & GroupText)
  | { type: 'group-sync'; groupId: string; ids: string[] }
  | { type: 'group-messages'; groupId: string; messages: GroupText[] }
  | { type: 'group-updated'; groupId: string }
  | { type: 'group-call'; groupId: string; callId: string; kind: CallKind; participants: string[] }
  | { type: 'group-call-leave'; groupId: string; callId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_MESSAGE_LENGTH;
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isMessageId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64;

function parseGroupText(d: Record<string, unknown>): GroupText | null {
  if (!isMessageId(d.id) || !isId(d.author) || !isText(d.text) || !isTime(d.sentAt)) return null;
  return { id: d.id, author: d.author, text: d.text, sentAt: d.sentAt };
}

function parseWire(data: unknown): WireMessage | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  switch (d.type) {
    case 'ping':
      return { type: 'ping' };
    case 'hangup': {
      const reason = d.reason === 'busy' || d.reason === 'not-contact' || d.reason === 'declined' ? d.reason : undefined;
      return { type: 'hangup', reason };
    }
    case 'chat':
      return isMessageId(d.id) && isText(d.text) && isTime(d.sentAt)
        ? { type: 'chat', id: d.id, text: d.text, sentAt: d.sentAt }
        : null;
  }
  if (!isId(d.groupId)) return null;
  const groupId = d.groupId;
  switch (d.type) {
    case 'group-chat': {
      const message = parseGroupText(d);
      return message ? { type: 'group-chat', groupId, ...message } : null;
    }
    case 'group-sync':
      return Array.isArray(d.ids)
        ? { type: 'group-sync', groupId, ids: d.ids.filter(isMessageId).slice(0, MAX_SYNC_IDS) }
        : null;
    case 'group-messages':
      return Array.isArray(d.messages)
        ? {
            type: 'group-messages',
            groupId,
            messages: d.messages
              .slice(0, SYNC_BATCH_COUNT * 2)
              .map((m) => (m && typeof m === 'object' ? parseGroupText(m as Record<string, unknown>) : null))
              .filter((m): m is GroupText => m !== null),
          }
        : null;
    case 'group-updated':
      return { type: 'group-updated', groupId };
    case 'group-call':
      return isId(d.callId) && (d.kind === 'audio' || d.kind === 'video') && Array.isArray(d.participants)
        ? {
            type: 'group-call',
            groupId,
            callId: d.callId,
            kind: d.kind,
            participants: [...new Set(d.participants.filter(isId))].slice(0, MAX_CALL_PARTICIPANTS),
          }
        : null;
    case 'group-call-leave':
      return isId(d.callId) ? { type: 'group-call-leave', groupId, callId: d.callId } : null;
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
type GroupCallSession = {
  groupId: string;
  callId: string;
  kind: CallKind;
  local: MediaStream;
  startedAt: number;
  /** Who this browser believes is on the call, itself included. */
  participants: Set<string>;
  media: Map<string, MediaConnection>;
  /** When someone listed on the call was first seen without a connection yet. */
  waiting: Map<string, number>;
};
// Someone listed on a call who never connects (a closed tab, say) is dropped after this.
const CALL_WAIT_LIMIT_MS = 20_000;

export function useEcho(me: Me, initialContacts: ContactWithPresence[], initialGroups: Group[]) {
  const peerRef = useRef<Peer | null>(null);
  const connections = useRef(new Map<string, DataConnection>());
  const outgoing = useRef(new WeakSet<DataConnection>());
  const quiet = useRef(new Set<string>());
  const pending = useRef(new Map<string, Pending>());
  const contactIds = useRef(new Set(initialContacts.map((c) => c.id)));
  const dbRef = useRef<IDBDatabase | null>(null);
  const selectedRef = useRef<string | null>(null);
  const callRef = useRef<ActiveCall | null>(null);
  const groupCallRef = useRef<GroupCallSession | null>(null);
  const lastHeard = useRef(new Map<DataConnection, number>());
  // Message IDs per conversation, and full group messages, kept in step with
  // every add so sync can answer straight away.
  const seenIds = useRef(new Map<string, Set<string>>());
  const groupStore = useRef(new Map<string, Map<string, ChatMessage>>());

  const [status, setStatus] = useState<PeerStatus>('connecting');
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<Record<string, Profile>>(() =>
    Object.fromEntries([
      ...initialGroups.flatMap((g) => g.members.map((m) => [m.id, toProfile(m)] as const)),
      ...initialContacts.map((c) => [c.id, toProfile(c)] as const),
    ]),
  );
  const [contacts, setContacts] = useState<string[]>(() => initialContacts.map((c) => c.id));
  const [groups, setGroups] = useState<Group[]>(initialGroups);
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
  const [groupCall, setGroupCall] = useState<GroupCallView | null>(null);
  const [groupCallInvites, setGroupCallInvites] = useState<Record<string, GroupCallInvite>>({});
  const [groupRing, setGroupRing] = useState<GroupRing | null>(null);

  // Event handlers registered once (PeerJS callbacks, timers) read these.
  const profilesRef = useRef(profiles);
  const presenceRef = useRef(presence);
  const groupsRef = useRef(groups);
  const invitesRef = useRef(groupCallInvites);
  const knownIdsRef = useRef<string[]>([]);
  groupsRef.current = groups;
  const coMemberIds = useMemo(
    () => [...new Set(groups.flatMap((g) => g.members.map((m) => m.id)))].filter((id) => id !== me.id),
    [groups, me.id],
  );
  useEffect(() => {
    profilesRef.current = profiles;
    presenceRef.current = presence;
    invitesRef.current = groupCallInvites;
    knownIdsRef.current = [
      ...new Set([
        ...contacts,
        ...coMemberIds,
        ...Object.keys(messages).filter((key) => !isGroupKey(key)),
        ...(selected && !isGroupKey(selected) ? [selected] : []),
      ]),
    ];
  });

  const nameOf = (id: string) => profilesRef.current[id]?.displayName ?? 'They';
  const groupOf = (groupId: string) => groupsRef.current.find((g) => g.id === groupId);
  const isMember = (group: Group, userId: string) => group.members.some((m) => m.id === userId);
  /** People this browser accepts connections from without asking: contacts and anyone sharing a group. */
  const isKnown = (peer: string) =>
    contactIds.current.has(peer) || groupsRef.current.some((g) => isMember(g, peer) && isMember(g, me.id));

  // ---------- people ----------

  async function refreshPeople(ids: string[]) {
    // Sent even with nobody to ask about: the request also checks this device is still logged in.
    const unique = [...new Set(ids)].filter((id) => id !== me.id && isId(id)).slice(0, 100);
    try {
      const response = await fetch(`/api/users?ids=${unique.join(',')}`, { cache: 'no-store' });
      if (response.status === 401) {
        // This device was logged out, from Settings on another device or by expiry.
        window.location.assign('/login');
        return;
      }
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

  function sendTo(peer: string, message: WireMessage): boolean {
    const connection = connections.current.get(peer);
    if (!connection?.open) return false;
    connection.send(message);
    return true;
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
      // Catch each other up on shared groups, and mention a group call in progress.
      sendGroupSync(peer);
      announceGroupCallTo(peer);
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
    if (isKnown(peer)) {
      attach(connection);
      return;
    }
    // A stranger: hold what they send until this user accepts.
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
    // They may have just added this user to a group this browser hasn't heard about yet.
    refreshGroups().then(() => {
      if (pending.current.get(peer)?.connection !== connection) return;
      if (isKnown(peer)) {
        pending.current.delete(peer);
        connection.off('data', buffer);
        attach(connection);
        queue.forEach((data) => handleData(peer, data));
        return;
      }
      setRequests((all) => (all.includes(peer) ? all : [...all, peer]));
      refreshPeople([peer]);
    });
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

  function select(key: string | null) {
    selectedRef.current = key;
    setSelected(key);
    if (key) setUnread((counts) => ({ ...counts, [key]: 0 }));
  }

  function markUnread(key: string) {
    if (selectedRef.current !== key) setUnread((counts) => ({ ...counts, [key]: (counts[key] ?? 0) + 1 }));
  }

  /** Adds a message to its conversation and history. Returns false if it was already there. */
  function addMessage(message: ChatMessage): boolean {
    let seen = seenIds.current.get(message.peer);
    if (!seen) seenIds.current.set(message.peer, (seen = new Set()));
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    if (isGroupKey(message.peer)) {
      let store = groupStore.current.get(message.peer);
      if (!store) groupStore.current.set(message.peer, (store = new Map()));
      store.set(message.id, message);
    }
    setMessages((all) => {
      const list = [...(all[message.peer] ?? []), message];
      // Synced messages can be older than ones already shown.
      if (list.length > 1 && list[list.length - 2].sentAt > message.sentAt) list.sort((a, b) => a.sentAt - b.sentAt);
      return { ...all, [message.peer]: list };
    });
    saveMessage(dbRef.current, message);
    return true;
  }

  function handleData(peer: string, data: unknown) {
    const wire = parseWire(data);
    if (!wire) return;
    switch (wire.type) {
      case 'ping':
        return;
      case 'hangup':
        if (callRef.current?.peer !== peer) return;
        endCall(false);
        if (wire.reason === 'busy') setError(`${nameOf(peer)} is on another call.`);
        if (wire.reason === 'not-contact') setError(`${nameOf(peer)} needs to accept your chat request before you can call.`);
        if (wire.reason === 'declined') setError(`${nameOf(peer)} declined the call.`);
        return;
      case 'chat':
        if (addMessage({ id: wire.id, peer, from: 'them', text: wire.text, sentAt: wire.sentAt })) markUnread(peer);
        return;
      case 'group-chat':
        // Sent directly, so it must come from its author.
        if (wire.author === peer) receiveGroupMessage(wire.groupId, wire, peer);
        return;
      case 'group-messages':
        wire.messages.forEach((message) => receiveGroupMessage(wire.groupId, message, peer));
        return;
      case 'group-sync':
        answerGroupSync(peer, wire.groupId, wire.ids);
        return;
      case 'group-updated':
        refreshGroups();
        return;
      case 'group-call':
        receiveGroupCallRoster(peer, wire);
        return;
      case 'group-call-leave':
        receiveGroupCallLeave(peer, wire.groupId, wire.callId);
        return;
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

  /** Sends a direct message. Returns false if there's no open connection. */
  function send(peer: string, rawText: string): boolean {
    const text = rawText.trim();
    const connection = connections.current.get(peer);
    if (!text || text.length > MAX_MESSAGE_LENGTH || !connection?.open) return false;
    const message: ChatMessage = { id: newId(), peer, from: 'me', text, sentAt: Date.now() };
    connection.send({ type: 'chat', id: message.id, text, sentAt: message.sentAt } satisfies WireMessage);
    addMessage(message);
    return true;
  }

  // ---------- groups ----------

  async function refreshGroups() {
    try {
      const response = await fetch('/api/groups', { cache: 'no-store' });
      if (!response.ok) return;
      const body = (await response.json()) as { groups: Group[] };
      applyGroups(body.groups);
    } catch {
      // Try again on the next refresh.
    }
  }

  function applyGroups(next: Group[]) {
    groupsRef.current = next;
    setGroups(next);
    setProfiles((all) => {
      const merged = { ...all };
      for (const member of next.flatMap((g) => g.members)) merged[member.id] = toProfile(member);
      return merged;
    });
    // Leave the view of a group this user is no longer in.
    const current = selectedRef.current;
    if (current && isGroupKey(current) && !next.some((g) => groupKey(g.id) === current)) select(null);
  }

  const memberIdsOf = (groupId: string) => groupOf(groupId)?.members.map((m) => m.id) ?? [];

  /** Tells people to fetch a group's membership from the server again. */
  function announceGroupChange(groupId: string, people: Iterable<string>) {
    const everyone = new Set(people);
    everyone.delete(me.id);
    everyone.forEach((id) => sendTo(id, { type: 'group-updated', groupId }));
  }

  /** Runs a change on the server, then tells everyone affected: old members, new members, and anyone removed. */
  async function runGroupAction(groupId: string, action: () => Promise<GroupResult>): Promise<string | null> {
    const before = memberIdsOf(groupId);
    const result = await action().catch(() => ({ error: "Couldn't reach Echo. Try again." }) as GroupResult);
    if (result.error) return result.error;
    if (result.groups) applyGroups(result.groups);
    announceGroupChange(groupId, [...before, ...memberIdsOf(groupId)]);
    return null;
  }

  async function createGroup(name: string, memberIds: string[]): Promise<string | null> {
    const result = await createGroupAction(name, memberIds).catch(
      () => ({ error: "Couldn't reach Echo. Try again." }) as GroupResult,
    );
    if (result.error) return result.error;
    if (result.groups) applyGroups(result.groups);
    if (result.groupId) {
      announceGroupChange(result.groupId, memberIdsOf(result.groupId));
      select(groupKey(result.groupId));
    }
    return null;
  }

  function receiveGroupMessage(groupId: string, message: GroupText, viaPeer: string) {
    const group = groupOf(groupId);
    if (!group || !isMember(group, viaPeer) || !isMember(group, me.id)) return;
    // Only pass on words from people who are in the group (or this user's own, from another device).
    if (message.author !== me.id && !isMember(group, message.author)) return;
    const key = groupKey(groupId);
    const mine = message.author === me.id;
    const added = addMessage({
      id: message.id,
      peer: key,
      from: mine ? 'me' : 'them',
      author: message.author,
      text: message.text,
      sentAt: message.sentAt,
    });
    if (added && !mine) markUnread(key);
  }

  /** Tells a member which recent messages this browser has, for each group they share. */
  function sendGroupSync(peer: string) {
    const since = Date.now() - SYNC_WINDOW_MS;
    for (const group of groupsRef.current) {
      if (!isMember(group, peer) || !isMember(group, me.id)) continue;
      const store = groupStore.current.get(groupKey(group.id));
      const ids = store
        ? [...store.values()]
            .filter((m) => m.sentAt >= since)
            .sort((a, b) => b.sentAt - a.sentAt)
            .slice(0, MAX_SYNC_IDS)
            .map((m) => m.id)
        : [];
      sendTo(peer, { type: 'group-sync', groupId: group.id, ids });
    }
  }

  /** Sends a member the recent messages they don't have yet, in batches. */
  function answerGroupSync(peer: string, groupId: string, theirIds: string[]) {
    const group = groupOf(groupId);
    if (!group || !isMember(group, peer) || !isMember(group, me.id)) return;
    const store = groupStore.current.get(groupKey(groupId));
    if (!store) return;
    const theyHave = new Set(theirIds);
    const since = Date.now() - SYNC_WINDOW_MS;
    const missing = [...store.values()]
      .filter((m) => m.sentAt >= since && !theyHave.has(m.id) && m.author && isMember(group, m.author))
      .sort((a, b) => a.sentAt - b.sentAt);
    let batch: GroupText[] = [];
    let size = 0;
    const flush = () => {
      if (batch.length) sendTo(peer, { type: 'group-messages', groupId, messages: batch });
      batch = [];
      size = 0;
    };
    for (const m of missing) {
      batch.push({ id: m.id, author: m.author!, text: m.text, sentAt: m.sentAt });
      size += m.text.length + 120;
      if (batch.length >= SYNC_BATCH_COUNT || size >= SYNC_BATCH_CHARS) flush();
    }
    flush();
  }

  /**
   * Sends a message to the group. It reaches online members now; others get
   * it from whoever has it when they next come online. Returns false if the
   * text isn't sendable.
   */
  function sendGroup(groupId: string, rawText: string): boolean {
    const text = rawText.trim();
    const group = groupOf(groupId);
    if (!text || text.length > MAX_MESSAGE_LENGTH || !group || !isMember(group, me.id)) return false;
    const message: ChatMessage = {
      id: newId(),
      peer: groupKey(groupId),
      from: 'me',
      author: me.id,
      text,
      sentAt: Date.now(),
    };
    addMessage(message);
    const wire: WireMessage = { type: 'group-chat', groupId, id: message.id, author: me.id, text, sentAt: message.sentAt };
    for (const member of group.members) {
      if (member.id === me.id) continue;
      if (!sendTo(member.id, wire) && presenceRef.current[member.id]) ensureConnection(member.id, true);
    }
    return true;
  }

  // ---------- one-to-one calls ----------

  function sendHangup(peer: string, reason?: HangupReason) {
    sendTo(peer, { type: 'hangup', reason });
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
    if (groupCallRef.current) {
      setError('Leave your group call first.');
      return;
    }
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
    if (media.metadata?.callId) {
      handleIncomingGroupMedia(media);
      return;
    }
    const kind: CallKind = media.metadata?.kind === 'video' ? 'video' : 'audio';
    if (!contactIds.current.has(media.peer)) {
      sendHangup(media.peer, 'not-contact');
      media.close();
      return;
    }
    if (callRef.current || groupCallRef.current) {
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

  /** The microphone and camera in use, on a one-to-one or a group call. */
  const currentLocal = () => callRef.current?.local ?? groupCallRef.current?.local;

  function toggleMute() {
    const local = currentLocal();
    if (!local) return;
    const next = !muted;
    local.getAudioTracks().forEach((track) => (track.enabled = !next));
    setMuted(next);
  }

  function toggleCamera() {
    const local = currentLocal();
    if (!local) return;
    const next = !cameraOff;
    local.getVideoTracks().forEach((track) => (track.enabled = !next));
    setCameraOff(next);
  }

  // ---------- group calls ----------
  // Everyone on a group call connects directly to everyone else (a mesh), so
  // calls are capped at MAX_CALL_PARTICIPANTS. Between any two people, the one
  // with the lower user ID places the call, so they never ring each other at once.

  function rememberInvite(groupId: string, invite: GroupCallInvite | null) {
    setGroupCallInvites((all) => {
      const next = { ...all };
      if (invite && invite.participants.length > 0) next[groupId] = invite;
      else delete next[groupId];
      invitesRef.current = next;
      return next;
    });
  }

  function rosterMessage(session: GroupCallSession): WireMessage {
    return {
      type: 'group-call',
      groupId: session.groupId,
      callId: session.callId,
      kind: session.kind,
      participants: [...session.participants],
    };
  }

  /** Tells every connected member of the group who is on the call. */
  function broadcastRoster(session: GroupCallSession) {
    const group = groupOf(session.groupId);
    if (!group) return;
    const message = rosterMessage(session);
    for (const member of group.members) if (member.id !== me.id) sendTo(member.id, message);
    rememberInvite(session.groupId, {
      callId: session.callId,
      kind: session.kind,
      participants: [...session.participants],
      seenAt: Date.now(),
    });
  }

  function announceGroupCallTo(peer: string) {
    const session = groupCallRef.current;
    const group = session && groupOf(session.groupId);
    if (session && group && isMember(group, peer)) sendTo(peer, rosterMessage(session));
  }

  function showGroupStreams(session: GroupCallSession, update: (streams: Record<string, MediaStream | null>) => void) {
    setGroupCall((view) => {
      if (!view || view.callId !== session.callId) return view;
      const streams = { ...view.streams };
      update(streams);
      return { ...view, streams };
    });
  }

  function wireGroupMedia(session: GroupCallSession, peer: string, media: MediaConnection) {
    session.media.get(peer)?.close();
    session.media.set(peer, media);
    session.participants.add(peer);
    showGroupStreams(session, (streams) => {
      if (!(peer in streams)) streams[peer] = null;
    });
    media.on('stream', (remote) => {
      if (session.media.get(peer) === media) showGroupStreams(session, (streams) => (streams[peer] = remote));
    });
    const drop = () => {
      if (session.media.get(peer) === media) dropParticipant(session, peer);
    };
    media.on('close', drop);
    media.on('error', drop);
    media.on('iceStateChanged', (state) => {
      if (state === 'failed' || state === 'closed') drop();
    });
  }

  function dropParticipant(session: GroupCallSession, peer: string) {
    const media = session.media.get(peer);
    session.media.delete(peer);
    session.participants.delete(peer);
    media?.close();
    showGroupStreams(session, (streams) => delete streams[peer]);
    if (groupCallRef.current === session) broadcastRoster(session);
  }

  /** Calls everyone on the roster this browser should call and isn't already talking to. */
  function connectToRoster(session: GroupCallSession, roster: string[]) {
    const client = peerRef.current;
    const group = groupOf(session.groupId);
    if (!client?.open || !group) return;
    for (const peer of roster) {
      if (peer === me.id || session.media.has(peer) || !isMember(group, peer)) continue;
      session.participants.add(peer);
      if (!session.waiting.has(peer)) session.waiting.set(peer, Date.now());
      if (me.id < peer) {
        const media = client.call(peer, session.local, {
          metadata: { kind: session.kind, groupId: session.groupId, callId: session.callId },
        });
        wireGroupMedia(session, peer, media);
      }
    }
  }

  async function openGroupCall(groupId: string, kind: CallKind, callId: string, roster: string[]) {
    const group = groupOf(groupId);
    if (!group || !isMember(group, me.id)) return;
    if (callRef.current || groupCallRef.current) {
      setError('Finish your current call first.');
      return;
    }
    if (!peerRef.current?.open) {
      setError("You're not connected to Echo yet. Try again in a moment.");
      return;
    }
    setError('');
    let local: MediaStream;
    try {
      local = await navigator.mediaDevices.getUserMedia(mediaConstraints(kind));
    } catch (mediaError) {
      setError(mediaErrorMessage(mediaError, kind));
      return;
    }
    const session: GroupCallSession = {
      groupId,
      callId,
      kind,
      local,
      startedAt: Date.now(),
      participants: new Set([me.id]),
      media: new Map(),
      waiting: new Map(),
    };
    groupCallRef.current = session;
    setGroupRing(null);
    setGroupCall({ groupId, callId, kind, startedAt: session.startedAt, local, streams: {} });
    // Make sure every online member can hear about the call.
    for (const member of group.members) {
      if (member.id !== me.id && presenceRef.current[member.id]) ensureConnection(member.id, true);
    }
    connectToRoster(session, roster);
    broadcastRoster(session);
  }

  function startGroupCall(groupId: string, kind: CallKind) {
    const existing = invitesRef.current[groupId];
    if (existing) {
      joinGroupCall(groupId);
      return;
    }
    openGroupCall(groupId, kind, newId(), []);
  }

  function joinGroupCall(groupId: string) {
    const invite = invitesRef.current[groupId];
    if (!invite) {
      setError('That call has ended.');
      return;
    }
    if (invite.participants.filter((id) => id !== me.id).length >= MAX_CALL_PARTICIPANTS) {
      setError(`This call is full. Group calls are limited to ${MAX_CALL_PARTICIPANTS} people.`);
      return;
    }
    openGroupCall(groupId, invite.kind, invite.callId, invite.participants);
  }

  function leaveGroupCall() {
    const session = groupCallRef.current;
    if (!session) return;
    groupCallRef.current = null;
    const group = groupOf(session.groupId);
    for (const member of group?.members ?? []) {
      if (member.id !== me.id) sendTo(member.id, { type: 'group-call-leave', groupId: session.groupId, callId: session.callId });
    }
    session.media.forEach((media) => media.close());
    session.local.getTracks().forEach((track) => track.stop());
    session.participants.delete(me.id);
    rememberInvite(
      session.groupId,
      session.participants.size > 0
        ? { callId: session.callId, kind: session.kind, participants: [...session.participants], seenAt: Date.now() }
        : null,
    );
    setGroupCall(null);
    setMuted(false);
    setCameraOff(false);
  }

  function handleIncomingGroupMedia(media: MediaConnection) {
    const { groupId, callId } = (media.metadata ?? {}) as { groupId?: string; callId?: string };
    const session = groupCallRef.current;
    const group = groupId ? groupOf(groupId) : undefined;
    const fits = session && session.media.size < MAX_CALL_PARTICIPANTS - 1;
    if (!session || !group || session.callId !== callId || session.groupId !== groupId || !isMember(group, media.peer) || !fits) {
      media.close();
      return;
    }
    media.answer(session.local);
    wireGroupMedia(session, media.peer, media);
    broadcastRoster(session);
  }

  function receiveGroupCallRoster(peer: string, wire: Extract<WireMessage, { type: 'group-call' }>) {
    const group = groupOf(wire.groupId);
    if (!group || !isMember(group, peer) || !isMember(group, me.id)) return;
    const participants = wire.participants.filter((id) => isMember(group, id));
    const session = groupCallRef.current;
    if (session && session.callId === wire.callId) {
      connectToRoster(session, participants);
      return;
    }
    const known = invitesRef.current[wire.groupId];
    rememberInvite(wire.groupId, { callId: wire.callId, kind: wire.kind, participants, seenAt: Date.now() });
    // Ring once when a call starts in a group, unless this user is already on a call.
    if (!known && !session && !callRef.current && participants.length > 0 && !participants.includes(me.id)) {
      setGroupRing({ groupId: wire.groupId, callId: wire.callId, kind: wire.kind, from: peer });
    }
  }

  function receiveGroupCallLeave(peer: string, groupId: string, callId: string) {
    const session = groupCallRef.current;
    if (session && session.callId === callId) {
      if (session.media.has(peer) || session.participants.has(peer)) dropParticipant(session, peer);
      return;
    }
    const invite = invitesRef.current[groupId];
    if (invite && invite.callId === callId) {
      rememberInvite(groupId, { ...invite, participants: invite.participants.filter((id) => id !== peer) });
    }
    setGroupRing((ring) => (ring && ring.callId === callId && ring.from === peer ? null : ring));
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
      for (const m of history) {
        let seen = seenIds.current.get(m.peer);
        if (!seen) seenIds.current.set(m.peer, (seen = new Set()));
        seen.add(m.id);
        if (isGroupKey(m.peer)) {
          let store = groupStore.current.get(m.peer);
          if (!store) groupStore.current.set(m.peer, (store = new Map()));
          store.set(m.id, m);
        }
      }
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
      refreshPeople(history.filter((m) => !isGroupKey(m.peer)).map((m) => m.peer));
      // Connections that opened before history loaded synced without it; sync again.
      for (const [peer, connection] of connections.current) if (connection.open) sendGroupSync(peer);
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
          const session = groupCallRef.current;
          if (session?.media.has(id)) dropParticipant(session, id);
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
      leaveGroupCall();
      peerRef.current?.destroy();
      peerRef.current = null;
      openConnections.clear();
      pendingConnections.clear();
      setConnected({});
      setRequests([]);
    };
    // The handlers above only read refs and call state setters, so capturing them once is safe.
  }, [me.id]);

  // Ping every open connection and drop the ones that have gone quiet. Also
  // repeat the group call roster and expire call notices nobody repeats.
  useEffect(() => {
    let sinceRoster = 0;
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
      const session = groupCallRef.current;
      if (session) {
        let changed = false;
        for (const [peer, since] of session.waiting) {
          if (session.media.has(peer)) session.waiting.delete(peer);
          else if (now - since > CALL_WAIT_LIMIT_MS) {
            session.waiting.delete(peer);
            session.participants.delete(peer);
            changed = true;
          }
        }
        if (changed) broadcastRoster(session);
      }
      sinceRoster += HEARTBEAT_MS;
      if (sinceRoster >= CALL_ROSTER_EVERY_MS) {
        sinceRoster = 0;
        if (session) broadcastRoster(session);
      }
      for (const [groupId, invite] of Object.entries(invitesRef.current)) {
        if (session?.groupId === groupId) continue;
        if (now - invite.seenAt > CALL_INVITE_STALE_MS) rememberInvite(groupId, null);
      }
      setGroupRing((ring) => (ring && !invitesRef.current[ring.groupId] ? null : ring));
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [me.id]);

  // Keep names, online dots and group membership fresh.
  useEffect(() => {
    const refresh = () => {
      refreshPeople(knownIdsRef.current);
      refreshGroups();
    };
    const interval = setInterval(refresh, PRESENCE_REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [me.id]);

  // A ring for a group call stops after a while.
  useEffect(() => {
    if (!groupRing) return;
    const timer = setTimeout(() => setGroupRing(null), RING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [groupRing]);

  // Opening a contact's conversation connects to them when they're online.
  const selectedOnline = selected ? !!presence[selected] : false;
  useEffect(() => {
    if (selected && selectedOnline && status === 'online' && contactIds.current.has(selected)) {
      ensureConnection(selected, true);
    }
  }, [selected, selectedOnline, status]);

  // Stay connected to online members of your groups, so messages and calls flow and missed messages sync.
  const onlineCoMembers = coMemberIds.filter((id) => presence[id]).join(',');
  useEffect(() => {
    if (status !== 'online' || !onlineCoMembers) return;
    for (const id of onlineCoMembers.split(',')) ensureConnection(id, true);
  }, [onlineCoMembers, status]);

  const conversations = useMemo<Conversation[]>(() => {
    const ids = new Set<string>([
      ...contacts,
      ...Object.keys(messages).filter((key) => !isGroupKey(key)),
      ...Object.keys(connected).filter((id) => connected[id] && contacts.includes(id)),
    ]);
    if (selected && !isGroupKey(selected)) ids.add(selected);
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

  const groupConversations = useMemo<GroupConversation[]>(
    () =>
      groups
        .filter((group) => isMember(group, me.id))
        .map((group) => {
          const key = groupKey(group.id);
          return {
            group,
            key,
            myRole: group.members.find((m) => m.id === me.id)?.role ?? 'member',
            unread: unread[key] ?? 0,
            lastAt: messages[key]?.at(-1)?.sentAt ?? group.createdAt,
            onlineCount: group.members.filter((m) => m.id !== me.id && presence[m.id]).length,
            call: groupCallInvites[group.id] ?? null,
          };
        })
        .sort((a, b) => b.lastAt - a.lastAt),
    [groups, messages, unread, presence, groupCallInvites, me.id],
  );

  return {
    me,
    status,
    error,
    clearError: () => setError(''),
    conversations,
    contactIds: contacts,
    messages,
    requests: requests.map((id): ChatRequest => ({ id, profile: profiles[id] })),
    selected,
    select,
    addContact,
    connect: (peer: string) => ensureConnection(peer),
    send,
    accept,
    decline,
    groups: {
      list: groupConversations,
      presence,
      send: sendGroup,
      create: createGroup,
      addMembers: (groupId: string, memberIds: string[]) =>
        runGroupAction(groupId, () => addGroupMembersAction(groupId, memberIds)),
      removeMember: (groupId: string, userId: string) =>
        runGroupAction(groupId, () => removeGroupMemberAction(groupId, userId)),
      rename: (groupId: string, name: string) => runGroupAction(groupId, () => renameGroupAction(groupId, name)),
      setAdmin: (groupId: string, userId: string, admin: boolean) =>
        runGroupAction(groupId, () => setGroupAdminAction(groupId, userId, admin)),
      leave: (groupId: string) => runGroupAction(groupId, () => leaveGroupAction(groupId)),
    },
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
    groupCalls: {
      active: groupCall,
      ring: groupRing,
      start: startGroupCall,
      join: joinGroupCall,
      leave: leaveGroupCall,
      dismiss: () => setGroupRing(null),
    },
    nameOf: (id: string) => profiles[id]?.displayName ?? 'Someone',
    profileOf: (id: string): Profile | undefined => profiles[id],
  };
}

export type Echo = ReturnType<typeof useEcho>;
