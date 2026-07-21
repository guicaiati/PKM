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

  // Search indexes — built once on load
  let nameIndex = new Map();
  let idIndex = new Map();
  let sortedNames = [];
  let spanishMap = null; // lazy loaded

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
      return false;
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
      const downloaded = await Storage.loadAllSetMeta();
      const downloadedMap = {};
      downloaded.forEach(s => { downloadedMap[s.id] = s; });

      let allSets = await Storage.loadSetsListCache() || [];
      if (allSets.length === 0) {
        try {
          const data = await fetchJSON(`${BASE}/sets?orderBy=-releaseDate&pageSize=200`);
          allSets = data.data || [];
          await Storage.saveSetsListCache(allSets.map(s => ({ id: s.id, name: s.name, series: s.series, total: s.total, legalities: s.legalities })));
        } catch {
          allSets = STANDARD_SETS_FALLBACK;
        }
      }

      const hcSets = await loadHardcodedSets();
      for (const hc of hcSets) {
        if (!allSets.find(s => s.id === hc.id)) {
          allSets.push({ id: hc.id, name: hc.name, series: hc.series || 'Other', total: hc.total, legalities: hc.legalities || {}, hardcoded: true });
        }
      }

      const isStandard = s => s.legalities?.standard === 'Legal';
      const isExpanded = s => (s.legalities?.expanded === 'Legal' && !isStandard(s));
      const isMcd = s => (s.id || '').startsWith('mcd');

      return allSets.map(s => ({
        id: s.id,
        name: s.name,
        series: s.series,
        total: s.total,
        hardcoded: !!s.hardcoded,
        format: isMcd(s) ? 'mcd' : isStandard(s) ? 'standard' : isExpanded(s) ? 'expanded' : 'other',
        downloaded: !!downloadedMap[s.id],
        cardCount: downloadedMap[s.id] ? dbCards.filter(c => c.setId === s.id).length : 0
      }));
    },

    async searchCards(rawQuery, pageSize = 20) {
      const parsed = parseQuery(rawQuery);

      if (dbReady && !parsed.raw) {
        // ID search — O(1)
        if (parsed.id) {
          const match = idIndex.get(parsed.id);
          return match ? [match] : [];
        }

        // Name search — try original first, then translate Spanish→English
        const key = parsed.name.toLowerCase();
        let results = nameIndex.get(key) || [];

        if (results.length === 0) {
          // Try Spanish translation
          await loadSpanishMap();
          const englishName = translateToEnglish(parsed.name);
          if (englishName.toLowerCase() !== key) {
            results = nameIndex.get(englishName.toLowerCase()) || [];
          }
        }

        // Partial match fallback (also try translated name)
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

        // API fallback
        try {
          const apiResults = await fetchAPICards(parsed, pageSize);
          if (apiResults.length > 0) return apiResults;
        } catch {}
      }

      return fetchAPICards(parsed, pageSize);
    },

    autocomplete(partial) {
      if (!partial || partial.length < 2) return [];
      if (dbReady) {
        const q = partial.toLowerCase();
        const results = [];
        // Binary search for start point in sorted names
        let lo = 0, hi = sortedNames.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (sortedNames[mid].toLowerCase().localeCompare(q) < 0) lo = mid + 1;
          else hi = mid;
        }
        // Collect matches from sorted position
        const seen = new Set();
        for (let i = lo; i < sortedNames.length && results.length < 8; i++) {
          if (!sortedNames[i].toLowerCase().includes(q)) break;
          if (!seen.has(sortedNames[i])) {
            seen.add(sortedNames[i]);
            results.push(sortedNames[i]);
          }
        }
        return results;
      }
      // API fallback
      return fetchJSON(`${BASE}/cards?q=name:${encodeURIComponent(partial)}&pageSize=5&select=name`)
        .then(d => [...new Set((d.data || []).map(c => c.name))])
        .catch(() => []);
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

    async fetchFromAPI(name) {
      try {
        const data = await fetchJSON(`${BASE}/cards?q=name:"${name}"&pageSize=3`);
        return data.data || [];
      } catch { return []; }
    }
  };
})();
