// Chat history lives only in this browser (IndexedDB), one database per
// user ID. Messages never go to the server. If IndexedDB isn't available
// (some private windows), chat still works without history.

export type ChatMessage = {
  id: string;
  /** The other person's user ID, or "g:<groupId>" for a group conversation. */
  peer: string;
  from: 'me' | 'them';
  /** Who wrote it. Set on group messages, which can come from any member. */
  author?: string;
  text: string;
  sentAt: number;
};

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function openHistory(userId: string): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const request = indexedDB.open(`echo-history:${userId}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('messages', { keyPath: ['peer', 'id'] }).createIndex('peer', 'peer');
    };
    return await done(request);
  } catch {
    return null;
  }
}

export async function loadMessages(db: IDBDatabase): Promise<ChatMessage[]> {
  try {
    return await done(db.transaction('messages', 'readonly').objectStore('messages').getAll() as IDBRequest<ChatMessage[]>);
  } catch {
    return [];
  }
}

export function saveMessage(db: IDBDatabase | null, message: ChatMessage): void {
  if (!db) return;
  try {
    db.transaction('messages', 'readwrite').objectStore('messages').put(message);
  } catch {
    // History is a convenience; a failed write shouldn't break the chat.
  }
}
