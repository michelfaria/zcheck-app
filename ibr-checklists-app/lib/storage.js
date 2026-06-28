/**
 * Zchek — Storage Layer (SSR-safe)
 * Uses IndexedDB on the client, no-op on the server.
 */

let idbStore = null;

async function getStore() {
  if (typeof window === 'undefined') return null; // SSR guard
  if (idbStore) return idbStore;
  try {
    const { createStore } = await import('idb-keyval');
    idbStore = createStore('ibr-db', 'ibr-store');
    return idbStore;
  } catch {
    return null;
  }
}

export async function storageGet(key) {
  if (typeof window === 'undefined') throw new Error('SSR: no storage');
  const store = await getStore();
  if (store) {
    const { get } = await import('idb-keyval');
    const value = await get(key, store);
    if (value === undefined) throw new Error('not found: ' + key);
    return { key, value };
  }
  const value = localStorage.getItem(key);
  if (value === null) throw new Error('not found: ' + key);
  return { key, value };
}

export async function storageSet(key, value) {
  if (typeof window === 'undefined') return { key, value }; // SSR no-op
  const store = await getStore();
  if (store) {
    const { set } = await import('idb-keyval');
    await set(key, value, store);
  } else {
    localStorage.setItem(key, value);
  }
  return { key, value };
}
