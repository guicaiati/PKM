/**
 * core.js — Motor base de Trainer's Ledger
 * Contiene: Storage (IndexedDB/localStorage), API (Pokemontcg.io / LocalDB), UI (Renderizado, Modales, Toast)
 */

/* ==========================================
   STORAGE MODULE
   ========================================== */
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

  function generateId(name, setId, number) {
    return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '|' + (setId || '') + '|' + (number || '');
  }

  return {
    async init() {
      await open();
      return this;
    },

    async saveCollection(collectionMap) {
      const items = Object.values(collectionMap).map(c => ({ ...c, id: generateId(c.name, c.setId, c.number) }));
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
      items.forEach(c => { map[generateId(c.name, c.setId, c.number)] = c; });
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
        data: items,
        _type: 'collection'
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

    async updateNamedCollectionData(id, collectionMap) {
      const items = Object.values(collectionMap).map(c => ({ ...c }));
      const saved = JSON.parse(localStorage.getItem('savedCollections') || '[]');
      const item = saved.find(c => c.id === id);
      if (item) { item.data = items; item.savedAt = Date.now(); localStorage.setItem('savedCollections', JSON.stringify(saved)); }
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

    async recoverByName(searchName = '21 7 26') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          const raw = localStorage.getItem(key);
          if (raw && (raw.includes('21 7 26') || raw.includes('21/7/26') || raw.includes('21-7-26') || raw.includes('21_7_26'))) {
            const parsed = JSON.parse(raw);
            const cards = Array.isArray(parsed) ? parsed : (parsed.data || parsed.cards || Object.values(parsed));
            if (Array.isArray(cards) && cards.length > 0) {
              const entry = {
                id: 'col_rec_' + Date.now(),
                name: '21/7/26 (Recuperada)',
                savedAt: Date.now(),
                data: cards
              };
              saved.push(entry);
              localStorage.setItem('savedCollections', JSON.stringify(saved));
              return entry;
            }
          }
        } catch(e) {}
      }

      const currentMap = JSON.parse(localStorage.getItem('userCollection') || '{}');
      const currentCards = Object.values(currentMap);
      if (currentCards.length > 0) {
        const entry = {
          id: 'col_rec_' + Date.now(),
          name: '21/7/26 (Recuperada)',
          savedAt: Date.now(),
          data: currentCards
        };
        saved.push(entry);
        localStorage.setItem('savedCollections', JSON.stringify(saved));
        return entry;
      }

      return null;
    },

    async loadCollectionAsNamed(id) {
      const item = await this.loadNamedCollection(id);
      if (!item) return null;
      const map = {};
      item.data.forEach(c => { map[generateId(c.name, c.setId, c.number)] = c; });
      return map;
    },

    // Saved Decks (localStorage)
    async saveNamedDeck(name, deckData) {
      const saved = JSON.parse(localStorage.getItem('savedDecks') || '[]');
      const entry = {
        id: 'deck_' + Date.now(),
        name: name,
        savedAt: Date.now(),
        data: deckData,
        _type: 'deck'
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

/* ==========================================
   API MODULE
   ========================================== */
const API = (() => {
  const BASE = 'https://api.pokemontcg.io/v2';
  const BATCH = 250;
  let dbReady = false;
  let dbCards = [];

  const STANDARD_SETS_FALLBACK = [
    { id: 'me5', name: 'Pitch Black', series: 'Mega Evolution', total: 0, legalities: { standard: 'Legal' } },
    { id: 'me4', name: 'Chaos Rising', series: 'Mega Evolution', total: 0, legalities: { standard: 'Legal' } },
    { id: 'me3', name: 'Perfect Order', series: 'Mega Evolution', total: 0, legalities: { standard: 'Legal' } },
    { id: 'me2pt5', name: 'Ascended Heroes', series: 'Mega Evolution', total: 0, legalities: { standard: 'Legal' } },
    { id: 'me2', name: 'Phantasmal Flames', series: 'Mega Evolution', total: 0, legalities: { standard: 'Legal' } },
    { id: 'me1', name: 'Mega Evolution', series: 'Mega Evolution', total: 0, legalities: { standard: 'Legal' } },
    { id: 'zsv10pt5', name: 'Black Bolt', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'rsv10pt5', name: 'White Flare', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv10', name: 'Destined Rivals', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv9', name: 'Journey Together', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv8pt5', name: 'Prismatic Evolutions', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv8', name: 'Surging Sparks', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv7', name: 'Stellar Crown', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv6pt5', name: 'Shrouded Fable', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv6', name: 'Twilight Masquerade', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv5', name: 'Temporal Forces', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv4pt5', name: 'Paldean Fates', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv4', name: 'Paradox Rift', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv3pt5', name: '151', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv3', name: 'Obsidian Flames', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv2', name: 'Paldea Evolved', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'sv1', name: 'Scarlet & Violet', series: 'Scarlet & Violet', total: 0, legalities: { standard: 'Legal' } },
    { id: 'swsh12pt5gg', name: 'Crown Zenith Galarian Gallery', series: 'Sword & Shield', total: 0, legalities: { standard: 'Legal' } },
    { id: 'swsh12pt5', name: 'Crown Zenith', series: 'Sword & Shield', total: 0, legalities: { standard: 'Legal' } },
    { id: 'swsh12', name: 'Silver Tempest', series: 'Sword & Shield', total: 0, legalities: { standard: 'Legal' } },
    { id: 'swsh11', name: 'Lost Origin', series: 'Sword & Shield', total: 0, legalities: { standard: 'Legal' } },
    { id: 'swsh10', name: 'Astral Radiance', series: 'Sword & Shield', total: 0, legalities: { standard: 'Legal' } },
    { id: 'swsh9', name: 'Brilliant Stars', series: 'Sword & Shield', total: 0, legalities: { standard: 'Legal' } },
    { id: 'swsh8', name: 'Fusion Strike', series: 'Sword & Shield', total: 0, legalities: { expanded: 'Legal' } },
    { id: 'swsh7', name: 'Evolving Skies', series: 'Sword & Shield', total: 0, legalities: { expanded: 'Legal' } },
    { id: 'swsh6', name: 'Chilling Reign', series: 'Sword & Shield', total: 0, legalities: { expanded: 'Legal' } },
    { id: 'swsh5', name: 'Battle Styles', series: 'Sword & Shield', total: 0, legalities: { expanded: 'Legal' } },
    { id: 'swsh4', name: 'Vivid Voltage', series: 'Sword & Shield', total: 0, legalities: { expanded: 'Legal' } },
    { id: 'swsh3', name: 'Champion\'s Path', series: 'Sword & Shield', total: 0, legalities: { expanded: 'Legal' } },
    { id: 'swsh2', name: 'Rebel Clash', series: 'Sword & Shield', total: 0, legalities: { expanded: 'Legal' } },
    { id: 'swsh1', name: 'Sword & Shield', series: 'Sword & Shield', total: 0, legalities: { expanded: 'Legal' } },
    { id: 'mcd22', name: "McDonald's Collection 2022", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd21', name: "McDonald's Collection 2021", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd19', name: "McDonald's Collection 2019", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd18', name: "McDonald's Collection 2018", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd17', name: "McDonald's Collection 2017", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd16', name: "McDonald's Collection 2016", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd15', name: "McDonald's Collection 2015", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd14', name: "McDonald's Collection 2014", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd12', name: "McDonald's Collection 2012", series: 'Other', total: 0, legalities: {} },
    { id: 'mcd11', name: "McDonald's Collection 2011", series: 'Other', total: 0, legalities: {} },
    { id: 'xy6', name: 'Roaring Skies', series: 'XY', total: 108, legalities: { expanded: 'Legal' } },
  ];

  let nameIndex = new Map();
  let idIndex = new Map();
  let sortedNames = [];
  let spanishMap = null;

  function buildIndexes() {
    nameIndex.clear();
    idIndex.clear();
    const nameSet = new Set();
    for (const c of dbCards) {
      if (c.id) idIndex.set(c.id, c);
      if (c.name) {
        const key = c.name.toLowerCase();
        if (!nameIndex.has(key)) nameIndex.set(key, []);
        nameIndex.get(key).push(c);
        nameSet.add(c.name);
      }
    }
    sortedNames = [...nameSet].sort((a, b) => a.localeCompare(b));
  }

  function parseQuery(raw) {
    const t = raw.trim();
    if (t.match(/^[a-z0-9]+-\d+[a-z]?$/i)) return { id: t };
    if (t.includes('set.id:') || t.includes('number:')) return { raw: t };
    const m = t.match(/^(.*?)\s+(\d+)([a-z]?)$/i);
    if (m) return { name: m[1].trim(), number: m[2] + m[3] };
    return { name: t };
  }

  async function loadSpanishMap() {
    if (spanishMap) return spanishMap;
    try {
      const res = await fetch('data/spanishNames.json');
      if (res.ok) spanishMap = await res.json();
    } catch {}
    if (!spanishMap) spanishMap = {};
    const rev = {};
    for (const [es, en] of Object.entries(spanishMap)) {
      const el = en.toLowerCase();
      if (es.toLowerCase() !== el && !rev[el]) rev[el] = en;
    }
    UI.setReverseNameMap(rev);
    return spanishMap;
  }

  function translateToEnglish(name) {
    if (!spanishMap) return name;
    const key = name.toLowerCase();
    return spanishMap[key] || name;
  }

  let lastFetch = 0;
  const FETCH_DELAY = 600;

  async function fetchJSON(url, retries = 3) {
    const now = Date.now();
    const wait = Math.max(0, FETCH_DELAY - (now - lastFetch));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastFetch = Date.now();
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        if (retries > 0) {
          const backoff = (4 - retries) * 3000;
          console.warn(`Rate limited, retrying in ${backoff}ms...`);
          await new Promise(r => setTimeout(r, backoff));
          return fetchJSON(url, retries - 1);
        }
        throw new Error('Rate limited');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      if (retries > 0 && !err.message.includes('429') && !err.message.includes('Rate limited')) {
        await new Promise(r => setTimeout(r, 1500));
        return fetchJSON(url, retries - 1);
      }
      throw err;
    }
  }

  async function fetchAPICards(parsed, pageSize) {
    const q = parsed.raw || (parsed.id ? `id:${parsed.id}` : `name:"${parsed.name}"${parsed.number ? ' number:' + parsed.number : ''}`);
    try {
      const data = await fetchJSON(`${BASE}/cards?q=${encodeURIComponent(q)}&pageSize=${pageSize}`);
      let results = data.data || [];
      if (!results.length && parsed.number && parsed.name) {
        const fb = await fetchJSON(`${BASE}/cards?q=${encodeURIComponent('name:"' + parsed.name + '"')}&pageSize=${pageSize}`);
        results = fb.data || [];
      }
      return results;
    } catch { return []; }
  }

  async function downloadAllCardsFromSet(setId) {
    let all = [], page = 1, hasMore = true;
    while (hasMore) {
      let data;
      try {
        data = await fetchJSON(`${BASE}/cards?q=set.id:${setId}&pageSize=${BATCH}&page=${page}&select=id,name,set,number,images,supertype,types,subtypes,rarity,hp,evolvesFrom,attacks,abilities,weaknesses,resistances,retreatCost,text,rules,convertedRetreatCost`);
      } catch (err) {
        console.warn(`Error downloading set ${setId} page ${page}:`, err.message);
        break;
      }
      const cards = data.data || [];
      all = all.concat(cards.map(c => ({
        id: c.id || '', name: c.name || '', number: c.number || '',
        setId: c.set?.id || setId, set: c.set ? { id: c.set.id, name: c.set.name } : null,
        images: c.images ? { small: c.images.small } : null,
        supertype: c.supertype || '', types: c.types || [], subtypes: c.subtypes || [],
        rarity: c.rarity || '', hp: c.hp || '', evolvesFrom: c.evolvesFrom || '',
        attacks: (c.attacks || []).map(a => ({
          name: a.name || '', cost: a.cost || [], convertedEnergyCost: a.convertedEnergyCost || 0,
          damage: a.damage || '', text: a.text || ''
        })),
        abilities: (c.abilities || []).map(a => ({ name: a.name || '', text: a.text || '', type: a.type || '' })),
        weaknesses: (c.weaknesses || []).map(w => ({ type: w.type || '', value: w.value || '' })),
        resistances: (c.resistances || []).map(r => ({ type: r.type || '', value: r.value || '' })),
        retreatCost: c.retreatCost || [],
        convertedRetreatCost: c.convertedRetreatCost || 0,
        text: c.text && c.text.length > 0 ? c.text : (c.rules || [])
      })));
      if (cards.length < BATCH) hasMore = false; else page++;
    }
    return all;
  }

  let hardcodedSetsData = null;

  async function loadHardcodedSets() {
    if (hardcodedSetsData) return hardcodedSetsData;
    try {
      const res = await fetch('data/hardcodedSets.json');
      if (res.ok) hardcodedSetsData = (await res.json()).sets || [];
    } catch { hardcodedSetsData = []; }
    return hardcodedSetsData;
  }

  async function downloadHardcodedSet(setId) {
    const sets = await loadHardcodedSets();
    const set = sets.find(s => s.id === setId);
    if (set) {
      const cards = set.cards.map(c => ({ ...c, images: c.images || null }));
      if (cards.length > 0) await Storage.appendCardDbCards(cards);
      await Storage.saveSetMeta({ id: set.id, name: set.name, series: set.series || 'Other', total: set.total });
      for (const c of cards) {
        const idx = dbCards.findIndex(x => x.id === c.id);
        if (idx >= 0) dbCards[idx] = c; else dbCards.push(c);
      }
      buildIndexes();
      return cards.length;
    }

    try {
      const res = await fetch(`data/${setId}.json`);
      if (!res.ok) return 0;
      const cards = await res.json();
      if (!cards.length) return 0;
      await Storage.appendCardDbCards(cards);
      await Storage.saveSetMeta({ id: setId, name: cards[0]?.set?.name || setId, series: cards[0]?.set?.series || 'Other', total: cards.length });
      for (const c of cards) {
        const idx = dbCards.findIndex(x => x.id === c.id);
        if (idx >= 0) dbCards[idx] = c; else dbCards.push(c);
      }
      buildIndexes();
      return cards.length;
    } catch { return 0; }
  }

  return {
    isDbReady() { return dbReady; },
    getDbSize() { return dbCards.length; },

    async loadLocalDb() {
      const count = await Storage.cardDbCount();
      if (count > 0) {
        dbCards = await Storage.loadCardDb();
        buildIndexes();
        dbReady = true;
        await loadSpanishMap();
        return true;
      }
      try {
        const hcSets = await loadHardcodedSets();
        if (hcSets && hcSets.length > 0) {
          for (const set of hcSets) {
            if (set.id) await downloadHardcodedSet(set.id);
          }
        } else {
          await downloadHardcodedSet('swsh6');
          await downloadHardcodedSet('xy6');
        }
      } catch (e) { console.warn('Auto seed failed:', e); }

      dbCards = await Storage.loadCardDb();
      buildIndexes();
      dbReady = dbCards.length > 0;
      await loadSpanishMap();
      return dbReady;
    },

    async downloadStandardSets(onProgress) {
      let allSets = [];
      try {
        const setsData = await fetchJSON(`${BASE}/sets?orderBy=-releaseDate&pageSize=200`);
        allSets = (setsData.data || []).filter(s => s.legalities?.standard === 'Legal' || s.legalities?.expanded === 'Legal' || s.id.startsWith('mcd'));
        await Storage.saveSetsListCache(allSets.map(s => ({ id: s.id, name: s.name, series: s.series, total: s.total })));
      } catch {
        allSets = await Storage.loadSetsListCache() || STANDARD_SETS_FALLBACK;
      }

      const hcSets = await loadHardcodedSets();
      for (const hc of hcSets) {
        if (!allSets.find(s => s.id === hc.id)) {
          allSets.push({ id: hc.id, name: hc.name, series: hc.series || 'Other', total: hc.total, hardcoded: true });
        }
      }

      const downloaded = await Storage.loadAllSetMeta();
      const downloadedIds = new Set(downloaded.map(s => s.id));
      const toDownload = allSets.filter(s => !downloadedIds.has(s.id));

      if (!toDownload.length) {
        dbReady = true;
        if (onProgress) onProgress({ phase: 'done', msg: 'Todos los sets Standard ya están descargados.' });
        return { newSets: 0, totalCards: dbCards.length };
      }

      let totalNew = 0;
      for (let i = 0; i < toDownload.length; i++) {
        const set = toDownload[i];
        if (onProgress) onProgress({ phase: 'downloading', msg: `${set.name} (${i + 1}/${toDownload.length})...`, setNum: i + 1, setTotal: toDownload.length });
        try {
          const n = set.hardcoded ? await downloadHardcodedSet(set.id) : await downloadAllCardsFromSet(set.id).then(cards => {
            if (cards.length > 0) Storage.appendCardDbCards(cards);
            Storage.saveSetMeta(set);
            for (const c of cards) { const idx = dbCards.findIndex(x => x.id === c.id); if (idx >= 0) dbCards[idx] = c; else dbCards.push(c); }
            return cards.length;
          });
          totalNew += n;
        } catch (err) {
          console.warn(`Failed: ${set.name}`, err);
        }
      }

      buildIndexes();
      dbReady = true;
      if (onProgress) onProgress({ phase: 'done', msg: `Descarga completa. ${totalNew} cartas nuevas.` });
      return { newSets: toDownload.length, totalCards: dbCards.length };
    },

    async downloadSingleSet(setId, onProgress) {
      const hcCount = await downloadHardcodedSet(setId);
      if (hcCount > 0) {
        dbReady = true;
        if (onProgress) onProgress({ phase: 'done', msg: `Hardcoded set: ${hcCount} cartas.` });
        return hcCount;
      }

      const setData = await fetchJSON(`${BASE}/sets/${setId}`);
      const set = setData.data;
      if (!set) throw new Error('Set no encontrado');
      if (onProgress) onProgress({ phase: 'downloading', msg: `Descargando ${set.name}...` });

      await Storage.removeCardsBySetId(setId);
      dbCards = dbCards.filter(c => c.setId !== setId);

      const cards = await downloadAllCardsFromSet(setId);
      if (cards.length > 0) await Storage.appendCardDbCards(cards);
      await Storage.saveSetMeta(set);
      for (const c of cards) dbCards.push(c);

      buildIndexes();
      if (onProgress) onProgress({ phase: 'done', msg: `${set.name}: ${cards.length} cartas.` });
      return cards.length;
    },

    async refreshAllSetsFullData(onProgress) {
      const downloaded = await Storage.loadAllSetMeta();
      if (!downloaded.length) return false;

      const total = downloaded.length;
      for (let i = 0; i < total; i++) {
        const set = downloaded[i];
        if (onProgress) onProgress({ phase: 'refreshing', msg: `Actualizando ${set.name} (${i + 1}/${total})...`, setNum: i + 1, setTotal: total });
        try {
          const cards = await downloadAllCardsFromSet(set.id);
          if (cards.length > 0) {
            dbCards = dbCards.filter(c => c.setId !== set.id);
            await Storage.appendCardDbCards(cards);
            for (const c of cards) dbCards.push(c);
          }
        } catch (err) {
          console.warn(`Refresh failed: ${set.name}`, err);
        }
      }
      buildIndexes();
      await Storage.saveSetting('fullDataRefresh_v1', true);
      if (onProgress) onProgress({ phase: 'done', msg: 'Actualización completa. Todas las cartas tienen info de ataques/efectos.' });
      return true;
    },

    async checkForNewSets() {
      const data = await fetchJSON(`${BASE}/sets?orderBy=-releaseDate&pageSize=200`);
      const latest = (data.data || []).filter(s => s.legalities?.standard === 'Legal' || s.id.startsWith('mcd'));
      const downloaded = await Storage.loadAllSetMeta();
      const ids = new Set(downloaded.map(s => s.id));
      return latest.filter(s => !ids.has(s.id));
    },

    async getStandardSetsStatus() {
      let downloaded = [];
      try {
        downloaded = (await Storage.loadAllSetMeta()) || [];
      } catch (e) {
        console.warn('loadAllSetMeta error:', e);
      }
      const downloadedMap = {};
      (downloaded || []).forEach(s => { if (s && s.id) downloadedMap[s.id] = s; });

      let allSets = [];
      try {
        allSets = (await Storage.loadSetsListCache()) || [];
      } catch (e) {}

      if (!allSets || allSets.length === 0) {
        try {
          const data = await fetchJSON(`${BASE}/sets?orderBy=-releaseDate&pageSize=200`);
          allSets = (data && data.data) ? data.data : [];
          if (allSets.length > 0) {
            await Storage.saveSetsListCache(allSets.map(s => ({ id: s.id, name: s.name, series: s.series, total: s.total, legalities: s.legalities })));
          }
        } catch (e) {
          allSets = STANDARD_SETS_FALLBACK || [];
        }
      }
      if (!allSets || allSets.length === 0) {
        allSets = STANDARD_SETS_FALLBACK || [];
      }

      try {
        const hcSets = (await loadHardcodedSets()) || [];
        for (const hc of (hcSets || [])) {
          if (hc && hc.id && !allSets.find(s => s && s.id === hc.id)) {
            allSets.push({ id: hc.id, name: hc.name, series: hc.series || 'Other', total: hc.total, legalities: hc.legalities || {}, hardcoded: true });
          }
        }
      } catch (e) {
        console.warn('hcSets error:', e);
      }

      const isStandard = s => s && s.legalities?.standard === 'Legal';
      const isExpanded = s => s && (s.legalities?.expanded === 'Legal' && !isStandard(s));
      const isMcd = s => s && (s.id || '').startsWith('mcd');

      return (allSets || []).map(s => {
        if (!s) return null;
        return {
          id: s.id,
          name: s.name || s.id,
          series: s.series || 'Other',
          total: s.total || 0,
          hardcoded: !!s.hardcoded,
          format: isMcd(s) ? 'mcd' : isStandard(s) ? 'standard' : isExpanded(s) ? 'expanded' : 'other',
          downloaded: !!downloadedMap[s.id],
          cardCount: downloadedMap[s.id] ? (dbCards || []).filter(c => c && c.setId === s.id).length : 0
        };
      }).filter(Boolean);
    },

    async searchCards(rawQuery, pageSize = 20) {
      const parsed = parseQuery(rawQuery);

      if (dbReady && !parsed.raw) {
        if (parsed.id) {
          const match = idIndex.get(parsed.id);
          return match ? [match] : [];
        }

        const key = parsed.name.toLowerCase();
        let results = nameIndex.get(key) || [];

        if (results.length === 0) {
          await loadSpanishMap();
          const englishName = translateToEnglish(parsed.name);
          if (englishName.toLowerCase() !== key) {
            results = nameIndex.get(englishName.toLowerCase()) || [];
          }
        }

        if (results.length === 0) {
          await loadSpanishMap();
          const translatedKey = translateToEnglish(parsed.name).toLowerCase();
          for (const card of dbCards) {
            const cardName = (card.name || '').toLowerCase();
            if (cardName.includes(key) || cardName.includes(translatedKey)) {
              results.push(card);
              if (results.length >= pageSize * 3) break;
            }
          }
        }

        if (parsed.number) results = results.filter(c => c.number === parsed.number);

        if (results.length > 0) return results.slice(0, pageSize);

        try {
          const apiResults = await fetchAPICards(parsed, pageSize);
          if (apiResults.length > 0) return apiResults;
        } catch {}
      }

      return fetchAPICards(parsed, pageSize);
    },

    autocomplete(partial) {
      if (!partial || partial.length < 2) return [];
      const q = partial.toLowerCase();
      const results = [];
      const seen = new Set();

      // 1. Search in User Collection first so owned cards like Cinderace always appear
      if (typeof Collection !== 'undefined' && Collection.getCards) {
        const userCards = Collection.getCards();
        userCards.forEach(c => {
          if (c.name && c.name.toLowerCase().includes(q) && !seen.has(c.name)) {
            seen.add(c.name);
            results.push(c.name);
          }
        });
      }

      // 2. Search in IndexedDB database
      if (dbReady) {
        let lo = 0, hi = sortedNames.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (sortedNames[mid].toLowerCase().localeCompare(q) < 0) lo = mid + 1;
          else hi = mid;
        }
        for (let i = lo; i < sortedNames.length && results.length < 12; i++) {
          if (!sortedNames[i].toLowerCase().includes(q)) break;
          if (!seen.has(sortedNames[i])) {
            seen.add(sortedNames[i]);
            results.push(sortedNames[i]);
          }
        }
        return results;
      }

      return fetchJSON(`${BASE}/cards?q=name:${encodeURIComponent(partial)}&pageSize=8&select=name`)
        .then(d => {
          const apiNames = (d.data || []).map(c => c.name);
          apiNames.forEach(n => { if (!seen.has(n)) { seen.add(n); results.push(n); } });
          return results;
        })
        .catch(() => results);
    },

    fetchThumb(cardName) {
      if (dbReady) {
        const key = cardName.toLowerCase();
        const cards = nameIndex.get(key);
        if (cards && cards[0]) return cards[0].images?.small || null;
      }
      return null;
    },

    async downloadHardcodedSet(setId) {
      const n = await downloadHardcodedSet(setId);
      if (n > 0) dbReady = true;
      return n;
    },

    findCardInDb(name) {
      if (!name) return null;
      const target = name.toLowerCase().trim();
      if (idIndex && idIndex.has(target)) return idIndex.get(target);
      if (nameIndex && nameIndex.has(target)) {
        const list = nameIndex.get(target);
        if (list && list.length > 0) return list[0];
      }
      const exactMatch = (dbCards || []).find(c => (c.name || '').toLowerCase().trim() === target);
      if (exactMatch) return exactMatch;
      return (dbCards || []).find(c => (c.name || '').toLowerCase().includes(target)) || null;
    },

    getDbCards() {
      return dbCards || [];
    },

    async fetchFromAPI(name) {
      try {
        const data = await fetchJSON(`${BASE}/cards?q=name:"${name}"&pageSize=3`);
        return data.data || [];
      } catch { return []; }
    }
  };
})();

/* ==========================================
   UI MODULE
   ========================================== */
const UI = (() => {
  const TYPE_BORDER = {
    Fire: 't-fire', Water: 't-water', Grass: 't-grass', Lightning: 't-lightning',
    Psychic: 't-psychic', Fighting: 't-fighting', Darkness: 't-darkness',
    Metal: 't-metal', Colorless: 't-colorless', Dragon: 't-dragon'
  };

  const TYPE_ES = { Fire: 'Fuego', Water: 'Agua', Grass: 'Planta', Lightning: 'Rayo', Psychic: 'Psíquico', Fighting: 'Lucha', Darkness: 'Oscuridad', Metal: 'Metal', Colorless: 'Incoloro', Dragon: 'Dragón', Fairy: 'Hada' };

  const TYPE_CHAR = {
    Fire: 'r', Water: 'w', Grass: 'g', Lightning: 'l',
    Psychic: 'p', Fighting: 'f', Darkness: 'd', Metal: 'm',
    Dragon: 'n', Colorless: 'c', Fairy: 'y'
  };

  function getEnergySymbol(type, plainText = false) {
    if (!type) return '';
    const esName = TYPE_ES[type] || type;
    if (plainText) return esName;
    const char = TYPE_CHAR[type] || TYPE_CHAR[esName] || '';
    const fontIcon = char ? `<span class="tcg-sym">${char}</span>` : '';
    return `${fontIcon}${esName}`;
  }

  const TCG_EN_TO_ES = {
    'Active Pokémon': 'Pokémon Activo',
    'Benched Pokémon': 'Pokémon en Banca',
    'Defending Pokémon': 'Pokémon Defensor',
    'Prize card': 'Carta de Premio',
    'Prize cards': 'Cartas de Premio',
    'Stage 1': 'Nivel 1',
    'Stage 2': 'Nivel 2',
    'Technical Machine': 'Máquina Técnica',
    'Knocked Out': 'Fuera de Juego',
    'Energy card': 'Carta de Energía',
    'Energy cards': 'Cartas de Energía',
    'Supporter': 'Soporte',
    'Stadium': 'Estadio',
    'Prize': 'Premio',
    'Active': 'Activo',
    'Item': 'Objeto',
    'Tool': 'Herramienta',
    'Fire': 'Fuego',
    'Water': 'Agua',
    'Grass': 'Planta',
    'Lightning': 'Rayo',
    'Psychic': 'Psíquico',
    'Fighting': 'Lucha',
    'Darkness': 'Oscuridad',
    'Metal': 'Metal',
    'Colorless': 'Incoloro',
    'Dragon': 'Dragón',
    'Fairy': 'Hada',
    'Energy': 'Energía',
    'Pokémon': 'Pokémon',
    'ACE SPEC': 'ACE SPEC',
    'Confused': 'Confuso',
    'Asleep': 'Dormido',
    'Paralyzed': 'Paralizado',
    'Poisoned': 'Envenenado',
    'Burned': 'Quemado',
    'Weakness': 'Debilidad',
    'Resistance': 'Resistencia',
    'Retreat': 'Retirada',
    'Basic': 'Básica',
    'Bench': 'Banca',
  };
  const _tcgSorted = Object.keys(TCG_EN_TO_ES).sort((a, b) => b.length - a.length);
  const _tcgKeep = new Set(['EX', '-ex', 'VMAX', 'VSTAR', 'GX', 'HP']);

  const _transCache = {};
  async function translateText(text) {
    if (!text || !text.trim()) return text;
    if (_transCache[text]) return _transCache[text];
    let wip = text;
    for (const term of _tcgSorted) {
      const es = TCG_EN_TO_ES[term];
      if (!es) continue;
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      wip = wip.replace(re, es);
    }
    for (const keep of _tcgKeep) {
      const re = new RegExp(keep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      wip = wip.replace(re, `\u200B${keep}\u200B`);
    }
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(wip)}&langpair=en|es`);
      const data = await res.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        let t = data.responseData.translatedText;
        for (const keep of _tcgKeep) {
          const re = new RegExp(`[\u200B\\s\\S]{0,5}${keep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\u200B\\s\\S]{0,5}`, 'g');
          t = t.replace(re, keep);
        }
        _transCache[text] = t;
        return t;
      }
    } catch (e) { console.warn('Translation failed:', e); }
    for (const keep of _tcgKeep) {
      const ph = `\u200B${keep}\u200B`;
      while (wip.includes(ph)) wip = wip.replace(ph, keep);
    }
    return wip;
  }

  async function translateRules(rules) {
    if (!rules || rules.length === 0) return [];
    const results = await Promise.all(rules.map(r => translateText(r)));
    return results;
  }

  const RARITY_ES = { 'Common': 'Común', 'Uncommon': 'Poco Común', 'Rare': 'Raro', 'Double Rare': 'Doble Raro', 'Ultra Rare': 'Ultra Raro', 'Illustration Rare': 'Ilustración Rara', 'Special Illustration Rare': 'Ilustración Especial Rara', 'Hyper Rare': 'Hiper Raro', 'Rare Holo': 'Raro Holográfico', 'Rare Holo EX': 'Raro Holo EX', 'Rare Holo GX': 'Raro Holo GX', 'Rare V': 'Raro V', 'Rare VMAX': 'Raro VMAX', 'Rare VSTAR': 'Raro VSTAR', 'Amazing Rare': 'Raro Increíble', 'Promo': 'Promo' };

  let _reverseNameMap = null;
  function setReverseNameMap(m) { _reverseNameMap = m; }

  function cardNameDisplay(enName) {
    if (!enName) return '';
    const rev = _reverseNameMap;
    if (!rev) return enName;
    const esName = rev[enName.toLowerCase()];
    if (esName && esName.toLowerCase() !== enName.toLowerCase()) return enName + ' <span class="name-sub">(' + esName + ')</span>';
    return enName;
  }

  function cardNamePlain(enName) {
    if (!enName) return '';
    const rev = _reverseNameMap;
    if (!rev) return enName;
    const esName = rev[enName.toLowerCase()];
    if (esName && esName.toLowerCase() !== enName.toLowerCase()) return enName + ' (' + esName + ')';
    return enName;
  }

  function typeClass(card) {
    if (!card) return 't-colorless';
    const supertype = card.supertype || card.category || '';
    if (supertype === 'Trainer') return 't-trainer';
    if (supertype === 'Energy') return 't-energy';
    const t = card.types && card.types[0];
    return TYPE_BORDER[t] || 't-colorless';
  }

  async function loadCachedImage(imgEl, cardId, apiUrl) {
    if (!apiUrl || !cardId) return;
    try {
      const cached = await Storage.getCachedImage(cardId);
      if (cached && cached.image) {
        imgEl.src = cached.image;
        return;
      }
    } catch(e) {}
    imgEl.src = apiUrl;
    imgEl.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = imgEl.naturalWidth;
        canvas.height = imgEl.naturalHeight;
        canvas.getContext('2d').drawImage(imgEl, 0, 0);
        const dataUrl = canvas.toDataURL('image/webp', 0.8);
        await Storage.cacheImage(cardId, dataUrl);
      } catch(e) {}
    };
  }

  return {
    typeClass,

    renderCard(card, opts = {}) {
      const div = document.createElement('div');
      div.className = 'pkcard ' + typeClass(card);
      let qtyHTML = '';
      if (opts.showQty) {
        qtyHTML = `
          <div class="qty-row">
            <div class="qty-controls">
              <button class="dec">&minus;</button>
              <span>${card.count || 1}</span>
              <button class="inc">+</button>
            </div>
            <button class="ghost remove-btn">Quitar</button>
            <button class="ghost photo-btn" title="Agregar foto">📷</button>
          </div>`;
      }
      if (opts.showAdd) {
        const owned = opts.owned || 0;
        if (owned > 0) {
          qtyHTML = `<div class="card-add-owned-row">
            <span class="card-owned-tag">✔ Tengo ${owned}</span>
            <button class="ghost add-btn">+ Agregar</button>
          </div>`;
        } else {
          qtyHTML = `<button class="ghost add-btn btn-full">+ Agregar</button>`;
        }
      }
      const typeColor = { Fire: 'fire', Water: 'water', Grass: 'grass', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Colorless: 'colorless', Dragon: 'dragon', Fairy: 'dragon' };
      const tcVar = typeColor[card.types && card.types[0]] || 'colorless';
      const initial = (card.name || '?')[0].toUpperCase();
      const placeholder = `<div class="card-placeholder cd-badge-${tcVar}">${initial}</div>`;
      div.innerHTML = `
        ${card.image ? `<img src="" alt="${card.name}" loading="lazy"/>` : placeholder}
        <div class="meta">
          <div class="name-row"><span class="name">${cardNameDisplay(card.name)}</span><button class="ghost card-info-btn" title="Qué hace esta carta"><span class="tcg-sym">?</span></button></div>
          <div class="set">${card.set || ''}</div>
          ${card.number ? `<div class="card-info">#${card.number}</div>` : ''}
          ${qtyHTML}
        </div>`;
      if (card.image) {
        const imgEl = div.querySelector('img');
        loadCachedImage(imgEl, card.id || card.name, card.image);
      }
      const infoBtn = div.querySelector('.card-info-btn');
      if (infoBtn) {
        infoBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          UI.showLoading(cardNamePlain(card.name));
          const explanation = await UI.getCardExplanationAsync(card);
          if (explanation) UI.showModal(cardNamePlain(card.name), explanation);
        });
      }
      return div;
    },

    renderGrid(container, cards, opts = {}) {
      container.innerHTML = '';
      if (cards.length === 0) {
        if (opts.emptyMsg) {
          container.innerHTML = `<div class="empty">${opts.emptyMsg}</div>`;
        }
        return;
      }
      cards.forEach(card => {
        const el = this.renderCard(card, opts);
        if (opts.onAdd) {
          const btn = el.querySelector('.add-btn');
          if (btn) btn.addEventListener('click', () => opts.onAdd(card));
        }
        if (opts.onInc) {
          const btn = el.querySelector('.inc');
          if (btn) btn.addEventListener('click', () => opts.onInc(card));
        }
        if (opts.onDec) {
          const btn = el.querySelector('.dec');
          if (btn) btn.addEventListener('click', () => opts.onDec(card));
        }
        if (opts.onRemove) {
          const btn = el.querySelector('.remove-btn');
          if (btn) btn.addEventListener('click', () => opts.onRemove(card));
        }
        container.appendChild(el);
      });
    },

    renderStats(container, stats) {
      container.innerHTML = stats.map(s =>
        `<div class="stat-box">
          <div class="stat-label">${s.label}</div>
          <div class="stat-value">${s.value}</div>
        </div>`
      ).join('');
    },

    renderDeckCard(row, card) {
      const owned = card.owned || 0;
      const needed = card.need || card.qty || 1;
      const missing = Math.max(0, needed - owned);
      const explainBtn = card.explanation ? `<button class="dc-explain" title="Por qué esta carta">ⓘ</button>` : '';
      const collectionLabel = card.collectionName ? `<span class="dc-collection" title="Colección de origen">${card.collectionName}</span>` : '';
      const rowEl = document.createElement('div');
      rowEl.className = 'deck-card-row';
      const typeColor = { Fire: 'fire', Water: 'water', Grass: 'grass', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Colorless: 'colorless', Dragon: 'dragon', Fairy: 'dragon' };
      const tcVar = typeColor[card.types && card.types[0]] || 'colorless';
      const initial = (card.name || '?')[0].toUpperCase();
      const placeholder = `<div class="card-placeholder" style="background:var(--${tcVar});color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;">${initial}</div>`;
      
      let imgUrl = card.image || card.imageUrl || (card.images && (card.images.small || card.images.large)) || '';
      if (!imgUrl && card.name && API.fetchThumb) {
        imgUrl = API.fetchThumb(card.name) || (API.translateToEnglish ? API.fetchThumb(API.translateToEnglish(card.name)) : '') || '';
      }
      if (!imgUrl && card.name && API.findCardInDb) {
        const dbMatch = API.findCardInDb(card.name) || (API.translateToEnglish ? API.findCardInDb(API.translateToEnglish(card.name)) : null);
        if (dbMatch) {
          imgUrl = dbMatch.imageUrl || (dbMatch.images && (dbMatch.images.small || dbMatch.images.large)) || dbMatch.image || '';
        }
      }

      rowEl.innerHTML = `
        ${imgUrl ? `<img src="" alt="${card.name}" loading="lazy"/>` : placeholder}
        <div class="dc-info">
          <div class="dc-name">${cardNameDisplay(card.name)}${collectionLabel}</div>
          <div class="dc-set">${card.set || ''}</div>
        </div>
        <div class="dc-qty">x${needed}</div>
        <div class="dc-owned ${missing > 0 ? 'missing' : 'ok'}">
          ${missing > 0 ? `Faltan ${missing}` : `✔ ${owned}/${needed}`}
        </div>
        ${explainBtn}`;
      if (imgUrl) {
        const imgEl = rowEl.querySelector('img');
        if (imgEl) loadCachedImage(imgEl, card.id || card.name, imgUrl);
      }
      rowEl.style.cursor = 'pointer';
      return rowEl;
    },

    renderDeckSection(container, title, cards) {
      const total = cards.reduce((s, c) => s + (c.need || c.qty || 1), 0);
      container.innerHTML = `
        <div class="section-header">
          <span class="section-title">${title}</span>
          <span class="section-count">${total} cartas</span>
        </div>
        <div class="deck-card-list"></div>`;
      const list = container.querySelector('.deck-card-list');
      cards.forEach(c => list.appendChild(this.renderDeckCard(null, c)));
    },

    renderBuyList(container, items) {
      if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty">No necesitás comprar nada. ¡Tenés todo!</div>';
        return;
      }
      container.innerHTML = items.map(item => {
        const evoWarning = item.type === 'missing-evo' ? '<span class="evo-warning" title="Pokémon necesita su básico para poder usarlo">⚠️ Falta pre-evolución</span>' : '';
        return `
        <div class="list-item ${item.type === 'missing-evo' ? 'list-item-evo' : ''}">
          <span class="li-name">${item.name} ${evoWarning}</span>
          <span class="li-qty">x${item.qty}</span>
        </div>`;
      }).join('');
    },

    renderRemoveList(container, items) {
      if (!items || items.length === 0) {
        container.innerHTML = '<div class="empty">No hay cartas para eliminar.</div>';
        return;
      }
      container.innerHTML = items.map(item => `
        <div class="list-item">
          <span class="li-name">${item.name}</span>
          <span class="li-qty">x${item.qty}</span>
          <span class="li-reason">${item.reason || ''}</span>
        </div>`).join('');
    },

    renderScore(container, scores, total) {
      const labels = {
        consistency: 'Consistencia', speed: 'Velocidad', power: 'Potencia',
        recovery: 'Recuperación', competitiveness: 'Competitividad', cost: 'Costo'
      };
      container.innerHTML = Object.entries(scores).map(([k, v]) => `
        <div class="score-item">
          <div class="score-label">${labels[k] || k}</div>
          <div class="score-val">${v}</div>
        </div>`).join('');
      const totalEl = document.getElementById('scoreTotal');
      if (totalEl) totalEl.textContent = total + ' / 100';
    },

    renderCompatibility(container, items) {
      container.innerHTML = items.map(item => `
        <div class="compat-row">
          <span class="cr-icon">${item.compatible ? '✔' : '✖'}</span>
          <span class="cr-name">${item.name}</span>
          <span class="cr-pct" style="color:${item.compatible ? 'var(--grass)' : 'var(--fire)'}">${item.pct}%</span>
        </div>`).join('');
    },

    async getCardExplanation(card) {
      const sup = card.supertype || '';
      const abilities = card.abilities || (card.ability ? [card.ability] : []);
      const attacks = card.attacks || [];
      const cardText = card.text && card.text.length > 0 ? card.text : (card.rules || []);
      const hp = card.hp || 0;
      const type = (card.types && card.types[0]) || 'Colorless';
      const subs = card.subtypes || [];
      const evoFrom = card.evolvesFrom || '';
      const hasRealData = attacks.length > 0 || abilities.length > 0 || cardText.length > 0;

      if (sup === 'Energy') {
        if (hasRealData) return await this._energyDetailHTML(card, cardText);
        const typeLabel = TYPE_ES[type] || type;
        const typeIcons = { Fire: 'r', Water: 'w', Grass: 'g', Lightning: 'l', Psychic: 'p', Fighting: 'f', Darkness: 'd', Metal: 'm', Colorless: 'c', Dragon: 'n', Fairy: 'y' };
        const typeVar = { Fire: 'fire', Water: 'water', Grass: 'grass', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Colorless: 'colorless', Dragon: 'dragon', Fairy: 'dragon' };
        const typeChar = typeIcons[type] || 'c';
        let badgeLabel = subs.includes('Basic') ? 'Básica' : 'Especial';
        return '<div class="card-detail"><div class="cd-header"><span class="cd-type-badge" style="background:var(--' + (typeVar[type] || 'colorless') + ')"><span class="tcg-sym" style="margin-right:4px;font-size:12px;">' + typeChar + '</span>' + typeLabel + '</span><span class="cd-subtype" style="font-size:10px;">' + badgeLabel + '</span></div><div class="cd-section"><div class="cd-section-title">Efecto</div><div class="cd-trainer-text">Energía ' + badgeLabel.toLowerCase() + ' de tipo ' + typeLabel + '.</div></div></div>';
      }

      if (sup === 'Trainer') {
        if (hasRealData) return await this._trainerDetailHTML(card, cardText);
        const isSupporter = subs.includes('Supporter');
        const isTool = subs.includes('Tool');
        const isStadium = subs.includes('Stadium');
        let tag = isSupporter ? 'Soporte' : isTool ? 'Herramienta' : isStadium ? 'Estadio' : 'Objeto';
        return '<div class="card-detail"><div class="cd-header"><span class="cd-type-badge" style="background:var(--holo-c)">' + tag + '</span></div><div class="cd-section"><div class="cd-section-title">Efecto</div><div class="cd-trainer-text">Carta de Trainer — ' + tag + '.</div></div></div>';
      }

      if (sup === 'Pokémon') {
        if (hasRealData) return await this._pokemonDetailHTML(card);
        const typeLabel = TYPE_ES[type] || type;
        let info = 'Pokémon de tipo ' + typeLabel;
        if (hp) info += ' — HP ' + hp;
        if (evoFrom) info += ' — Evoluciona de ' + evoFrom;
        return info + '.';
      }

      return '';
    },

    async getCardExplanationAsync(card) {
      const attacks = card.attacks || [];
      const abilities = card.abilities || [];
      const cardText = card.text && card.text.length > 0 ? card.text : (card.rules || []);
      const hasRealData = attacks.length > 0 || abilities.length > 0 || cardText.length > 0;
      if (hasRealData) return await this.getCardExplanation(card);

      function enrichCard(source) {
        card.attacks = source.attacks || [];
        card.abilities = source.abilities || [];
        card.text = source.text && source.text.length > 0 ? source.text : (source.rules || []);
        card.weaknesses = source.weaknesses || [];
        card.resistances = source.resistances || [];
        card.retreatCost = source.retreatCost || [];
        card.convertedRetreatCost = source.convertedRetreatCost || 0;
        if (source.hp) card.hp = parseInt(source.hp, 10);
        if (source.types) card.types = source.types;
        if (source.subtypes) card.subtypes = source.subtypes;
        if (source.evolvesFrom) card.evolvesFrom = source.evolvesFrom;
        if (source.rarity) card.rarity = source.rarity;
        if (!card.number && source.number) card.number = source.number;
        if (source.images?.small && !card.image) card.image = source.images.small;
      }

      function hasCardData(c) {
        return (c.attacks && c.attacks.length > 0) || (c.abilities && c.abilities.length > 0) ||
          (c.text && c.text.length > 0) || (c.rules && c.rules.length > 0);
      }

      try {
        let full = null;
        if (card.id && !card.id.includes('|')) {
          const byId = await API.searchCards(card.id, 1);
          if (byId.length > 0 && hasCardData(byId[0])) full = byId[0];
        }
        if (!full) {
          const query = card.number ? card.name + ' ' + card.number : card.name;
          const results = await API.searchCards(query, 5);
          const match = results.find(r => {
            const rName = (r.name || '').toLowerCase();
            const cName = (card.name || '').toLowerCase();
            return (rName === cName || rName.includes(cName) || cName.includes(rName)) && hasCardData(r);
          });
          if (match) full = match;
        }
        if (full) enrichCard(full);
      } catch (e) { console.warn('getCardExplanationAsync fetch failed:', e); }
      return await this.getCardExplanation(card);
    },

    async _pokemonDetailHTML(card) {
      const subs = card.subtypes || [];
      const isEx = subs.some(s => /ex/i.test(s));
      const hp = card.hp || 0;
      const type = (card.types && card.types[0]) || 'Colorless';
      const abilities = card.abilities || [];
      const attacks = card.attacks || [];
      const weaknesses = card.weaknesses || [];
      const resistances = card.resistances || [];
      const retreatN = card.convertedRetreatCost || (card.retreatCost || []).length;
      const evoFrom = card.evolvesFrom || '';
      const rarity = card.rarity || '';

      let html = '<div class="card-detail">';
      const typeIcons = { Fire: 'r', Water: 'w', Grass: 'g', Lightning: 'l', Psychic: 'p', Fighting: 'f', Darkness: 'd', Metal: 'm', Colorless: 'c', Dragon: 'n', Fairy: 'y' };
      const typeVar = { Fire: 'fire', Water: 'water', Grass: 'grass', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Colorless: 'colorless', Dragon: 'dragon', Fairy: 'dragon' };
      const typeChar = typeIcons[type] || 'c';
      const typeLabel = TYPE_ES[type] || type;

      html += '<div class="cd-header"><span class="cd-type-badge cd-badge-' + (typeVar[type] || 'colorless') + '"><span class="tcg-sym">' + typeChar + '</span>' + typeLabel + '</span>';
      if (isEx) html += '<span class="cd-subtype ex"><span class="tcg-sym">-ex</span></span>';
      html += '</div>';

      if (hp) html += '<div class="cd-stat"><span class="cd-label">HP</span><span class="cd-value">' + hp + '</span></div>';
      if (rarity) html += '<div class="cd-stat"><span class="cd-label">Rareza</span><span class="cd-value">' + (RARITY_ES[rarity] || rarity) + '</span></div>';
      if (evoFrom) {
        html += '<div class="cd-stat"><span class="cd-label">Evoluciona de</span><span class="cd-value">' + evoFrom + '</span></div>';
      } else {
        html += '<div class="cd-stat"><span class="cd-label">Evolución</span><span class="cd-value">Sin pre-evolución (Básico)</span></div>';
      }
      if (retreatN > 0) html += '<div class="cd-stat"><span class="cd-label">Coste de retirada</span><span class="cd-value">' + '<span class="cost-colorless"><span class="tcg-sym">c</span></span>'.repeat(retreatN) + '</span></div>';

      if (abilities.length > 0) {
        html += '<div class="cd-section"><div class="cd-section-title">Habilidades</div>';
        for (const a of abilities) {
          html += '<div class="cd-ability"><span class="cd-ability-name">' + (a.name || '') + '</span>';
          if (a.text) {
            const tr = (await translateRules([a.text]))[0];
            html += '<span class="cd-ability-text">' + tr + '</span>';
            if (tr !== a.text) html += '<span class="cd-ability-text cd-text-original">' + a.text + '</span>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

      if (attacks.length > 0) {
        html += '<div class="cd-section"><div class="cd-section-title">Ataques</div>';
        for (const a of attacks) {
          const costArr = a.cost || [];
          let costStr = costArr.length === 0 ? '<span class="cost-free">⬤</span>' : costArr.map(c => `<span class="tcg-sym">${typeIcons[c]||'c'}</span>`).join(' ');
          html += '<div class="cd-attack"><div class="cd-attack-header"><span class="cd-attack-name">' + (a.name || '') + '</span><span class="cd-attack-cost">' + costStr + '</span></div>';
          if (a.damage) html += '<div class="cd-attack-damage">' + a.damage + '</div>';
          if (a.text) {
            const tr = (await translateRules([a.text]))[0];
            html += '<div class="cd-attack-text">' + tr + '</div>';
            if (tr !== a.text) html += '<div class="cd-attack-text cd-text-original">' + a.text + '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

      if (weaknesses.length > 0) {
        html += '<div class="cd-section"><div class="cd-section-title">Debilidades</div>';
        for (const w of weaknesses) {
          const wType = w.type || 'Colorless';
          const wChar = typeIcons[wType] || 'c';
          const wLabel = TYPE_ES[wType] || wType;
          html += '<div class="cd-weakness cd-badge-' + (typeVar[wType] || 'colorless') + '"><span class="tcg-sym">' + wChar + '</span> ' + wLabel + ' ' + (w.value || '') + '</div>';
        }
        html += '</div>';
      }

      if (resistances.length > 0) {
        html += '<div class="cd-section"><div class="cd-section-title">Resistencias</div>';
        for (const r of resistances) {
          const rType = r.type || 'Colorless';
          const rChar = typeIcons[rType] || 'c';
          const rLabel = TYPE_ES[rType] || rType;
          html += '<div class="cd-resistance cd-badge-' + (typeVar[rType] || 'colorless') + '"><span class="tcg-sym">' + rChar + '</span> ' + rLabel + ' ' + (r.value || '') + '</div>';
        }
        html += '</div>';
      }

      html += '</div>';
      return html;
    },

    async _trainerDetailHTML(card, cardText) {
      const subs = card.subtypes || [];
      const isSupporter = subs.includes('Supporter');
      let badgeLabel = isSupporter ? 'Soporte' : 'Trainer';
      let html = '<div class="card-detail"><div class="cd-header"><span class="cd-type-badge cd-badge-trainer">' + badgeLabel + '</span></div>';
      if (cardText.length > 0) {
        const translated = await translateRules(cardText);
        html += '<div class="cd-section"><div class="cd-section-title">Efecto</div>';
        translated.forEach(t => { html += '<div class="cd-trainer-text">' + t + '</div>'; });
        html += '</div>';
      }
      html += '</div>';
      return html;
    },

    async _energyDetailHTML(card, cardText) {
      let html = '<div class="card-detail"><div class="cd-header"><span class="cd-type-badge cd-badge-energy">Energía</span></div>';
      if (cardText.length > 0) {
        const translated = await translateRules(cardText);
        html += '<div class="cd-section"><div class="cd-section-title">Efecto</div>';
        translated.forEach(t => { html += '<div class="cd-trainer-text">' + t + '</div>'; });
        html += '</div>';
      }
      html += '</div>';
      return html;
    },

    showLoading(title) {
      const modal = document.getElementById('cardModal');
      const body = document.getElementById('modalBody');
      body.innerHTML = `<h3>${title}</h3><div class="card-detail"><div class="cd-section cd-loading-text">Cargando info de la carta...</div></div>`;
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
      }
    },

    showModal(title, content) {
      const modal = document.getElementById('cardModal');
      const body = document.getElementById('modalBody');
      const isHTML = typeof content === 'string' && content.trim().startsWith('<');
      body.innerHTML = `<h3>${title}</h3>${isHTML ? content : `<p>${content}</p>`}`;
      if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
      }
    },

    hideModal() {
      const modal = document.getElementById('cardModal');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
      }
    },

    toast(msg, type = 'info') {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      container.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    },

    setStatus(el, msg, isError = false) {
      if (!el) return;
      el.textContent = msg;
      el.classList.toggle('err', isError);
    },

    cardNamePlain,
    setReverseNameMap,
    getEnergySymbol
  };
})();
