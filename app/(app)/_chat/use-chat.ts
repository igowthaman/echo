'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Peer, type DataConnection } from 'peerjs';
import { loadHistory, openHistory, saveMessage, savePeer, type ChatMessage } from './history';

export type { ChatMessage } from './history';

/** connecting → online; offline when the signalling server can't be reached; taken when another tab holds this ID. */
export type PeerStatus = 'connecting' | 'online' | 'offline' | 'taken';

export type Conversation = {
  peer: string;
  displayName: string;
  connected: boolean;
  unread: number;
  lastAt: number;
};

export type ChatRequest = { peer: string; displayName?: string };

export const MAX_MESSAGE_LENGTH = 4000;

// What travels over a data connection. Everything received is checked
// against this shape: the other side is another person's browser.
type WireMessage =
  | { type: 'hello'; displayName: string }
  | { type: 'chat'; id: string; text: string; sentAt: number };

function parseWire(data: unknown): WireMessage | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type === 'hello' && typeof d.displayName === 'string') {
    return { type: 'hello', displayName: d.displayName.trim().slice(0, 40) };
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

type Pending = { connection: DataConnection; queue: unknown[]; buffer: (data: unknown) => void };

export function useChat(username: string, displayName: string) {
  const peerRef = useRef<Peer | null>(null);
  const connections = useRef(new Map<string, DataConnection>());
  const pending = useRef(new Map<string, Pending>());
  // People this user has accepted or chatted with. Their connections are accepted without asking.
  const known = useRef(new Set<string>());
  const dbRef = useRef<IDBDatabase | null>(null);
  const selectedRef = useRef<string | null>(null);

  const [status, setStatus] = useState<PeerStatus>('connecting');
  const [error, setError] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [requests, setRequests] = useState<ChatRequest[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

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

  function rememberName(peer: string, name: string) {
    const displayName = name || peer;
    setNames((all) => (all[peer] === displayName ? all : { ...all, [peer]: displayName }));
    savePeer(dbRef.current, { peer, displayName });
  }

  function handleData(peer: string, data: unknown) {
    const wire = parseWire(data);
    if (!wire) return;
    if (wire.type === 'hello') {
      rememberName(peer, wire.displayName);
      return;
    }
    addMessage({ id: wire.id, peer, from: 'them', text: wire.text, sentAt: wire.sentAt });
    if (selectedRef.current !== peer) {
      setUnread((counts) => ({ ...counts, [peer]: (counts[peer] ?? 0) + 1 }));
    }
  }

  // Start using a connection: wire up its events and say hello once it opens.
  function attach(connection: DataConnection) {
    const peer = connection.peer;
    const previous = connections.current.get(peer);
    connections.current.set(peer, connection);
    if (previous && previous !== connection) previous.close();
    known.current.add(peer);

    const onOpen = () => {
      setConnected((all) => ({ ...all, [peer]: true }));
      connection.send({ type: 'hello', displayName } satisfies WireMessage);
    };
    connection.on('data', (data) => handleData(peer, data));
    connection.on('close', () => {
      // Ignore a connection that was already replaced by a newer one.
      if (connections.current.get(peer) !== connection) return;
      connections.current.delete(peer);
      setConnected((all) => ({ ...all, [peer]: false }));
    });
    connection.on('error', (connectionError) => setError(connectionError.message));
    if (connection.open) onOpen();
    else connection.on('open', onOpen);
  }

  // Someone else opened a connection to us.
  function handleIncoming(connection: DataConnection) {
    const peer = connection.peer;
    if (known.current.has(peer)) {
      attach(connection);
      return;
    }
    // A stranger: hold what they send until this user accepts.
    pending.current.get(peer)?.connection.close();
    const queue: unknown[] = [];
    const buffer = (data: unknown) => {
      queue.push(data);
      const wire = parseWire(data);
      if (wire?.type === 'hello') {
        setRequests((all) => all.map((r) => (r.peer === peer ? { ...r, displayName: wire.displayName } : r)));
      }
    };
    connection.on('data', buffer);
    connection.on('close', () => {
      if (pending.current.get(peer)?.connection !== connection) return;
      pending.current.delete(peer);
      setRequests((all) => all.filter((r) => r.peer !== peer));
    });
    pending.current.set(peer, { connection, queue, buffer });
    setRequests((all) => (all.some((r) => r.peer === peer) ? all : [...all, { peer }]));
  }

  function accept(peer: string) {
    const request = pending.current.get(peer);
    pending.current.delete(peer);
    setRequests((all) => all.filter((r) => r.peer !== peer));
    if (!request) return;
    request.connection.off('data', request.buffer);
    attach(request.connection);
    request.queue.forEach((data) => handleData(peer, data));
    select(peer);
  }

  function decline(peer: string) {
    const request = pending.current.get(peer);
    pending.current.delete(peer);
    setRequests((all) => all.filter((r) => r.peer !== peer));
    request?.connection.close();
  }

  /** Opens (or reopens) a conversation with a username. Returns false if the input isn't usable. */
  function connectTo(rawUsername: string): boolean {
    const peer = rawUsername.trim().toLowerCase();
    if (!peer) return false;
    if (peer === username) {
      setError("That's your own username.");
      return false;
    }
    const peerClient = peerRef.current;
    if (!peerClient || !peerClient.open) {
      setError("You're not connected to Echo yet. Try again in a moment.");
      return false;
    }
    setError('');
    select(peer);
    if (connections.current.get(peer)?.open) return true;
    attach(peerClient.connect(peer, { reliable: true, serialization: 'json' }));
    return true;
  }

  /** Sends a message. Returns false if the other person isn't connected. */
  function send(peer: string, rawText: string): boolean {
    const text = rawText.trim();
    const connection = connections.current.get(peer);
    if (!text || text.length > MAX_MESSAGE_LENGTH || !connection?.open) return false;
    const message: ChatMessage = { id: newId(), peer, from: 'me', text, sentAt: Date.now() };
    connection.send({ type: 'chat', id: message.id, text, sentAt: message.sentAt } satisfies WireMessage);
    addMessage(message);
    return true;
  }

  // Load this user's history from IndexedDB.
  useEffect(() => {
    let cancelled = false;
    openHistory(username).then(async (db) => {
      if (cancelled || !db) {
        db?.close();
        return;
      }
      dbRef.current = db;
      const history = await loadHistory(db);
      if (cancelled) return;
      history.peers.forEach((p) => known.current.add(p.peer));
      history.messages.forEach((m) => known.current.add(m.peer));
      setNames((current) => ({
        ...Object.fromEntries(history.peers.map((p) => [p.peer, p.displayName])),
        ...current,
      }));
      setMessages((current) => {
        const merged: Record<string, ChatMessage[]> = {};
        const seen = new Set<string>();
        for (const m of [...history.messages, ...Object.values(current).flat()]) {
          const key = `${m.peer}\u0000${m.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          (merged[m.peer] ??= []).push(m);
        }
        Object.values(merged).forEach((list) => list.sort((a, b) => a.sentAt - b.sentAt));
        return merged;
      });
    });
    return () => {
      cancelled = true;
      dbRef.current?.close();
      dbRef.current = null;
    };
  }, [username]);

  // Register with the signalling server under this user's ID.
  useEffect(() => {
    let cancelled = false;
    let idTakenRetries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const openConnections = connections.current;
    const pendingConnections = pending.current;

    const start = () => {
      if (cancelled) return;
      setStatus('connecting');
      // The peer ID is still the username. Step 3 of the architecture plan
      // switches it to the user ID, checked by the server.
      const peer = new Peer(username, signallingOptions());
      peerRef.current = peer;

      peer.on('open', () => {
        idTakenRetries = 0;
        setStatus('online');
        setError('');
      });
      peer.on('connection', handleIncoming);
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
          const who = peerError.message.replace(/^Could not connect to peer /, '');
          setError(`${who} isn't online right now.`);
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
      peerRef.current?.destroy();
      peerRef.current = null;
      openConnections.clear();
      pendingConnections.clear();
      setConnected({});
      setRequests([]);
    };
    // handleIncoming only touches refs and state setters, so capturing it once is safe.
  }, [username]);

  const conversations = useMemo<Conversation[]>(() => {
    const peers = new Set([...Object.keys(messages), ...Object.keys(connected), ...Object.keys(names)]);
    if (selected) peers.add(selected);
    return [...peers]
      .filter((peer) => peer !== username)
      .map((peer) => ({
        peer,
        displayName: names[peer] ?? peer,
        connected: !!connected[peer],
        unread: unread[peer] ?? 0,
        lastAt: messages[peer]?.at(-1)?.sentAt ?? 0,
      }))
      .sort((a, b) => b.lastAt - a.lastAt || a.peer.localeCompare(b.peer));
  }, [messages, connected, names, unread, selected, username]);

  return {
    status,
    error,
    clearError: () => setError(''),
    conversations,
    messages,
    requests,
    selected,
    select,
    connectTo,
    send,
    accept,
    decline,
  };
}
