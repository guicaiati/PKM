const DeckBuilder = (() => {
  let worker = null;
  let currentResult = null;
  let activeVariant = 'auto';
  const mod = {};

  function getWorker() {
    if (worker) return worker;
    worker = new Worker('js/deckbuilder.worker.js');
    worker.onmessage = handleWorkerMessage;
    worker.onerror = (e) => {
      console.error('Worker error:', e);
      UI.setStatus(document.getElementById('deckStatus'), 'Error en el procesamiento.', true);
      Progress.hide();
    };
    return worker;
  }

  function handleWorkerMessage(e) {
    const { type, payload } = e.data;
    switch (type) {
      case 'progress':
        Progress.update(payload.percent, payload.task);
        break;
      case 'result':
        currentResult = payload;
        renderResults(payload);
        Progress.complete();
        UI.setStatus(document.getElementById('deckStatus'), 'Mazo construido exitosamente.');
        break;
      case 'error':
        UI.setStatus(document.getElementById('deckStatus'), 'Error: ' + payload, true);
        Progress.hide();
        break;
    }
  }

  function renderResults(result) {
    try {
    document.getElementById('deckResults').style.display = 'block';
    document.getElementById('deckCardCount').textContent = result.totalCards;

    // Score
    UI.renderScore(document.getElementById('deckScore'), {
      consistency: result.score.consistency,
      speed: result.score.speed,
      power: result.score.power,
      recovery: result.score.recovery,
      competitiveness: result.score.competitiveness,
      cost: result.score.cost
    }, result.score.total);

    // Variants
    UI.renderVariants(document.getElementById('deckVariants'), result.variants, activeVariant, (variantType) => {
      try {
        activeVariant = variantType;
        mod.regenerateWithVariant(variantType);
      } catch(err) { console.error('Variant click error:', err); }
    });

    // Gameplay tips
    renderGameplayTips(result.gameplayTips);

    // Deck sections
    UI.renderDeckSection(document.getElementById('deckPokemonSection'), 'Pokémon', result.deck.pokemon);
    UI.renderDeckSection(document.getElementById('deckTrainerSection'), 'Trainer', result.deck.trainers);
    UI.renderDeckSection(document.getElementById('deckEnergySection'), 'Energy', result.deck.energies);

    // Buy list
    UI.renderBuyList(document.getElementById('buyList'), result.buyList);

    // Remove list
    UI.renderRemoveList(document.getElementById('removeList'), result.removeList);

    // Meta comparison
    renderMetaComparison(result.metaComparison);

    // Suggestions
    renderSuggestions(result.pokemonSuggestions, result.trainerSuggestions);

    // Setup explain buttons
    setupExplainButtons();
    setupRowClicks();
    } catch(err) { console.error('renderResults error:', err); }
  }

  function renderMetaComparison(comparison) {
    const container = document.getElementById('metaComparison');
    if (!comparison || comparison.length === 0) {
      container.innerHTML = '<div class="empty">No hay datos de meta disponibles.</div>';
      return;
    }
    UI.renderCompatibility(container, comparison.map(m => ({
      name: m.name,
      compatible: m.collectionPct >= 50,
      pct: m.collectionPct
    })));
  }

  function renderSuggestions(pokemonSuggestions, trainerSuggestions) {
    const container = document.getElementById('suggestionsContainer');
    if (!container) return;

    const allSuggestions = [
      ...(pokemonSuggestions || []),
      ...(trainerSuggestions || [])
    ];

    if (allSuggestions.length === 0) {
      container.innerHTML = '<div class="empty">No hay sugerencias pendientes. ¡Tu mazo está completo!</div>';
      return;
    }

    container.innerHTML = allSuggestions.map(s => {
      const priorityClass = s.priority === 'alta' ? 'priority-high' : s.priority === 'media' ? 'priority-medium' : 'priority-low';
      const icon = s.type === 'pokemon' ? '⚡' : '🎴';
      return `
        <div class="suggestion-card ${priorityClass}">
          <div class="suggestion-header">
            <span class="suggestion-icon">${icon}</span>
            <span class="suggestion-name">${s.name}</span>
            <span class="suggestion-priority">${s.priority}</span>
          </div>
          <div class="suggestion-message">${s.message}</div>
          <div class="suggestion-action">${s.action}</div>
        </div>`;
    }).join('');
  }

  function renderGameplayTips(tips) {
    const section = document.getElementById('gameplaySection');
    const container = document.getElementById('gameplayTips');
    if (!section || !container) return;

    if (!tips || tips.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    container.innerHTML = tips.map(tip => '<div class="gameplay-tip">' + tip + '</div>').join('');
  }

  function setupExplainButtons() {
    document.querySelectorAll('.dc-explain').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await openCardModal(e.target.closest('.deck-card-row'));
      });
    });
  }

  function setupRowClicks() {
    document.querySelectorAll('.deck-card-row').forEach(row => {
      row.addEventListener('click', async (e) => {
        if (e.target.closest('.dc-explain')) return;
        await openCardModal(row);
      });
    });
  }

  async function openCardModal(row) {
    const nameEl = row.querySelector('.dc-name');
    const name = nameEl ? nameEl.childNodes[0].textContent.trim() : '';
    const set = row.querySelector('.dc-set')?.textContent || '';

    const allCards = [
      ...(currentResult?.deck?.pokemon || []),
      ...(currentResult?.deck?.trainers || []),
      ...(currentResult?.deck?.energies || [])
    ];
    const card = allCards.find(c => c.name === name);

    const modalCard = {
      name: name,
      set: set ? { name: set } : null,
      supertype: card?.supertype || '',
      types: card?.types || [],
      subtypes: card?.subtypes || [],
      hp: card?.hp || '',
      rarity: card?.rarity || '',
      evolvesFrom: card?.evolvesFrom || '',
      evolvesTo: card?.evolvesTo || [],
      attacks: card?.attacks || [],
      abilities: card?.abilities || [],
      text: card?.text || [],
      weaknesses: card?.weaknesses || [],
      resistances: card?.resistances || [],
      retreatCost: card?.retreatCost || [],
      convertedRetreatCost: card?.convertedRetreatCost || 0,
      image: card?.image || '',
      number: card?.number || '',
      id: card?.id || '',
      explanation: card?.explanation || ''
    };

    UI.showLoading(UI.cardNamePlain(name));
    const explanation = await UI.getCardExplanationAsync(modalCard);
    if (explanation) UI.showModal(UI.cardNamePlain(name), explanation);
    else UI.showModal(UI.cardNamePlain(name), card?.explanation || 'Carta incluida en el mazo recomendado.');
  }

  async function renderSavedDecks() {
    const container = document.getElementById('savedDecks');
    if (!container) return;
    const saved = await Storage.loadNamedDecks();
    if (saved.length === 0) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = '<div class="saved-decks-label">Mazos guardados:</div>' +
      saved.map(d => `
        <div class="saved-chip" data-id="${d.id}">
          <span class="saved-chip-name">${d.name}</span>
          <span class="saved-chip-cards">${d.data?.totalCards || '?'} cartas</span>
          <button class="ghost saved-load-btn" title="Cargar">📂</button>
          <button class="ghost saved-rename-btn" title="Renombrar">✏️</button>
          <button class="ghost saved-delete-btn" title="Eliminar">🗑️</button>
        </div>`).join('');

    container.querySelectorAll('.saved-load-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.saved-chip').dataset.id;
        const loaded = await Storage.loadNamedDeck(id);
        if (loaded && loaded.data) {
          currentResult = loaded.data;
          activeVariant = loaded.data.variant || 'auto';
          renderResults(loaded.data);
          document.getElementById('deckResults').style.display = 'block';
          UI.toast('Mazo "' + loaded.name + '" cargado', 'success');
        }
      });
    });

    container.querySelectorAll('.saved-rename-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const chip = btn.closest('.saved-chip');
        const id = chip.dataset.id;
        const oldName = chip.querySelector('.saved-chip-name').textContent;
        const newName = prompt('Nuevo nombre:', oldName);
        if (newName && newName.trim()) {
          await Storage.renameNamedDeck(id, newName.trim());
          renderSavedDecks();
          UI.toast('Renombrado a "' + newName.trim() + '"', 'success');
        }
      });
    });

    container.querySelectorAll('.saved-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.saved-chip').dataset.id;
        const name = btn.closest('.saved-chip').querySelector('.saved-chip-name').textContent;
        if (confirm('¿Eliminar mazo "' + name + '"?')) {
          await Storage.deleteNamedDeck(id);
          renderSavedDecks();
          UI.toast('Eliminado "' + name + '"', 'success');
        }
      });
    });
  }

  let selectedCollections = new Set(['current']);

  async function renderCollectionChips() {
    const container = document.getElementById('deckCollectionChips');
    if (!container) return;
    const saved = await Storage.loadNamedCollections();
    const currentName = Collection.getCurrentName();
    let html = '';

    html += `<div class="collection-chip ${selectedCollections.has('current') ? 'selected' : ''}" data-id="current">
      <span>Colección actual</span>
      <span class="chip-count">${Object.values(Collection.getMap()).reduce((s, c) => s + (c.count || 0), 0)} cartas</span>
    </div>`;

    saved.forEach(c => {
      const total = c.data.reduce((s, x) => s + (x.count || 0), 0);
      html += `<div class="collection-chip ${selectedCollections.has(c.id) ? 'selected' : ''}" data-id="${c.id}">
        <span>${c.name}</span>
        <span class="chip-count">${total} cartas</span>
      </div>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.collection-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const id = chip.dataset.id;
        if (selectedCollections.has(id)) {
          selectedCollections.delete(id);
        } else {
          selectedCollections.add(id);
        }
        chip.classList.toggle('selected');
      });
    });
  }

  async function getSelectedCollection() {
    const merged = {};
    const sourceMap = {};
    if (selectedCollections.has('current')) {
      const currentName = Collection.getCurrentName() || 'Colección actual';
      const current = Collection.getMap();
      Object.entries(current).forEach(([k, v]) => { merged[k] = { ...v }; sourceMap[k] = currentName; });
    }
    const saved = await Storage.loadNamedCollections();
    for (const c of saved) {
      if (selectedCollections.has(c.id)) {
        c.data.forEach(card => {
          const key = Storage.generateId(card.name, card.setId, card.number);
          if (merged[key]) {
            merged[key].count = (merged[key].count || 0) + (card.count || 0);
          } else {
            merged[key] = { ...card };
          }
          if (!sourceMap[key]) sourceMap[key] = c.name;
        });
      }
    }
    return { merged, sourceMap };
  }

  let deckAutocompleteTimer = null;
  function setupDeckAutocomplete() {
    const input = document.getElementById('deckPokemonInput');
    const list = document.getElementById('deckAutocompleteList');
    input.addEventListener('input', () => {
      clearTimeout(deckAutocompleteTimer);
      const val = input.value.trim();
      const parts = val.split(',').map(s => s.trim());
      const last = parts[parts.length - 1];
      if (!last || last.length < 2) { list.classList.remove('show'); return; }
      deckAutocompleteTimer = setTimeout(async () => {
        try {
          const suggestions = await API.autocomplete(last);
          if (!suggestions.length) { list.classList.remove('show'); return; }
          list.innerHTML = suggestions.map(s => `<div class="autocomplete-item">${s}</div>`).join('');
          list.classList.add('show');
          list.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
              parts[parts.length - 1] = el.textContent;
              input.value = parts.join(', ');
              list.classList.remove('show');
            });
          });
        } catch { list.classList.remove('show'); }
      }, API.isDbReady() ? 50 : 300);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrap')) list.classList.remove('show');
    });
  }

  mod.init = function() {
    document.getElementById('analyzeDeckBtn').addEventListener('click', () => mod.startAnalysis());
    document.getElementById('autoBuildBtn').addEventListener('click', () => mod.autoBuild());
    document.getElementById('deckPokemonInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') mod.startAnalysis();
    });

    setupDeckAutocomplete();

    renderCollectionChips();

    // Save deck button
    document.getElementById('saveDeckBtn').addEventListener('click', async () => {
      try {
        if (!currentResult) { UI.toast('Generá un mazo primero', 'error'); return; }
        const nameInput = document.getElementById('deckNameInput');
        const name = nameInput.value.trim() || ('Mazo ' + new Date().toLocaleDateString('es-AR'));
        UI.toast('Guardando "' + name + '"...', 'info');
        const deckToSave = { ...currentResult, variant: activeVariant };
        const id = await Storage.saveNamedDeck(name, deckToSave);
        UI.toast('Mazo "' + name + '" guardado (' + (currentResult.totalCards || 60) + ' cartas)', 'success');
        renderSavedDecks();
      } catch(err) {
        console.error('Error guardando mazo:', err);
        UI.toast('Error al guardar: ' + err.message, 'error');
      }
    });

    // Export deck as TXT
    document.getElementById('exportDeckBtn').addEventListener('click', () => {
      if (!currentResult) return;
      const all = [
        ...(currentResult.deck?.pokemon || []),
        ...(currentResult.deck?.trainers || []),
        ...(currentResult.deck?.energies || [])
      ];
      let txt = '=== ' + (currentResult.archetypeName || 'Mi Mazo') + ' ===\n\n';
      txt += '--- Pokémon (' + (currentResult.deck?.pokemon || []).reduce((s, c) => s + (c.need || 1), 0) + ') ---\n';
      (currentResult.deck?.pokemon || []).forEach(c => { txt += c.need + 'x ' + c.name + '\n'; });
      txt += '\n--- Trainer (' + (currentResult.deck?.trainers || []).reduce((s, c) => s + (c.need || 1), 0) + ') ---\n';
      (currentResult.deck?.trainers || []).forEach(c => { txt += c.need + 'x ' + c.name + '\n'; });
      txt += '\n--- Energy (' + (currentResult.deck?.energies || []).reduce((s, c) => s + (c.need || 1), 0) + ') ---\n';
      (currentResult.deck?.energies || []).forEach(c => { txt += c.need + 'x ' + c.name + '\n'; });
      txt += '\nTotal: ' + all.reduce((s, c) => s + (c.need || 1), 0) + ' cartas\n';

      const blob = new Blob([txt], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (currentResult.archetypeName || 'mazo').replace(/[^a-z0-9]/gi, '_') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('Mazo exportado como TXT', 'success');
    });

    renderSavedDecks();
  };

  mod.regenerateWithVariant = async function(variant) {
    try {
    const statusEl = document.getElementById('deckStatus');
    const { merged: collection, sourceMap } = await getSelectedCollection();
    if (Object.keys(collection).length === 0) {
      UI.setStatus(statusEl, 'Tu colección está vacía.', true);
      return;
    }

    let archetypes = [];
    let meta = null;
    let staples = null;

    try {
      const [archRes, metaRes, stapleRes] = await Promise.all([
        fetch('data/archetypes.json').then(r => r.ok ? r.json() : { archetypes: [] }),
        fetch('data/meta.json?v=' + Date.now()).then(r => r.ok ? r.json() : null),
        fetch('data/staples.json').then(r => r.ok ? r.json() : { cards: [] })
      ]);
      archetypes = Array.isArray(archRes) ? archRes : (archRes.archetypes || []);
      meta = metaRes;
      staples = Array.isArray(stapleRes) ? stapleRes : (stapleRes.cards || stapleRes);
    } catch (err) {
      console.warn('Could not load data files:', err);
    }

    const userArchetypes = await Storage.loadArchetypes();
    if (userArchetypes.length > 0) archetypes = [...archetypes, ...userArchetypes];

    document.getElementById('deckResults').style.display = 'none';
    Progress.show();
    UI.setStatus(statusEl, 'Generando variante ' + variant + '...');

    const w = getWorker();
    w.postMessage({
      type: 'analyze',
      payload: { collection, archetypes, meta, staples, userPokemon: [], variant, sourceMap }
    });
    } catch(err) { console.error('regenerateWithVariant error:', err); }
  };

  mod.autoBuild = async function() {
    const statusEl = document.getElementById('deckStatus');
    const { merged: collection, sourceMap } = await getSelectedCollection();

    if (Object.keys(collection).length === 0) {
      UI.setStatus(statusEl, 'Tu colección está vacía. Agregá cartas desde "Buscar".', true);
      return;
    }

    let archetypes = [];
    let meta = null;
    let staples = null;

    try {
      const [archRes, metaRes, stapleRes] = await Promise.all([
        fetch('data/archetypes.json').then(r => r.ok ? r.json() : { archetypes: [] }),
        fetch('data/meta.json?v=' + Date.now()).then(r => r.ok ? r.json() : null),
        fetch('data/staples.json').then(r => r.ok ? r.json() : { cards: [] })
      ]);
      archetypes = Array.isArray(archRes) ? archRes : (archRes.archetypes || []);
      meta = metaRes;
      staples = Array.isArray(stapleRes) ? stapleRes : (stapleRes.cards || stapleRes);
    } catch (err) {
      console.warn('Could not load data files:', err);
    }

    const userArchetypes = await Storage.loadArchetypes();
    if (userArchetypes.length > 0) archetypes = [...archetypes, ...userArchetypes];

    document.getElementById('deckResults').style.display = 'none';
    Progress.show();
    UI.setStatus(statusEl, 'Analizando tu colección...');

    const w = getWorker();
    w.postMessage({
      type: 'analyze',
      payload: { collection, archetypes, meta, staples, userPokemon: [], variant: 'auto', sourceMap }
    });
  };

  mod.startAnalysis = async function() {
    const input = document.getElementById('deckPokemonInput');
    const statusEl = document.getElementById('deckStatus');
    const rawInput = input.value.trim();

    const userPokemon = rawInput ? rawInput.split(',').map(s => s.trim()).filter(Boolean) : [];
    const { merged: collection, sourceMap } = await getSelectedCollection();

    if (Object.keys(collection).length === 0) {
      UI.setStatus(statusEl, 'Tu colección está vacía. Agregá cartas desde "Buscar".', true);
      return;
    }

    if (userPokemon.length === 0) {
      return mod.autoBuild();
    }

    let archetypes = [];
    let meta = null;
    let staples = null;

    try {
      const [archRes, metaRes, stapleRes] = await Promise.all([
        fetch('data/archetypes.json').then(r => r.ok ? r.json() : { archetypes: [] }),
        fetch('data/meta.json?v=' + Date.now()).then(r => r.ok ? r.json() : null),
        fetch('data/staples.json').then(r => r.ok ? r.json() : { cards: [] })
      ]);
      archetypes = Array.isArray(archRes) ? archRes : (archRes.archetypes || []);
      meta = metaRes;
      staples = Array.isArray(stapleRes) ? stapleRes : (stapleRes.cards || stapleRes);
    } catch (err) {
      console.warn('Could not load data files:', err);
    }

    const userArchetypes = await Storage.loadArchetypes();
    if (userArchetypes.length > 0) archetypes = [...archetypes, ...userArchetypes];

    document.getElementById('deckResults').style.display = 'none';
    Progress.show();
    UI.setStatus(statusEl, 'Analizando...');

    const w = getWorker();
    w.postMessage({
      type: 'analyze',
      payload: { collection, archetypes, meta, staples, userPokemon, variant: 'auto', sourceMap }
    });
  };

  mod.loadSavedDeck = function(deckData, name) {
    currentResult = deckData;
    activeVariant = deckData.variant || 'auto';
    document.getElementById('deckNameInput').value = name || '';
    document.getElementById('deckResults').style.display = 'block';
    renderResults(deckData);
    UI.toast('Mazo cargado', 'success');
  };

  mod.refreshChips = function() {
    renderCollectionChips();
  };

  return mod;
})();
