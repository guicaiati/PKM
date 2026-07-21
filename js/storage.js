const Storage = (() => {
  const DB_NAME = 'TrainersLedger';
  const DB_VERSION = 7;
  const STORES = {
    collection: 'collection',
    archetypes: 'archetypes',
    metaCache: 'metaCache',
    searchCache: 'searchCache',
    settings: 'settings',
    cardDb: 'cardDb',
    setMeta: 'setMeta',
    cardImages: 'cardImages'
  };

  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (db) {
        if (db.objectStoreNames.contains('cardImages')) return resolve(db);
        db.close();
        db = null;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORES.collection)) d.createObjectStore(STORES.collection, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORES.archetypes)) d.createObjectStore(STORES.archetypes, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORES.metaCache)) d.createObjectStore(STORES.metaCache, { keyPath: 'key' });
        if (!d.objectStoreNames.contains(STORES.searchCache)) d.createObjectStore(STORES.searchCache, { keyPath: 'key' });
        if (!d.objectStoreNames.contains(STORES.settings)) d.createObjectStore(STORES.settings, { keyPath: 'key' });
        if (!d.objectStoreNames.contains(STORES.cardDb)) {
          const store = d.createObjectStore(STORES.cardDb, { keyPath: 'id' });
          store.createIndex('name', 'name');
          store.createIndex('setId', 'setId');
        }
        if (!d.objectStoreNames.contains(STORES.setMeta)) d.createObjectStore(STORES.setMeta, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORES.cardImages)) d.createObjectStore(STORES.cardImages, { keyPath: 'id' });
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeName, mode) { return db.transaction(storeName, mode).objectStore(storeName); }

  function getAll(storeName) {
    return new Promise(async (resolve, reject) => {
      await open();
      const req = tx(storeName, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function get(storeName, key) {
    return new Promise(async (resolve, reject) => {
      await open();
      const req = tx(storeName, 'readonly').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function put(storeName, value) {
    return new Promise(async (resolve, reject) => {
      await open();
      const req = tx(storeName, 'readwrite').put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function putAll(storeName, items) {
    return new Promise(async (resolve, reject) => {
      await open();
      const store = tx(storeName, 'readwrite');
      items.forEach(item => store.put(item));
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  function remove(storeName, key) {
    return new Promise(async (resolve, reject) => {
      await open();
      const req = tx(storeName, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function clear(storeName) {
    return new Promise(async (resolve, reject) => {
      await open();
      const req = tx(storeName, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  function generateId(name, setId) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + (setId || '');
  }

  return {
    async init() {
      await open();
      return this;
    },

    async saveCollection(collectionMap) {
      const items = Object.values(collectionMap).map(c => ({ ...c, id: generateId(c.name, c.setId) }));
      await open();
      return new Promise((resolve, reject) => {
        const store = db.transaction(STORES.collection, 'readwrite').objectStore(STORES.collection);
        store.clear();
        items.forEach(item => store.put(item));
        store.transaction.oncomplete = () => resolve();
        store.transaction.onerror = () => reject(store.transaction.error);
      });
    },

    async loadCollection() {
      const items = await getAll(STORES.collection);
      const map = {};
      items.forEach(c => { map[generateId(c.name, c.setId)] = c; });
      return map;
    },

    async saveArchetypes(archetypes) {
      const items = archetypes.map((a, i) => ({ ...a, id: a.id || 'arch_' + i + '_' + Date.now() }));
      await clear(STORES.archetypes);
      if (items.length > 0) await putAll(STORES.archetypes, items);
    },

    async loadArchetypes() { return await getAll(STORES.archetypes); },

    async saveMetaCache(data) {
      await put(STORES.metaCache, { key: 'meta', data, expiry: Date.now() + 3600000 });
    },

    async loadMetaCache() {
      const item = await get(STORES.metaCache, 'meta');
      if (!item || Date.now() > item.expiry) { if (item) await remove(STORES.metaCache, 'meta'); return null; }
      return item.data;
    },

    async saveSearchCache(query, results) {
      await put(STORES.searchCache, { key: query.toLowerCase().trim(), data: results, expiry: Date.now() + 3600000 });
    },

    async loadSearchCache(query) {
      const item = await get(STORES.searchCache, query.toLowerCase().trim());
      if (!item || Date.now() > item.expiry) { if (item) await remove(STORES.searchCache, query.toLowerCase().trim()); return null; }
      return item.data;
    },

    async saveSetting(key, value) { await put(STORES.settings, { key, value }); },
    async loadSetting(key) { const item = await get(STORES.settings, key); return item ? item.value : null; },

    async saveSetsListCache(sets) { await put(STORES.settings, { key: '__setsListCache', value: sets, cachedAt: Date.now() }); },
    async loadSetsListCache() {
      const item = await get(STORES.settings, '__setsListCache');
      if (!item) return null;
      if (Date.now() - item.cachedAt > 86400000) { await remove(STORES.settings, '__setsListCache'); return null; }
      return item.value;
    },

    async clearAll() {
      await clear(STORES.collection);
      await clear(STORES.archetypes);
      await clear(STORES.metaCache);
      await clear(STORES.searchCache);
    },

    // Card DB methods
    async saveCardDbCards(cards) {
      if (cards.length > 0) await putAll(STORES.cardDb, cards);
    },

    async appendCardDbCards(cards) {
      if (cards.length > 0) await putAll(STORES.cardDb, cards);
    },

    async loadCardDb() { return await getAll(STORES.cardDb); },

    async cardDbCount() {
      await open();
      return new Promise((resolve) => {
        const req = tx(STORES.cardDb, 'readonly').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
    },

    async removeCardsBySetId(setId) {
      await open();
      return new Promise((resolve) => {
        const store = tx(STORES.cardDb, 'readwrite');
        const index = store.index('setId');
        const req = index.openCursor(IDBKeyRange.only(setId));
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { cursor.delete(); cursor.continue(); }
          else resolve();
        };
        req.onerror = () => resolve();
      });
    },

    // Set metadata methods
    async saveSetMeta(setData) {
      await put(STORES.setMeta, { id: setData.id, name: setData.name, total: setData.total, updatedAt: setData.updatedAt, downloadedAt: Date.now() });
    },

    async loadSetMeta(setId) { return await get(STORES.setMeta, setId); },

    async loadAllSetMeta() { return await getAll(STORES.setMeta); },

    async clearSetMeta() { await clear(STORES.setMeta); },

    // Card image cache methods
    async cacheImage(cardId, imageData) {
      await put(STORES.cardImages, { id: cardId, image: imageData, cachedAt: Date.now() });
    },

    async getCachedImage(cardId) {
      return await get(STORES.cardImages, cardId);
    },

    async hasCachedImage(cardId) {
      await open();
      return new Promise((resolve) => {
        const req = tx(STORES.cardImages, 'readonly').get(cardId);
        req.onsuccess = () => resolve(!!req.result);
        req.onerror = () => resolve(false);
      });
    },

    async clearImageCache() { await clear(STORES.cardImages); },

    async imageCacheSize() {
      await open();
      return new Promise((resolve) => {
        const req = tx(STORES.cardImages, 'readonly').count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
    },

    generateId,

    // Saved Collections (localStorage for reliability)
    async saveNamedCollection(name, collectionMap) {
      const items = Object.values(collectionMap).map(c => ({ ...c }));
      const saved = JSON.parse(localStorage.getItem('savedCollections') || '[]');
      const entry = {
        id: 'col_' + Date.now(),
        name: name,
        savedAt: Date.now(),
        data: items
      };
      saved.push(entry);
      localStorage.setItem('savedCollections', JSON.stringify(saved));
      console.log('Saved collection:', name, items.length, 'cards');
      return entry.id;
    },

    async loadNamedCollections() {
      return JSON.parse(localStorage.getItem('savedCollections') || '[]');
    },

    async loadNamedCollection(id) {
      const saved = JSON.parse(localStorage.getItem('savedCollections') || '[]');
      return saved.find(c => c.id === id) || null;
    },

    async renameNamedCollection(id, newName) {
      const saved = JSON.parse(localStorage.getItem('savedCollections') || '[]');
      const item = saved.find(c => c.id === id);
      if (item) { item.name = newName; localStorage.setItem('savedCollections', JSON.stringify(saved)); }
    },

    async deleteNamedCollection(id) {
      let saved = JSON.parse(localStorage.getItem('savedCollections') || '[]');
      saved = saved.filter(c => c.id !== id);
      localStorage.setItem('savedCollections', JSON.stringify(saved));
    },

    async loadCollectionAsNamed(id) {
      const item = await this.loadNamedCollection(id);
      if (!item) return null;
      const map = {};
      item.data.forEach(c => { map[generateId(c.name, c.setId)] = c; });
      return map;
    },

    // Saved Decks (localStorage)
    async saveNamedDeck(name, deckData) {
      const saved = JSON.parse(localStorage.getItem('savedDecks') || '[]');
      const entry = {
        id: 'deck_' + Date.now(),
        name: name,
        savedAt: Date.now(),
        data: deckData
      };
      saved.push(entry);
      localStorage.setItem('savedDecks', JSON.stringify(saved));
      console.log('Saved deck:', name);
      return entry.id;
    },

    async loadNamedDecks() {
      return JSON.parse(localStorage.getItem('savedDecks') || '[]');
    },

    async loadNamedDeck(id) {
      const saved = JSON.parse(localStorage.getItem('savedDecks') || '[]');
      return saved.find(d => d.id === id) || null;
    },

    async renameNamedDeck(id, newName) {
      const saved = JSON.parse(localStorage.getItem('savedDecks') || '[]');
      const item = saved.find(d => d.id === id);
      if (item) { item.name = newName; localStorage.setItem('savedDecks', JSON.stringify(saved)); }
    },

    async deleteNamedDeck(id) {
      let saved = JSON.parse(localStorage.getItem('savedDecks') || '[]');
      saved = saved.filter(d => d.id !== id);
      localStorage.setItem('savedDecks', JSON.stringify(saved));
    }
  };
})();
