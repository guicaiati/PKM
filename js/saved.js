const Saved = (() => {
  let _allCollections = [];

  function setupSearch() {
    const input = document.getElementById('savedCollectionSearch');
    const list = document.getElementById('savedSearchAutocomplete');
    if (!input || input._bound) return;
    input._bound = true;

    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const val = input.value.trim();
      timer = setTimeout(() => {
        renderCollections(val);
        if (val.length < 2) { list.classList.remove('show'); return; }
        const q = val.toLowerCase();
        const allNames = new Set();
        _allCollections.forEach(c => {
          c.data.forEach(card => {
            if (card.name.toLowerCase().includes(q)) allNames.add(card.name);
          });
        });
        const matches = [...allNames].sort().slice(0, 8);
        if (matches.length === 0) { list.classList.remove('show'); return; }
        list.innerHTML = matches.map(n => '<div class="autocomplete-item">' + n + '</div>').join('');
        list.classList.add('show');
        list.querySelectorAll('.autocomplete-item').forEach(el => {
          el.addEventListener('click', () => {
            input.value = el.textContent;
            list.classList.remove('show');
            renderCollections(el.textContent);
          });
        });
      }, 150);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) list.classList.remove('show');
    });
  }

  async function renderCollections(searchQuery) {
    setupSearch();
    const container = document.getElementById('savedCollectionsFull');
    const empty = document.getElementById('savedCollectionsEmpty');
    const saved = await Storage.loadNamedCollections();
    const liveData = Collection.getMap();
    const liveName = Collection.getCurrentName();

    if (saved.length === 0 && !liveName) {
      container.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    const currentEntry = liveName ? {
      id: 'current',
      name: liveName,
      savedAt: Date.now(),
      data: Object.values(liveData)
    } : null;

    const others = liveName ? saved.filter(c => c.name !== liveName) : saved;
    const all = currentEntry ? [currentEntry, ...others] : others;

    _allCollections = all;

    let filtered = all;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = all.filter(c => c.data.some(card => card.name.toLowerCase().includes(q)));
    }

    if (filtered.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'block';
      empty.textContent = searchQuery
        ? 'No se encontraron colecciones con "' + searchQuery + '".'
        : 'No tenés colecciones guardadas. Andá a "Mi colección" y guardá una.';
      return;
    }

    empty.style.display = 'none';

    container.innerHTML = filtered.map(c => {
      const total = c.data.reduce((s, x) => s + (x.count || 0), 0);
      const unique = c.data.length;
      const pokemon = c.data.filter(x => x.supertype === 'Pokémon').reduce((s, x) => s + (x.count || 0), 0);
      const trainers = c.data.filter(x => x.supertype === 'Trainer').reduce((s, x) => s + (x.count || 0), 0);
      const energies = c.data.filter(x => x.supertype === 'Energy').reduce((s, x) => s + (x.count || 0), 0);
      const date = new Date(c.savedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });
      const pokePct = total > 0 ? Math.round((pokemon / total) * 100) : 0;
      const trainPct = total > 0 ? Math.round((trainers / total) * 100) : 0;
      const energyPct = total > 0 ? 100 - pokePct - trainPct : 0;
      return `
        <div class="saved-card" data-id="${c.id}">
          <div class="saved-card-header">
            <div class="saved-card-icon">📦</div>
            <div class="saved-card-info">
              <div class="saved-card-name">${c.name}</div>
              <div class="saved-card-date">${date}</div>
            </div>
          </div>
          <div class="saved-card-stats">
            <span class="sc-stat"><span class="sc-stat-val">${total}</span> cartas</span>
            <span class="sc-stat"><span class="sc-stat-val">${unique}</span> únicas</span>
            <span class="sc-stat sc-pokemon">⚡ ${pokemon}</span>
            <span class="sc-stat sc-trainer">🎴 ${trainers}</span>
            <span class="sc-stat sc-energy">💎 ${energies}</span>
          </div>
          ${total > 0 ? `<div class="collection-bar">
            <div class="collection-bar-fill poke-bar" style="width:${pokePct}%"></div>
            <div class="collection-bar-fill train-bar" style="width:${trainPct}%"></div>
            <div class="collection-bar-fill energy-bar" style="width:${energyPct}%"></div>
          </div>
          <div class="collection-bar-labels">
            <span class="cbl-item poke-label">${pokePct}% Pokémon</span>
            <span class="cbl-item train-label">${trainPct}% Trainer</span>
            <span class="cbl-item energy-label">${energyPct}% Energía</span>
          </div>` : ''}
          <div class="saved-card-actions">
            <button class="action saved-card-load">Cargar</button>
            <button class="ghost saved-card-rename">Renombrar</button>
            <button class="ghost saved-card-delete">Eliminar</button>
            <button class="ghost saved-card-new" title="Nueva colección">➕</button>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.saved-card-load').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.saved-card').dataset.id;
        const target = await Storage.loadNamedCollection(id);
        const currentName = Collection.getCurrentName();
        const liveData = Collection.getMap();

        if (target && target.name === currentName) return;

        if (currentName && Object.keys(liveData).length > 0) {
          if (confirm('¿Guardar "' + currentName + '" antes de cargar otra?\n\nAceptar = Guardar y cargar\nCancelar = Cargar sin guardar')) {
            const saved = await Storage.loadNamedCollections();
            const entry = saved.find(c => c.name === currentName);
            if (entry) {
              entry.data = Object.values(liveData).map(c => ({ ...c }));
              localStorage.setItem('savedCollections', JSON.stringify(saved));
              UI.toast('"' + currentName + '" guardada', 'success');
            }
          }
        }

        const loaded = await Storage.loadCollectionAsNamed(id);
        if (loaded) {
          await Storage.saveCollection(loaded);
          Collection.setCurrentName(target?.name || '');
          Collection.init();
          UI.toast('Colección cargada', 'success');
        }
      });
    });

    container.querySelectorAll('.saved-card-rename').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.saved-card');
        const id = card.dataset.id;
        const oldName = card.querySelector('.saved-card-name').textContent;
        const newName = prompt('Nuevo nombre:', oldName);
        if (newName && newName.trim()) {
          await Storage.renameNamedCollection(id, newName.trim());
          renderCollections(document.getElementById('savedCollectionSearch')?.value?.trim() || '');
          UI.toast('Renombrada', 'success');
        }
      });
    });

    container.querySelectorAll('.saved-card-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.saved-card');
        const id = card.dataset.id;
        const name = card.querySelector('.saved-card-name').textContent;
        if (confirm('¿Eliminar "' + name + '"?')) {
          await Storage.deleteNamedCollection(id);
          renderCollections(document.getElementById('savedCollectionSearch')?.value?.trim() || '');
          UI.toast('Eliminada', 'success');
        }
      });
    });

    container.querySelectorAll('.saved-card-new').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Crear nueva colección?')) return;
        const newName = 'Nueva colección';
        await Storage.saveNamedCollection(newName, {});
        await Storage.saveCollection({});
        Collection.init();
        UI.toast('Nueva colección creada', 'success');
      });
    });
  }

  async function renderDecks() {
    const container = document.getElementById('savedDecksFull');
    const empty = document.getElementById('savedDecksEmpty');
    const saved = await Storage.loadNamedDecks();

    if (saved.length === 0) {
      container.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    container.innerHTML = saved.map(d => {
      const data = d.data || {};
      const total = data.totalCards || 0;
      const pokeCount = (data.deck?.pokemon || []).reduce((s, c) => s + (c.need || 1), 0);
      const trainerCount = (data.deck?.trainers || []).reduce((s, c) => s + (c.need || 1), 0);
      const energyCount = (data.deck?.energies || []).reduce((s, c) => s + (c.need || 1), 0);
      const score = data.score?.total || '?';
      const archetype = data.archetypeName || 'Personalizado';
      const variant = data.variant || 'auto';
      const date = new Date(d.savedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' });

      const topPokemon = (data.deck?.pokemon || []).slice(0, 4).map(p =>
        `<div class="deck-preview-card">${p.name} <span class="deck-preview-qty">x${p.need}</span></div>`
      ).join('');

      return `
        <div class="saved-card deck-saved-card" data-id="${d.id}">
          <div class="saved-card-header">
            <div class="saved-card-icon">🃏</div>
            <div class="saved-card-info">
              <div class="saved-card-name">${d.name}</div>
              <div class="saved-card-meta">${archetype} · ${variant} · ${date}</div>
            </div>
            <div class="saved-card-score">${score}<span class="saved-card-score-label">pts</span></div>
          </div>
          <div class="saved-card-stats">
            <span class="sc-stat"><span class="sc-stat-val">${total}</span> cartas</span>
            <span class="sc-stat sc-pokemon">⚡ ${pokeCount}</span>
            <span class="sc-stat sc-trainer">🎴 ${trainerCount}</span>
            <span class="sc-stat sc-energy">💎 ${energyCount}</span>
          </div>
          ${topPokemon ? '<div class="saved-card-pokemon">' + topPokemon + '</div>' : ''}
          <div class="saved-card-actions">
            <button class="action saved-card-load">Cargar mazo</button>
            <button class="ghost saved-card-rename">Renombrar</button>
            <button class="ghost saved-card-delete">Eliminar</button>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.saved-card-load').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.saved-card').dataset.id;
        const loaded = await Storage.loadNamedDeck(id);
        if (loaded && loaded.data) {
          document.querySelector('[data-tab="build"]').click();
          setTimeout(() => {
            DeckBuilder.loadSavedDeck(loaded.data, loaded.name);
          }, 100);
        }
      });
    });

    container.querySelectorAll('.saved-card-rename').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.saved-card');
        const id = card.dataset.id;
        const oldName = card.querySelector('.saved-card-name').textContent;
        const newName = prompt('Nuevo nombre:', oldName);
        if (newName && newName.trim()) {
          await Storage.renameNamedDeck(id, newName.trim());
          renderDecks();
          UI.toast('Renombrado', 'success');
        }
      });
    });

    container.querySelectorAll('.saved-card-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.saved-card');
        const id = card.dataset.id;
        const name = card.querySelector('.saved-card-name').textContent;
        if (confirm('¿Eliminar "' + name + '"?')) {
          await Storage.deleteNamedDeck(id);
          renderDecks();
          UI.toast('Eliminado', 'success');
        }
      });
    });
  }

  return {
    async render() {
      const searchInput = document.getElementById('savedCollectionSearch');
      await renderCollections(searchInput?.value?.trim() || '');
      await renderDecks();
    }
  };
})();
