const Collection = (() => {
  let data = {};
  let currentCollectionName = '';

  function getStats() {
    const items = Object.values(data);
    const totalCards = items.reduce((s, c) => s + (c.count || 0), 0);
    const pokemon = items.filter(c => c.supertype === 'Pokémon');
    const trainers = items.filter(c => c.supertype === 'Trainer');
    const energies = items.filter(c => c.supertype === 'Energy');
    return {
      totalCards,
      uniqueCards: items.length,
      pokemon: pokemon.reduce((s, c) => s + c.count, 0),
      trainers: trainers.reduce((s, c) => s + c.count, 0),
      energies: energies.reduce((s, c) => s + c.count, 0)
    };
  }

  function renderStats() {
    const stats = getStats();
    UI.renderStats(document.getElementById('collectionStats'), [
      { label: 'Total', value: stats.totalCards },
      { label: 'Pokémon', value: stats.pokemon },
      { label: 'Trainer', value: stats.trainers },
      { label: 'Energy', value: stats.energies },
      { label: 'Únicas', value: stats.uniqueCards }
    ]);
  }

  function applyFilters() {
    const typeFilter = document.getElementById('collectionFilterType').value;
    const elemFilter = document.getElementById('collectionFilterElement').value;
    const sortBy = document.getElementById('collectionSort').value;
    const nameSearch = document.getElementById('collectionSearch').value.toLowerCase();

    let items = Object.values(data);

    if (typeFilter !== 'all') items = items.filter(c => c.supertype === typeFilter);
    if (elemFilter !== 'all') items = items.filter(c => c.types && c.types.includes(elemFilter));
    if (nameSearch) items = items.filter(c => c.name.toLowerCase().includes(nameSearch));

    switch (sortBy) {
      case 'copies-desc': items.sort((a, b) => (b.count || 0) - (a.count || 0)); break;
      case 'copies-asc': items.sort((a, b) => (a.count || 0) - (b.count || 0)); break;
      case 'date': items.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)); break;
      default: items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return items;
  }

  function render() {
    renderStats();
    const items = applyFilters();
    const grid = document.getElementById('collectionGrid');
    const empty = document.getElementById('collectionEmpty');

    if (items.length === 0) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = '';
    items.forEach(c => {
      try {
        const el = UI.renderCard(c, { showQty: true });
        el.querySelector('.inc').addEventListener('click', () => { c.count++; save(); render(); });
        el.querySelector('.dec').addEventListener('click', () => { c.count = Math.max(0, c.count - 1); if (c.count === 0) delete data[Storage.generateId(c.name, c.setId)]; save(); render(); });
        el.querySelector('.remove-btn').addEventListener('click', () => { delete data[Storage.generateId(c.name, c.setId)]; save(); render(); });
        el.querySelector('.photo-btn')?.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async () => {
              const dataUrl = reader.result;
              const cardId = c.id || Storage.generateId(c.name, c.setId);
              await Storage.cacheImage(cardId, dataUrl);
              c.image = dataUrl;
              const dbCardId = c.id;
              if (dbCardId) {
                const db = await Storage.init().then(() => Storage.loadCardDb());
                const match = db.find(x => x.id === dbCardId);
                if (match) { match.image = dataUrl; await Storage.appendCardDbCards([match]); }
              }
              UI.toast('Foto guardada', 'success');
              render();
            };
            reader.readAsDataURL(file);
          };
          input.click();
        });
        el.querySelector('.card-info-btn')?.addEventListener('click', async () => {
          try {
            UI.showLoading(UI.cardNamePlain(c.name));
            const before = JSON.stringify(c.attacks || []) + JSON.stringify(c.abilities || []) + JSON.stringify(c.text || []);
            const explanation = await UI.getCardExplanationAsync(c);
            const after = JSON.stringify(c.attacks || []) + JSON.stringify(c.abilities || []) + JSON.stringify(c.text || []);
            if (before !== after) save();
            if (explanation) UI.showModal(UI.cardNamePlain(c.name), explanation);
            else UI.showModal(UI.cardNamePlain(c.name), 'Info no disponible.');
          } catch (e) { console.warn('Error getting card info:', e); UI.showModal(UI.cardNamePlain(c.name), 'Info no disponible.'); }
        });
        el.querySelector('.card-info-btn')?.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          try {
            const key = Storage.generateId(c.name, c.setId);
            UI.showEditableModal(UI.cardNamePlain(c.name), c, async (updated) => {
              Object.assign(data[key] || c, {
                hp: updated.hp, rarity: updated.rarity,
                weaknesses: updated.weaknesses, resistances: updated.resistances,
                retreatCost: updated.retreatCost, convertedRetreatCost: updated.convertedRetreatCost,
                abilities: updated.abilities, attacks: updated.attacks, text: updated.text
              });
              await save();
              render();
              UI.toast('Carta actualizada', 'success');
            });
          } catch (e2) { console.warn('Error:', e2); }
        });
        grid.appendChild(el);
      } catch (e) { console.warn('Error rendering card:', c.name, e); }
    });
  }

  async function save() {
    await Storage.saveCollection(data);
    if (currentCollectionName) {
      const saved = await Storage.loadNamedCollections();
      const entry = saved.find(c => c.name === currentCollectionName);
      if (entry) {
        entry.data = Object.values(data).map(c => ({ ...c }));
        localStorage.setItem('savedCollections', JSON.stringify(saved));
      }
    }
  }

  async function renderSavedCollections() {
    const container = document.getElementById('savedCollections');
    if (!container) return;
    if (!currentCollectionName) {
      container.innerHTML = '';
      return;
    }
    try {
      const saved = await Storage.loadNamedCollections();
      const current = saved.find(c => c.name === currentCollectionName);
      if (!current) {
        container.innerHTML = '';
        return;
      }
      const total = current.data.reduce((s, x) => s + (x.count || 0), 0);
      container.innerHTML = '<div class="saved-collections-label">Colección actual:</div>' +
        `<div class="saved-chip" data-id="${current.id}">
            <span class="saved-chip-name">${current.name}</span>
            <span class="saved-chip-cards">${total} cartas</span>
            <button class="ghost saved-load-btn" title="Cargar">📂</button>
            <button class="ghost saved-rename-btn" title="Renombrar">✏️</button>
          </div>`;

      container.querySelectorAll('.saved-load-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const id = btn.closest('.saved-chip').dataset.id;
            const target = await Storage.loadNamedCollection(id);
            if (target && target.name === currentCollectionName) return;

            if (currentCollectionName && Object.keys(data).length > 0) {
              if (confirm('¿Guardar "' + currentCollectionName + '" antes de cargar otra?\n\nAceptar = Guardar y cargar\nCancelar = Cargar sin guardar')) {
                const saved = await Storage.loadNamedCollections();
                const entry = saved.find(c => c.name === currentCollectionName);
                if (entry) {
                  entry.data = Object.values(data).map(c => ({ ...c }));
                  localStorage.setItem('savedCollections', JSON.stringify(saved));
                  UI.toast('"' + currentCollectionName + '" guardada', 'success');
                }
              }
            }

            const loaded = await Storage.loadCollectionAsNamed(id);
            if (loaded) {
              data = loaded;
              await Storage.saveCollection(data);
              currentCollectionName = target?.name || '';
              renderSavedCollections();
              render();
              UI.toast('Colección "' + currentCollectionName + '" cargada', 'success');
            }
          } catch(err) { console.error(err); UI.toast('Error al cargar', 'error'); }
        });
      });

      container.querySelectorAll('.saved-rename-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const chip = btn.closest('.saved-chip');
            const id = chip.dataset.id;
            const oldName = chip.querySelector('.saved-chip-name').textContent;
            const newName = prompt('Nuevo nombre:', oldName);
            if (newName && newName.trim()) {
              await Storage.renameNamedCollection(id, newName.trim());
              currentCollectionName = newName.trim();
              document.getElementById('collectionNameInput').value = newName.trim();
              renderSavedCollections();
              UI.toast('Renombrada a "' + newName.trim() + '"', 'success');
            }
          } catch(err) { console.error(err); UI.toast('Error al renombrar', 'error'); }
        });
      });

      /* container.querySelectorAll('.saved-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            const id = btn.closest('.saved-chip').dataset.id;
            const name = btn.closest('.saved-chip').querySelector('.saved-chip-name').textContent;
            if (confirm('¿Eliminar colección "' + name + '"?')) {
              await Storage.deleteNamedCollection(id);
              renderSavedCollections();
              UI.toast('Eliminada "' + name + '"', 'success');
            }
          } catch(err) { console.error(err); UI.toast('Error al eliminar', 'error'); }
        });
      }); */

      /* container.querySelectorAll('.saved-new-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('¿Crear nueva colección?')) return;
          const newName = 'Nueva colección';
          const id = await Storage.saveNamedCollection(newName, {});
          data = {};
          currentCollectionName = newName;
          document.getElementById('collectionNameInput').value = newName;
          await Storage.saveCollection(data);
          await renderSavedCollections();
          render();
        });
      }); */
    } catch(err) {
      console.error('Error cargando colecciones guardadas:', err);
      container.innerHTML = '';
    }
  }

  function buildEnrichQuery(c) {
    if (c.setId && c.number) return 'set.id:' + c.setId + ' number:' + c.number;
    if (c.id && !c.id.includes('|')) return c.id;
    return c.name;
  }

  async function enrichCollectionFromAPI() {
    const keys = Object.keys(data);
    if (keys.length === 0) return;
    const needsEnrich = keys.filter(k => data[k].id);
    if (needsEnrich.length === 0) return;
    let changed = false;
    for (const key of needsEnrich) {
      try {
        const c = data[key];
        const query = buildEnrichQuery(c);
        const results = await API.searchCards(query, 1);
        if (results.length > 0) {
          const full = results[0];
          c.attacks = full.attacks || []; changed = true;
          c.abilities = full.abilities || []; changed = true;
          c.text = full.text && full.text.length > 0 ? full.text : (full.rules || []); changed = true;
          c.weaknesses = full.weaknesses || []; c.resistances = full.resistances || []; c.retreatCost = full.retreatCost || []; c.convertedRetreatCost = full.convertedRetreatCost || 0; changed = true;
          if (!c.number && full.number) { c.number = full.number; changed = true; }
          if (!c.rarity && full.rarity) { c.rarity = full.rarity; changed = true; }
          if (!c.hp && full.hp) { c.hp = full.hp; changed = true; }
          if (!c.subtypes && full.subtypes) { c.subtypes = full.subtypes; changed = true; }
          if (!c.evolvesFrom && full.evolvesFrom) { c.evolvesFrom = full.evolvesFrom; changed = true; }
          if (full.types) { c.types = full.types; changed = true; }
          if (full.set?.name && !c.set) { c.set = full.set.name; changed = true; }
          if (full.images?.small && !c.image) { c.image = full.images.small; changed = true; }
        }
      } catch (e) { /* ignore */ }
    }
    if (changed) {
      try { await Storage.saveCollection(data); } catch (e) { console.error('Save after enrichment failed:', e); }
    }
  }

  async function enrichAllSavedCollections() {
    try {
      const saved = await Storage.loadNamedCollections();
      if (saved.length === 0) { UI.toast('No hay colecciones guardadas', 'info'); return; }
      UI.toast('Actualizando todas las colecciones...', 'info');
      let totalUpdated = 0;
      for (const col of saved) {
        if (!col.data || col.data.length === 0) continue;
        let changed = false;
        for (const c of col.data) {
          if (!c.id) continue;
          try {
            const query = buildEnrichQuery(c);
            const results = await API.searchCards(query, 1);
            if (results.length > 0) {
              const full = results[0];
              c.attacks = full.attacks || [];
              c.abilities = full.abilities || [];
              c.text = full.text && full.text.length > 0 ? full.text : (full.rules || []);
              c.weaknesses = full.weaknesses || []; c.resistances = full.resistances || []; c.retreatCost = full.retreatCost || []; c.convertedRetreatCost = full.convertedRetreatCost || 0;
              if (!c.number && full.number) c.number = full.number;
              if (!c.rarity && full.rarity) c.rarity = full.rarity;
              if (!c.hp && full.hp) c.hp = full.hp;
              if (!c.subtypes && full.subtypes) c.subtypes = full.subtypes;
              if (!c.evolvesFrom && full.evolvesFrom) c.evolvesFrom = full.evolvesFrom;
              if (full.types) c.types = full.types;
              if (full.set?.name && !c.set) c.set = full.set.name;
              if (full.images?.small && !c.image) c.image = full.images.small;
              changed = true;
              totalUpdated++;
            }
          } catch (e) { /* ignore */ }
        }
        if (changed) {
          col.data = col.data.map(c => ({ ...c }));
        }
      }
      localStorage.setItem('savedCollections', JSON.stringify(saved));
      UI.toast('Actualizadas ' + totalUpdated + ' cartas en ' + saved.length + ' colecciones', 'success');
      if (currentCollectionName) render();
    } catch (e) {
      console.error('Error enriching saved collections:', e);
      UI.toast('Error al actualizar colecciones', 'error');
    }
  }

  return {
    getData() { return data; },
    getMap() { return { ...data }; },

    async init() {
      data = await Storage.loadCollection();

      let migrated = false;
      try {
        const cardDb = await Storage.loadCardDb();
        if (cardDb.length > 0) {
          const cardMap = {};
          const cardIdMap = {};
          const setNumMap = {};
          cardDb.forEach(c => { cardMap[c.name.toLowerCase()] = c; if (c.id) cardIdMap[c.id] = c; if (c.setId && c.number) setNumMap[c.setId + '-' + c.number] = c; });

          for (const key in data) {
            const c = data[key];
            if (!c.id) {
              const dbCard = (c.setId && c.number && setNumMap[c.setId + '-' + c.number]) || cardMap[c.name.toLowerCase()];
              if (dbCard) { c.id = dbCard.id; migrated = true; }
              else { c.id = key; }
            }
            if (!c.image) {
              const dbCard = (c.setId && c.number && setNumMap[c.setId + '-' + c.number]) || cardMap[c.name.toLowerCase()];
              if (dbCard && dbCard.images?.small) { c.image = dbCard.images.small; migrated = true; }
            }
            const dbCard = (c.setId && c.number && setNumMap[c.setId + '-' + c.number]) || cardIdMap[c.id] || cardMap[c.name.toLowerCase()];
            if (dbCard) {
              if (!c.number && dbCard.number) { c.number = dbCard.number; migrated = true; }
              if (!c.rarity && dbCard.rarity) { c.rarity = dbCard.rarity; migrated = true; }
              if (!c.hp && dbCard.hp) { c.hp = dbCard.hp; migrated = true; }
              if (!c.subtypes && dbCard.subtypes) { c.subtypes = dbCard.subtypes; migrated = true; }
              if (!c.evolvesFrom && dbCard.evolvesFrom) { c.evolvesFrom = dbCard.evolvesFrom; migrated = true; }
              if (!c.supertype && dbCard.supertype) { c.supertype = dbCard.supertype; migrated = true; }
            }
          }
        }
      } catch (e) { console.warn('Collection migration error:', e); }
      if (migrated) {
        try { await Storage.saveCollection(data); } catch (e) { console.error('Save after migration failed:', e); }
      }

      document.getElementById('collectionFilterType').addEventListener('change', render);
      document.getElementById('collectionFilterElement').addEventListener('change', render);
      document.getElementById('collectionSort').addEventListener('change', render);
      document.getElementById('collectionSearch').addEventListener('input', render);

      // Save button
      document.getElementById('saveCollectionBtn').addEventListener('click', async () => {
        try {
          const nameInput = document.getElementById('collectionNameInput');
          const name = nameInput.value.trim() || ('Colección ' + new Date().toLocaleDateString('es-AR'));
          UI.toast('Guardando "' + name + '"...', 'info');
          const id = await Storage.saveNamedCollection(name, data);
          currentCollectionName = name;
          UI.toast('Colección "' + name + '" guardada (' + Object.values(data).reduce((s,c)=>s+(c.count||0),0) + ' cartas)', 'success');
          renderSavedCollections();
        } catch(err) {
          console.error('Error guardando colección:', err);
          UI.toast('Error al guardar: ' + err.message, 'error');
        }
      });

      // Export JSON
      document.getElementById('exportCollectionBtn').addEventListener('click', () => {
        const items = Object.values(data).map(c => ({
          name: c.name, set: c.set || '', setId: c.setId || '', number: c.number || '',
          count: c.count || 1, supertype: c.supertype || '', types: c.types || [],
          subtypes: c.subtypes || [], evolvesFrom: c.evolvesFrom || null,
          hp: c.hp || null, rarity: c.rarity || '',
          attacks: c.attacks || [], abilities: c.abilities || [],
          weaknesses: c.weaknesses || [], resistances: c.resistances || [],
          retreatCost: c.retreatCost || [], text: c.text || []
        }));
        const blob = new Blob([JSON.stringify({ name: currentCollectionName || 'Mi colección', exportedAt: Date.now(), cards: items }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (currentCollectionName || 'coleccion').replace(/[^a-z0-9]/gi, '_') + '.json';
        a.click();
        URL.revokeObjectURL(url);
        UI.toast('JSON exportado', 'success');
      });

      document.getElementById('enrichAllBtn').addEventListener('click', () => { enrichAllSavedCollections(); });
      document.getElementById('importCollectionInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const cards = json.cards || json;
          if (!Array.isArray(cards)) { UI.toast('Formato inválido', 'error'); return; }
          let imported = 0;
          cards.forEach(c => {
            const key = Storage.generateId(c.name, c.setId || '');
            data[key] = {
              id: c.id || key, name: c.name, image: c.image || '', set: c.set || '',
              setId: c.setId || '', number: c.number || '', count: c.count || 1,
              supertype: c.supertype || '', types: c.types || [], subtypes: c.subtypes || [],
              evolvesFrom: c.evolvesFrom || null, hp: c.hp || null,
              rarity: c.rarity || '', attacks: c.attacks || [], abilities: c.abilities || [],
              weaknesses: c.weaknesses || [], resistances: c.resistances || [],
              retreatCost: c.retreatCost || [], text: c.text || [],
              addedAt: data[key]?.addedAt || Date.now()
            };
            imported++;
          });
          await Storage.saveCollection(data);
          render();
          UI.toast('Importadas ' + imported + ' cartas', 'success');
          if (json.name) {
            currentCollectionName = json.name;
            document.getElementById('collectionNameInput').value = currentCollectionName;
          }
        } catch (err) {
          UI.toast('Error al importar: ' + err.message, 'error');
        }
        e.target.value = '';
      });

      renderSavedCollections();
    },

    addFromAPI(apiCard) {
      const setId = apiCard.set?.id || '';
      const key = Storage.generateId(apiCard.name, setId);
      const prevCount = data[key] ? data[key].count : 0;
      data[key] = {
        id: apiCard.id || key, name: apiCard.name, image: apiCard.images?.small || '',
        set: apiCard.set?.name || '', setId: setId, number: apiCard.number || '',
        count: prevCount + 1, supertype: apiCard.supertype || '', types: apiCard.types || [],
        subtypes: apiCard.subtypes || [], evolvesFrom: apiCard.evolvesFrom || null,
        hp: apiCard.hp ? parseInt(apiCard.hp, 10) : null, rarity: apiCard.rarity || '',
        attacks: apiCard.attacks || [], abilities: apiCard.abilities || [],
        weaknesses: apiCard.weaknesses || [], resistances: apiCard.resistances || [],
        retreatCost: apiCard.retreatCost || [], text: apiCard.text && apiCard.text.length > 0 ? apiCard.text : (apiCard.rules || []),
        addedAt: data[key]?.addedAt || Date.now()
      };
      save();
      UI.toast('Agregada: ' + apiCard.name, 'success');
    },

    countByName(name) {
      const target = name.toLowerCase();
      let total = 0;
      Object.values(data).forEach(c => { if (c.name.toLowerCase() === target) total += c.count; });
      return total;
    },

    findByName(name) {
      const target = name.toLowerCase();
      return Object.values(data).find(c => c.name.toLowerCase() === target);
    },

    getTypedLists() {
      const items = Object.values(data);
      return {
        pokemon: items.filter(c => c.supertype === 'Pokémon'),
        trainers: items.filter(c => c.supertype === 'Trainer'),
        energies: items.filter(c => c.supertype === 'Energy'),
        all: items
      };
    },

    render,

    async reEnrich() {
      let changed = 0;
      try {
        const cardDb = await Storage.loadCardDb();
        console.log('reEnrich: cardDb has', cardDb.length, 'cards');
        if (cardDb.length === 0) return;
        const cardIdMap = {};
        const cardMap = {};
        const setNumMap = {};
        cardDb.forEach(c => {
          if (c.id) cardIdMap[c.id] = c;
          cardMap[c.name.toLowerCase()] = c;
          if (c.setId && c.number) setNumMap[c.setId + '-' + c.number] = c;
        });

        const sample = cardDb.find(c => c.attacks && c.attacks.length > 0);
        console.log('reEnrich: sample card with attacks:', sample ? sample.name : 'NONE');

        for (const key in data) {
          const c = data[key];
          const dbCard = (c.setId && c.number && setNumMap[c.setId + '-' + c.number]) || cardIdMap[c.id] || cardMap[c.name.toLowerCase()];
          if (!dbCard) continue;
          if (dbCard.attacks && dbCard.attacks.length > 0) { c.attacks = dbCard.attacks; changed++; }
          if (dbCard.abilities && dbCard.abilities.length > 0) { c.abilities = dbCard.abilities; changed++; }
          if (dbCard.text && dbCard.text.length > 0) { c.text = dbCard.text; changed++; }
          else if (dbCard.rules && dbCard.rules.length > 0) { c.text = dbCard.rules; changed++; }
          if (dbCard.weaknesses && dbCard.weaknesses.length > 0) { c.weaknesses = dbCard.weaknesses; c.resistances = dbCard.resistances || []; c.retreatCost = dbCard.retreatCost || []; c.convertedRetreatCost = dbCard.convertedRetreatCost || 0; changed++; }
          if (dbCard.types && (!c.types || c.types.length === 0)) { c.types = dbCard.types; changed++; }
          if (dbCard.hp && !c.hp) { c.hp = dbCard.hp; changed++; }
          if (dbCard.rarity && !c.rarity) { c.rarity = dbCard.rarity; changed++; }
          if (dbCard.subtypes && !c.subtypes) { c.subtypes = dbCard.subtypes; changed++; }
          if (dbCard.supertype && !c.supertype) { c.supertype = dbCard.supertype; changed++; }
          if (dbCard.evolvesFrom && !c.evolvesFrom) { c.evolvesFrom = dbCard.evolvesFrom; changed++; }
          if (dbCard.images?.small && !c.image) { c.image = dbCard.images.small; changed++; }
        }
      } catch (e) { console.warn('reEnrich error:', e); }
      console.log('reEnrich: updated', changed, 'fields');
      if (changed > 0) {
        try { await Storage.saveCollection(data); } catch (e) { console.error('Save after reEnrich failed:', e); }
      }
    },

    getCurrentName() { return currentCollectionName; },

    setCurrentName(name) {
      currentCollectionName = name || '';
      const input = document.getElementById('collectionNameInput');
      if (input) input.value = currentCollectionName;
      renderSavedCollections();
    },

    enrichCollectionFromAPI
  };
})();
