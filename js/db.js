(function (SW) {
  'use strict';

  const DB_NAME = 'swriter';
  const STORE = 'projects';
  const LS_KEY = 'swriter:projects';
  let dbPromise = null;

  function idbAvailable() {
    return typeof indexedDB !== 'undefined' && typeof window !== 'undefined' && !!window.indexedDB;
  }

  function open() {
    if (!idbAvailable()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      let req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) {
        dbPromise = null;
        resolve(null);
        return;
      }
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
    return dbPromise;
  }

  function lsGet() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function lsSet(list) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(list));
    } catch (e) { /* storage full or unavailable */ }
  }

  function all() {
    return open().then(function (db) {
      if (!db) return lsGet();
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readonly');
        const rq = tx.objectStore(STORE).getAll();
        rq.onsuccess = function () { resolve(rq.result || []); };
        rq.onerror = function () { reject(rq.error); };
      });
    });
  }

  function put(p) {
    return open().then(function (db) {
      if (!db) {
        const list = lsGet();
        const i = list.findIndex(function (x) { return x.id === p.id; });
        if (i >= 0) list[i] = p; else list.push(p);
        lsSet(list);
        return;
      }
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(p);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function del(id) {
    return open().then(function (db) {
      if (!db) {
        lsSet(lsGet().filter(function (x) { return x.id !== id; }));
        return;
      }
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function bulkPut(list) {
    return open().then(function (db) {
      if (!db) {
        const merged = [];
        for (const p of list) {
          const i = merged.findIndex(function (x) { return x.id === p.id; });
          if (i >= 0) merged[i] = p; else merged.push(p);
        }
        lsSet(merged);
        return;
      }
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        for (const p of list) store.put(p);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  SW.db = { all: all, put: put, del: del, bulkPut: bulkPut };
})(window.SW = window.SW || {});
