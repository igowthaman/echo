// Chat history lives only in this browser (IndexedDB), one database per
// logged-in user. Messages never go to the server. If IndexedDB isn't
// available (some private windows), chat still works without history.

export type ChatMessage = {
  id: string;
  peer: string;
  from: 'me' | 'them';
  text: string;
  sentAt: number;
};

export type SavedPeer = { peer: string; displayName: string };

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function openHistory(owner: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const request = indexedDB.open(`echo-chat:${owner}`, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('messages', { keyPath: ['peer', 'id'] }).createIndex('peer', 'peer');
      db.createObjectStore('peers', { keyPath: 'peer' });
    };
    return await done(request);
  } catch {
    return null;
  }
}

export async function loadHistory(db: IDBDatabase): Promise<{ peers: SavedPeer[]; messages: ChatMessage[] }> {
  try {
    const tx = db.transaction(['peers', 'messages'], 'readonly');
    const [peers, messages] = await Promise.all([
      done(tx.objectStore('peers').getAll() as IDBRequest<SavedPeer[]>),
      done(tx.objectStore('messages').getAll() as IDBRequest<ChatMessage[]>),
    ]);
    return { peers, messages };
  } catch {
    return { peers: [], messages: [] };
  }
}

function put(db: IDBDatabase | null, store: 'messages' | 'peers', value: ChatMessage | SavedPeer) {
  if (!db) return;
  try {
    db.transaction(store, 'readwrite').objectStore(store).put(value);
  } catch {
    // History is a convenience; a failed write shouldn't break the chat.
  }
}

export const saveMessage = (db: IDBDatabase | null, message: ChatMessage) => put(db, 'messages', message);
export const savePeer = (db: IDBDatabase | null, peer: SavedPeer) => put(db, 'peers', peer);
