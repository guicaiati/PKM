/**
 * views.js — Vistas y Controladores de Trainer's Ledger
 * Contiene:
 * - Scanner (Pestaña Buscar)
 * - Collection (Pestaña Colección)
 * - Wizard (Pestaña Armar mazo - 8 pasos)
 * - Saved (Pestaña Guardado)
 * - App (Inicialización y navegación)
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==========================================
   SCANNER MODULE (BUSCAR)
   ========================================== */
const Scanner = (() => {
  const MAX_HISTORY = 10;
  let autocompleteTimer = null;

  function getHistory() { return JSON.parse(localStorage.getItem('searchHistory') || '[]'); }

  function saveHistory(query) {
    let h = getHistory().filter(q => q !== query);
    h.unshift(query);
    if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY);
    localStorage.setItem('searchHistory', JSON.stringify(h));
  }

  function renderHistory() {
    const container = document.getElementById('historyChips');
    if (!container) return;
    const history = getHistory();
    if (history.length === 0) { container.parentElement.style.display = 'none'; return; }
    container.parentElement.style.display = 'block';
    container.innerHTML = history.map(q => `<button type="button" class="filter-chip history-chip">${q}</button>`).join('');
    container.querySelectorAll('.history-chip').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('searchInput').value = el.textContent;
        Scanner.doSearch();
      });
    });
  }

  function setupAutocomplete() {
    const input = document.getElementById('searchInput');
    const list = document.getElementById('autocompleteList');
    if (!input || !list) return;
    input.addEventListener('input', () => {
      clearTimeout(autocompleteTimer);
      const val = input.value.trim();
      if (val.length < 2) { list.classList.remove('show'); return; }
      autocompleteTimer = setTimeout(async () => {
        try {
          const suggestions = await API.autocomplete(val);
          if (!suggestions.length) { list.classList.remove('show'); return; }
          list.innerHTML = suggestions.map(s => {
            const owned = Collection.countByName(s);
            const badge = owned > 0 ? `<span class="ac-owned">Tenés ${owned}</span>` : '';
            return `<div class="autocomplete-item" data-val="${escapeHtml(s)}"><span>${escapeHtml(s)}</span>${badge}</div>`;
          }).join('');
          list.classList.add('show');
          list.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
              const cardName = el.dataset.val || el.querySelector('span')?.textContent || el.textContent;
              input.value = cardName;
              list.classList.remove('show');
              Scanner.doSearch();
            });
          });
        } catch { list.classList.remove('show'); }
      }, API.isDbReady() ? 50 : 300);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search-wrap')) list.classList.remove('show'); });
  }

  function setupFilters() {
    document.querySelectorAll('#searchFilters .filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#searchFilters .filter-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        const cards = Scanner._lastResults || [];
        const filtered = filter === 'all' ? cards : cards.filter(c => c.supertype === filter);
        renderResults(filtered);
      });
    });
  }

  function renderResults(cards) {
    const grid = document.getElementById('searchResults');
    if (!grid) return;
    grid.innerHTML = '';
    const collection = Collection.getData();
    cards.forEach(c => {
      const key = Storage.generateId(c.name, c.set?.id || '', c.number);
      const owned = collection[key]?.count || 0;
      const el = UI.renderCard({
        id: c.id, name: c.name, image: c.images?.small || '', set: c.set?.name || '',
        number: c.number, types: c.types, supertype: c.supertype, hp: c.hp,
        subtypes: c.subtypes, attacks: c.attacks, abilities: c.abilities,
        ability: c.ability, evolvesFrom: c.evolvesFrom, evolvesTo: c.evolvesTo
      }, { showAdd: true, owned });
      el.querySelector('.add-btn').addEventListener('click', () => Collection.addFromAPI(c));
      el.querySelector('.name-row .card-info-btn')?.remove();
      const infoBtn = document.createElement('button');
      infoBtn.className = 'ghost card-info-btn';
      infoBtn.title = 'Qué hace esta carta';
      infoBtn.textContent = '';
      const infoIcon = document.createElement('span');
      infoIcon.className = 'tcg-sym';
      infoIcon.style.cssText = 'font-size:14px;';
      infoIcon.textContent = '?';
      infoBtn.appendChild(infoIcon);
      infoBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        UI.showLoading(UI.cardNamePlain(c.name));
        const explanation = await UI.getCardExplanationAsync(c);
        if (explanation) UI.showModal(UI.cardNamePlain(c.name), explanation);
      });
      el.querySelector('.meta')?.appendChild(infoBtn);
      grid.appendChild(el);
    });
  }

  function updateDbStatus() {
    const el = document.getElementById('dbStatus');
    if (!el) return;
    renderSetStatus(el);
  }

  async function renderSetStatus(el) {
    if (!el) return;
    try {
      const sets = await API.getStandardSetsStatus();
      if (!sets || !sets.length) {
        el.innerHTML = `<span style="color:var(--holo-c);font-size:12px;">⚠ Conectando a catálogo de sets...</span>`;
        renderSetDownloadInput(el);
        return;
      }

      const downloaded = sets.filter(s => s.downloaded);
      const totalCards = downloaded.reduce((sum, s) => sum + s.cardCount, 0);

      let html = `<div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <span style="color:${totalCards > 0 ? 'var(--grass)' : 'var(--holo-a)'};font-weight:600;font-size:13px;">
          ${totalCards > 0 ? `✔ ${totalCards.toLocaleString('es-AR')} cartas guardadas` : '⚡ Catálogo local listo (0 cartas guardadas)'}
        </span>
        <span style="color:var(--text-dim);font-size:11px;font-family:var(--mono);">${downloaded.length} de ${sets.length} sets instalados</span>
      </div>`;

      const groups = [
        { key: 'standard', label: 'Formato Standard', color: 'var(--grass)' },
        { key: 'expanded', label: 'Formato Expanded', color: 'var(--holo-a)' },
        { key: 'mcd', label: "Colecciones McDonald's", color: 'var(--holo-b)' },
        { key: 'other', label: 'Otros Sets', color: '#888' },
      ];

      for (const g of groups) {
        const groupSets = sets.filter(s => s.format === g.key);
        if (!groupSets.length) continue;
        const groupDl = groupSets.filter(s => s.downloaded);
        const groupMissing = groupSets.filter(s => !s.downloaded);

        html += `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
            <span style="color:${g.color};font-weight:700;font-size:12px;">${g.label}</span>
            <span style="color:var(--text-dim);font-size:11px;font-family:var(--mono);">${groupDl.length}/${groupSets.length}</span>
          </div>`;

        html += `<div class="set-status-list">`;
        for (const s of groupSets) {
          if (s.downloaded) {
            html += `<div class="set-status-row">
              <span style="color:var(--grass);font-weight:700;">✔</span>
              <span class="set-name">${escapeHtml(s.name)}</span>
              <span class="set-count">${s.cardCount}</span>
            </div>`;
          } else {
            html += `<div class="set-status-row">
              <span style="color:var(--fire);font-weight:700;">✘</span>
              <span class="set-name">${escapeHtml(s.name)}</span>
              <button class="ghost download-set-btn" data-set-id="${s.id}" title="Descargar ${escapeHtml(s.name)}">↓</button>
            </div>`;
          }
        }
        html += `</div>`;

        if (groupMissing.length > 0) {
          html += `<button class="action download-group-btn" data-format="${g.key}" style="font-size:11px;padding:6px 8px;margin-top:8px;width:100%;">Descargar todo ${g.label} (${groupMissing.length} sets)</button>`;
        }
        html += `</div>`;
      }

      el.innerHTML = html;
      renderSetDownloadInput(el);

      el.querySelectorAll('.download-set-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const setId = btn.dataset.setId;
          btn.disabled = true;
          btn.textContent = '...';
          try {
            await API.downloadSingleSet(setId, (info) => {
              btn.textContent = info.phase === 'downloading' ? '📦' : '✔';
            });
            UI.toast('Set descargado', 'success');
            renderSetStatus(el);
          } catch (err) {
            btn.textContent = 'Error';
            UI.toast('Error: ' + err.message, 'error');
          }
        });
      });

      el.querySelectorAll('.download-group-btn').forEach(btn => {
        btn.addEventListener('click', () => downloadGroup(btn.dataset.format));
      });
    } catch (err) {
      console.error('renderSetStatus error:', err);
      el.innerHTML = `<div style="color:var(--fire);font-size:12px;margin-bottom:8px;">⚡ Error al verificar sets: ${escapeHtml(err.message)}</div>`;
      renderSetDownloadInput(el);
    }
  }

  function renderSetDownloadInput(el) {
    const div = document.createElement('div');
    div.style.cssText = 'margin-top:12px;border-top:1px solid var(--line);padding-top:10px;';
    div.innerHTML = `<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px;font-weight:600;">Descargar set individual por ID:</div>
      <div style="display:flex;gap:6px;">
        <input type="text" id="setDownloadInput" placeholder="ej: xy6, swsh6, sv3pt5" style="flex:1;font-size:12px;padding:6px 10px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);border-radius:6px;font-family:var(--mono);" />
        <button class="action" id="setDownloadBtn" style="font-size:12px;padding:6px 14px;">Descargar</button>
      </div>
      <div id="setDownloadStatus" style="font-size:11px;color:var(--holo-a);margin-top:6px;"></div>`;
    el.appendChild(div);

    document.getElementById('setDownloadBtn')?.addEventListener('click', async () => {
      const input = document.getElementById('setDownloadInput');
      const status = document.getElementById('setDownloadStatus');
      const setId = input.value.trim().toLowerCase();
      if (!setId) return;
      status.textContent = 'Descargando ' + setId + '...';
      status.style.color = 'var(--holo-a)';
      try {
        const n = await API.downloadSingleSet(setId, (info) => {
          status.textContent = info.msg || 'Descargando...';
        });
        status.textContent = '✔ ' + n + ' cartas descargadas para el set ' + setId;
        status.style.color = 'var(--grass)';
        UI.toast('Set ' + setId + ' descargado (' + n + ' cartas)', 'success');
        renderSetStatus(document.getElementById('dbStatus'));
      } catch (err) {
        status.textContent = '✘ Error al descargar: ' + err.message;
        status.style.color = 'var(--fire)';
      }
    });

    document.getElementById('setDownloadInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('setDownloadBtn')?.click();
    });
  }

  async function downloadGroup(format) {
    const el = document.getElementById('dbStatus');
    const sidebar = document.getElementById('dbSidebar');
    if (sidebar) sidebar.classList.add('downloading');

    try {
      const sets = await API.getStandardSetsStatus();
      const groupSets = sets.filter(s => s.format === format && !s.downloaded);
      if (!groupSets.length) {
        UI.toast('Ya tenés todos los sets de este grupo', 'success');
        if (sidebar) sidebar.classList.remove('downloading');
        renderSetStatus(el);
        return;
      }

      let totalNew = 0;
      for (let i = 0; i < groupSets.length; i++) {
        const s = groupSets[i];
        const pct = Math.round(((i + 1) / groupSets.length) * 100);
        el.innerHTML = `
          <div style="margin-bottom:10px;">
            <span style="color:var(--holo-a);font-weight:600;font-size:13px;">📦 Descargando...</span>
          </div>
          <div style="color:var(--text);font-size:12px;margin-bottom:8px;">${s.name} (${i + 1}/${groupSets.length})</div>
          <div class="dl-progress-bar">
            <div class="dl-progress-fill" style="width:${pct}%"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;">
            <span style="color:#888;font-size:11px;">${i + 1} / ${groupSets.length}</span>
            <span style="color:var(--holo-a);font-size:12px;font-weight:600;">${pct}%</span>
          </div>`;
        try {
          const n = await API.downloadSingleSet(s.id);
          totalNew += n;
        } catch (err) {
          console.warn(`Failed: ${s.name}`, err);
          await new Promise(r => setTimeout(r, 3000));
          try { await API.downloadSingleSet(s.id); } catch { }
        }
      }

      UI.toast(`${totalNew} cartas descargadas`, 'success');
    } catch (err) {
      el.innerHTML = `<span style="color:var(--fire);">Error: ${err.message}</span>`;
    }
    if (sidebar) sidebar.classList.remove('downloading');
    renderSetStatus(el);
  }

  async function downloadAll() {
    const el = document.getElementById('dbStatus');
    const sidebar = document.getElementById('dbSidebar');
    if (sidebar) sidebar.classList.add('downloading');

    try {
      const result = await API.downloadStandardSets((info) => {
        if (info.phase === 'downloading') {
          const pct = Math.round((info.setNum / info.setTotal) * 100);
          el.innerHTML = `
            <div style="margin-bottom:10px;">
              <span style="color:var(--holo-a);font-weight:600;font-size:13px;">📦 Descargando...</span>
            </div>
            <div style="color:var(--text);font-size:12px;margin-bottom:8px;">${info.msg}</div>
            <div class="dl-progress-bar">
              <div class="dl-progress-fill" style="width:${pct}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:6px;">
              <span style="color:#888;font-size:11px;">${info.setNum} / ${info.setTotal} sets</span>
              <span style="color:var(--holo-a);font-size:12px;font-weight:600;">${pct}%</span>
            </div>`;
        } else if (info.phase === 'done') {
          el.innerHTML = `<div style="text-align:center;padding:10px 0;">
            <span style="color:var(--grass);font-weight:600;font-size:13px;">✔ ${info.msg}</span>
          </div>`;
        }
      });
      UI.toast(`${result.totalCards} cartas listas para buscar`, 'success');
    } catch (err) {
      el.innerHTML = `<span style="color:var(--fire)">Error: ${err.message}</span>`;
    }
    if (sidebar) sidebar.classList.remove('downloading');
    renderSetStatus(el);
  }

  async function checkAndDownloadNew() {
    if (!API.isDbReady()) return;
    try {
      const newSets = await API.checkForNewSets();
      if (newSets.length > 0) {
        const el = document.getElementById('dbStatus');
        el.innerHTML = `<div style="margin-bottom:8px;"><span style="color:var(--holo-c);font-weight:600;">🆕 ${newSets.length} set(s) nuevo(s)</span></div>
          <button class="action" id="downloadAllNewBtn" style="font-size:12px;padding:6px 12px;width:100%;">Descargar nuevos</button>
          <button class="ghost" id="dismissNewBtn" style="font-size:11px;padding:4px 8px;width:100%;margin-top:4px;">Omitir</button>`;
        document.getElementById('downloadAllNewBtn')?.addEventListener('click', async () => {
          el.innerHTML = `<span style="color:var(--holo-a)">Actualizando...</span>`;
          for (const s of newSets) {
            el.innerHTML = `<span style="color:var(--holo-a)">📦 ${s.name}...</span>`;
            await API.downloadSingleSet(s.id);
          }
          UI.toast('Sets actualizados', 'success');
          renderSetStatus(el);
        });
        document.getElementById('dismissNewBtn')?.addEventListener('click', () => renderSetStatus(el));
      }
    } catch (err) {
      console.warn('New sets check failed:', err);
    }
  }

  return {
    _lastResults: [],

    async init() {
      setupAutocomplete();
      setupFilters();
      renderHistory();
      updateDbStatus();

      document.getElementById('searchBtn')?.addEventListener('click', () => this.doSearch());
      document.getElementById('searchInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doSearch(); });
      document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('searchStatus').textContent = '';
      });
    },

    async doSearch() {
      const input = document.getElementById('searchInput');
      const statusEl = document.getElementById('searchStatus');
      const gridEl = document.getElementById('searchResults');
      if (!input || !gridEl) return;
      const query = input.value.trim();
      if (!query) return;

      gridEl.innerHTML = '';
      UI.setStatus(statusEl, 'Buscando...');

      const t0 = Date.now();
      try {
        const results = await API.searchCards(query, 20);
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        this._lastResults = results;
        if (!results.length) { UI.setStatus(statusEl, 'No se encontraron cartas.', true); return; }
        saveHistory(query);
        renderHistory();
        const note = elapsed > 0.5 ? ` (${elapsed}s)` : '';
        UI.setStatus(statusEl, `${results.length} resultado(s).${note}`);
        document.querySelectorAll('#searchFilters .filter-chip').forEach(b => b.classList.remove('active'));
        document.querySelector('#searchFilters .filter-chip[data-filter="all"]')?.classList.add('active');
        renderResults(results);
      } catch (err) {
        UI.setStatus(statusEl, 'Error: ' + err.message, true);
      }
    },

    updateDbStatus,
    checkAndDownloadNew
  };
})();

/* ==========================================
   COLLECTION MODULE (MI COLECCIÓN)
   ========================================== */
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
    const container = document.getElementById('collectionStats');
    if (!container) return;
    UI.renderStats(container, [
      { label: 'Total', value: stats.totalCards },
      { label: 'Pokémon', value: stats.pokemon },
      { label: 'Trainer', value: stats.trainers },
      { label: 'Energy', value: stats.energies },
      { label: 'Únicas', value: stats.uniqueCards }
    ]);
  }

  function applyFilters() {
    const typeFilter = document.getElementById('collectionFilterType')?.value || 'all';
    const elemFilter = document.getElementById('collectionFilterElement')?.value || 'all';
    const sortBy = document.getElementById('collectionSort')?.value || 'name';
    const nameSearch = document.getElementById('collectionSearch')?.value?.toLowerCase() || '';

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

    if (!grid) return;

    if (items.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');
    grid.innerHTML = '';
    items.forEach(c => {
      try {
        const el = UI.renderCard(c, { showQty: true });
        el.querySelector('.inc').addEventListener('click', () => { c.count++; save(); render(); });
        el.querySelector('.dec').addEventListener('click', () => { c.count = Math.max(0, c.count - 1); if (c.count === 0) delete data[Storage.generateId(c.name, c.setId, c.number)]; save(); render(); });
        el.querySelector('.remove-btn').addEventListener('click', () => { delete data[Storage.generateId(c.name, c.setId, c.number)]; save(); render(); });
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
    if (!currentCollectionName) { container.innerHTML = ''; return; }
    try {
      const saved = await Storage.loadNamedCollections();
      const current = saved.find(c => c.name === currentCollectionName);
      if (!current) { container.innerHTML = ''; return; }
      const total = current.data.reduce((s, x) => s + (x.count || 0), 0);
      container.innerHTML = '<div class="saved-collections-label">Colección actual:</div>' +
        `<div class="saved-chip" data-id="${current.id}">
            <span class="saved-chip-name">${current.name}</span>
            <span class="saved-chip-cards">${total} cartas</span>
          </div>`;
    } catch (err) { container.innerHTML = ''; }
  }

  return {
    getData() { return data; },
    getMap() { return { ...data }; },

    async init() {
      data = await Storage.loadCollection();
      render();

      document.getElementById('collectionFilterType')?.addEventListener('change', render);
      document.getElementById('collectionFilterElement')?.addEventListener('change', render);
      document.getElementById('collectionSort')?.addEventListener('change', render);
      document.getElementById('collectionSearch')?.addEventListener('input', render);

      document.getElementById('saveCollectionBtn')?.addEventListener('click', async () => {
        try {
          const nameInput = document.getElementById('collectionNameInput');
          const name = nameInput?.value?.trim() || ('Colección ' + new Date().toLocaleDateString('es-AR'));
          UI.toast('Guardando "' + name + '"...', 'info');
          await Storage.saveNamedCollection(name, data);
          currentCollectionName = name;
          UI.toast('Colección "' + name + '" guardada', 'success');
          renderSavedCollections();
        } catch (err) {
          UI.toast('Error al guardar: ' + err.message, 'error');
        }
      });

      document.getElementById('exportCollectionBtn')?.addEventListener('click', () => {
        const items = Object.values(data).map(c => ({ ...c }));
        const blob = new Blob([JSON.stringify({ name: currentCollectionName || 'Mi colección', exportedAt: Date.now(), cards: items }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (currentCollectionName || 'coleccion').replace(/[^a-z0-9]/gi, '_') + '.json';
        a.click();
        URL.revokeObjectURL(url);
        UI.toast('JSON exportado', 'success');
      });

      document.getElementById('importCollectionInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const cards = json.cards || json;
          if (!Array.isArray(cards)) { UI.toast('Formato inválido', 'error'); return; }
          cards.forEach(c => {
            const key = Storage.generateId(c.name, c.setId || '', c.number || '');
            data[key] = { ...c, count: c.count || 1 };
          });
          await Storage.saveCollection(data);
          render();
          UI.toast('Colección importada', 'success');
        } catch (err) { UI.toast('Error al importar', 'error'); }
        e.target.value = '';
      });

      renderSavedCollections();
    },

    addFromAPI(apiCard) {
      const setId = apiCard.set?.id || '';
      const key = Storage.generateId(apiCard.name, setId, apiCard.number);
      const prevCount = data[key] ? data[key].count : 0;
      data[key] = {
        id: apiCard.id || key, name: apiCard.name, image: apiCard.images?.small || '',
        set: apiCard.set?.name || '', setId: setId, number: apiCard.number || '',
        count: prevCount + 1, supertype: apiCard.supertype || '', types: apiCard.types || [],
        subtypes: apiCard.subtypes || [], evolvesFrom: apiCard.evolvesFrom || null,
        hp: apiCard.hp ? parseInt(apiCard.hp, 10) : null, rarity: apiCard.rarity || '',
        attacks: apiCard.attacks || [], abilities: apiCard.abilities || [],
        weaknesses: apiCard.weaknesses || [], resistances: apiCard.resistances || [],
        retreatCost: apiCard.retreatCost || [], text: apiCard.text || [],
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

    getCards() { return Object.values(data); },
    getMap() { return data; },
    render,
    getCurrentName() { return currentCollectionName; },
    setCurrentName(name) { currentCollectionName = name || ''; renderSavedCollections(); }
  };
})();

/* ==========================================
   WIZARD MODULE (ARMAR MAZO)
   ========================================== */
const Wizard = (() => {
  const STORAGE_KEY = 'trainersLedger.wizardProgress';

  const STEP_META = [
    { n: 1, key: 'plan', label: 'Plan' },
    { n: 2, key: 'pokemon', label: 'Pokémon' },
    { n: 3, key: 'energy', label: 'Energía' },
    { n: 4, key: 'draw', label: 'Robo' },
    { n: 5, key: 'supporters', label: 'Apoyo' },
    { n: 6, key: 'consistency', label: 'Consistencia' },
    { n: 7, key: 'tech', label: 'Amenazas' },
    { n: 8, key: 'final', label: 'Acta Final' },
  ];

  const ARCHETYPES = [
    { id: 'rush', name: 'Ataque rápido', desc: 'Pegar fuerte y noquear antes de que el rival arranque su plan.' },
    { id: 'control', name: 'Control / Disrupción', desc: 'Negar recursos: energías, bancas, mano del rival.' },
    { id: 'combo', name: 'Combo', desc: 'Ensamblar 2-3 piezas específicas para una jugada decisiva.' },
    { id: 'mill', name: 'Decking-out', desc: 'Forzar a que el rival se quede sin cartas para robar.' },
  ];

  let state = {
    step: 1,
    archetype: null,
    hasAcceleration: false,
    cards: [],
    threats: [{ threat: '', answer: '' }],
  };
  let nextId = 1;

  function getCollectionCards() {
    try {
      if (Collection.getCards) return Collection.getCards();
      if (Collection.getMap) return Object.values(Collection.getMap());
      return [];
    } catch (e) { return []; }
  }

  function countOwned(name) {
    try { return Collection.countByName(name); } catch (e) { return 0; }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(state, parsed);
        nextId = Math.max(1, ...state.cards.map(c => c.id + 1), 1);
      }
    } catch (e) { }
  }

  function importFromCollection() {
    const colCards = getCollectionCards();
    if (colCards.length === 0) {
      return { ok: false, msg: 'Tu colección está vacía. Agregá cartas desde "Buscar" primero.' };
    }
    let added = 0;
    const existingNames = new Set(state.cards.map(c => c.name.toLowerCase()));
    colCards.forEach(raw => {
      const name = raw.name;
      if (!name || existingNames.has(name.toLowerCase())) return;
      const cardDetails = getCardDetails(name) || raw;
      const supertype = (cardDetails.supertype || raw.supertype || raw.category || '').toLowerCase();
      const count = Number(raw.count || 1);

      if (supertype.includes('energ') || (raw.category === 'energy')) {
        state.cards.push({ id: nextId++, category: 'energy', name, energyType: (raw.types && raw.types[0]) || name, count });
        added++;
      } else if (supertype.includes('train') || (raw.category === 'trainer')) {
        const role = (raw.subtypes || cardDetails.subtypes || []).some(s => /supporter/i.test(s)) ? 'Supporter' : 'Item';
        state.cards.push({ id: nextId++, category: 'trainer', name, trainerRole: role, isDraw: false, count });
        added++;
      } else {
        const stageName = (cardDetails.subtypes || raw.subtypes || []).find(s => String(s).toLowerCase().includes('stage')) || 'Básico';
        state.cards.push({ id: nextId++, category: 'pokemon', name, stage: stageName, count });
        added++;
      }
      existingNames.add(name.toLowerCase());
    });
    save();
    return { ok: true, msg: `Importadas ${added} cartas de tu colección.` };
  }

  function cardsBy(cat) { return state.cards.filter(c => c.category === cat); }
  function sumCount(list) { return list.reduce((s, c) => s + Number(c.count || 0), 0); }
  function totalDeckCount() { return sumCount(state.cards); }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function buildSearchInputHtml(inputId, listId, placeholder) {
    return `<div class="search-wrap" style="flex:1;min-width:200px;">
      <input type="text" id="${inputId}" placeholder="${placeholder}" autocomplete="off" style="width:100%;"/>
      <div class="autocomplete-list" id="${listId}"></div>
    </div>`;
  }

  function getCardDetails(name) {
    if (!name) return null;
    const fromCol = Collection.findByName(name);
    if (fromCol) return fromCol;

    const fromDb = API.findCardInDb ? API.findCardInDb(name) : null;
    if (fromDb) return fromDb;

    return { name, supertype: 'Pokémon', subtypes: ['Basic'], evolvesFrom: '' };
  }

  function getEvolutionBase(card) {
    if (!card) return '';
    let current = getCardDetails(card.name || card) || (typeof card === 'string' ? { name: card } : card);
    let visited = new Set();
    let name = (current.name || '').toLowerCase().trim();

    while (current && current.evolvesFrom && !visited.has(name)) {
      visited.add(name);
      const parentName = current.evolvesFrom.trim();
      const parentCard = getCardDetails(parentName);
      if (!parentCard || parentCard.name.toLowerCase().trim() === name) break;
      current = parentCard;
      name = current.name.toLowerCase().trim();
    }
    return name;
  }

  function isEvolutionPartner(cardA, cardB) {
    if (!cardA || !cardB) return false;
    const detailsA = getCardDetails(cardA.name || cardA) || (typeof cardA === 'string' ? { name: cardA } : cardA);
    const detailsB = getCardDetails(cardB.name || cardB) || (typeof cardB === 'string' ? { name: cardB } : cardB);

    const nameA = (detailsA.name || '').toLowerCase().trim();
    const nameB = (detailsB.name || '').toLowerCase().trim();
    if (!nameA || !nameB || nameA === nameB) return false;

    const evoA = (detailsA.evolvesFrom || '').toLowerCase().trim();
    const evoB = (detailsB.evolvesFrom || '').toLowerCase().trim();

    // Direct evolution link (e.g. Cinderace evolves from Raboot / Raboot evolves from Scorbunny)
    if (evoA && (evoA === nameB || nameB.includes(evoA))) return true;
    if (evoB && (evoB === nameA || nameA.includes(evoB))) return true;

    // Chain evolution base link (e.g. Cinderace, Raboot, and Scorbunny all trace to Scorbunny base)
    if (evoA || evoB) {
      const baseA = getEvolutionBase(detailsA);
      const baseB = getEvolutionBase(detailsB);
      if (baseA && baseB && baseA === baseB) return true;
    }

    return false;
  }

  function shareFamily(nameA, nameB) {
    return isEvolutionPartner(nameA, nameB);
  }

  function calculateCompatibility(cardRaw, currentDeckCards) {
    const card = getCardDetails(cardRaw.name) || cardRaw;
    let score = 0;

    const deckDetailed = currentDeckCards.map(c => getCardDetails(c.name) || c);
    const pokemonInDeck = deckDetailed.filter(c => (c.supertype || c.category || '').toLowerCase().includes('pok'));
    const energyInDeck = currentDeckCards.filter(c => c.category === 'energy');

    const deckTypes = new Set();
    pokemonInDeck.forEach(p => { if (p.types) p.types.forEach(t => deckTypes.add(t)); });

    const deckEnergies = new Set();
    energyInDeck.forEach(e => { if (e.energyType) deckEnergies.add(e.energyType); });

    const cardTypes = card.types || [];
    const cardAttacks = card.attacks || [];

    let primaryReason = null;

    // 1. Completa evolución (+50 pts)
    const matchedDeckPokemon = pokemonInDeck.find(p => isEvolutionPartner(card, p));

    if (matchedDeckPokemon) {
      score += 50;
      primaryReason = 'Completa evolución de ' + matchedDeckPokemon.name;
    }

    // 2. Mismo tipo (+30 pts)
    const matchedType = cardTypes.find(t => deckTypes.has(t));
    if (matchedType && deckTypes.size > 0) {
      score += 30;
      const typeDisplay = UI.getEnergySymbol ? UI.getEnergySymbol(matchedType, true) : matchedType;
      if (!primaryReason) primaryReason = 'Mismo tipo (' + typeDisplay + ')';
    }

    // 3. Comparte energías (+30 pts)
    const attackCosts = new Set();
    cardAttacks.forEach(a => (a.cost || []).forEach(c => { if (c !== 'Colorless') attackCosts.add(c); }));
    const sharedEnergyType = [...attackCosts].find(c => deckEnergies.has(c));
    const sharesEnergy = Boolean(sharedEnergyType);
    if (sharesEnergy && deckEnergies.size > 0) {
      score += 30;
      const energyDisplay = UI.getEnergySymbol ? UI.getEnergySymbol(sharedEnergyType, true) : sharedEnergyType;
      if (!primaryReason) primaryReason = 'Comparte energía ' + energyDisplay;
    }

    // 4. Habilidad útil (+20 pts)
    if (card.abilities && card.abilities.length > 0) {
      score += 20;
      if (!primaryReason) primaryReason = 'Habilidad útil';
    }

    // 5. Potencia / Consistencia (+15 pts)
    if (card.hp && parseInt(card.hp, 10) >= 200) {
      score += 15;
      if (!primaryReason) primaryReason = 'Mayor potencia';
    } else if (card.subtypes && card.subtypes.some(s => s.toLowerCase().includes('ex') || s.toLowerCase().includes('v'))) {
      score += 15;
      if (!primaryReason) primaryReason = 'Más consistencia';
    }

    if (!primaryReason) primaryReason = 'Buena cobertura';

    // Penalty: -30 si requiere un tipo de energía nuevo
    const newEnergyNeeded = [...attackCosts].some(c => !deckEnergies.has(c) && deckEnergies.size > 0);
    if (newEnergyNeeded && !sharesEnergy) {
      score -= 30;
    }

    return {
      score,
      reason: primaryReason
    };
  }

  function getStageCategory(c) {
    const card = getCardDetails(c.name) || c;
    const subtypes = (card.subtypes || []).map(s => String(s).toLowerCase());
    const evoFrom = (card.evolvesFrom || '').trim();

    if (subtypes.some(s => s.includes('ex') || s.includes('vstar') || s.includes('vmax') || s.includes('v') || s.includes('gx'))) {
      return 'ex';
    }
    if (subtypes.some(s => s.includes('stage 2') || s.includes('fase 2'))) {
      return 'stage2';
    }
    if (subtypes.some(s => s.includes('basic') || s.includes('básico') || s.includes('basico'))) {
      return 'basic';
    }
    if (subtypes.some(s => s.includes('stage 1') || s.includes('fase 1')) || Boolean(evoFrom)) {
      return 'stage1';
    }
    return 'basic';
  }

  function getDeckRole(c) {
    const card = getCardDetails(c.name) || c;
    const hp = parseInt(card.hp || 0, 10);
    const abilities = card.abilities || [];
    const subtypes = (card.subtypes || []).map(s => s.toLowerCase());

    // 1. Motor / Banca (Bench engine & Support)
    const hasSupportAbility = abilities.some(a => {
      const text = ((a.name || '') + ' ' + (a.text || '')).toLowerCase();
      return text.includes('search') || text.includes('draw') || text.includes('attach') || text.includes('energy') || text.includes('cards') || text.includes('restart');
    });
    if (hasSupportAbility) return 'support';

    // 2. Atacante Principal (Main Heavy Attacker)
    if (hp >= 200 || subtypes.includes('stage 2') || subtypes.includes('vstar') || subtypes.includes('vmax') || subtypes.includes('ex') || subtypes.includes('v')) {
      return 'main';
    }

    // 3. Atacante Secundario / Reserva (Backup / Tech Attacker)
    return 'secondary';
  }

  function matchesStageOrRoleFilter(c, filter) {
    if (!filter || filter === 'all') return true;
    if (filter === 'main' || filter === 'secondary' || filter === 'support') {
      return getDeckRole(c) === filter;
    }
    return getStageCategory(c) === filter;
  }

  function buildSuggestionsHtml(filterSupertype) {
    const colCards = getCollectionCards();
    const currentDeck = state.cards;
    const alreadyAdded = new Set(currentDeck.map(c => c.name.toLowerCase()));

    // Filter collection cards
    const isSupertypeMatch = (c, type) => {
      const details = getCardDetails(c.name) || c;
      const supertype = (details.supertype || c.supertype || c.category || '').toLowerCase();
      if (type === 'pokemon') return supertype.includes('pok') || (!supertype.includes('train') && !supertype.includes('energ'));
      if (type === 'energy') return supertype.includes('energ');
      if (type === 'trainer') return supertype.includes('train');
      return true;
    };

    let ownedCandidates = colCards.filter(c => isSupertypeMatch(c, filterSupertype));

    if (state.stageFilter && state.stageFilter !== 'all' && filterSupertype === 'pokemon') {
      ownedCandidates = ownedCandidates.filter(c => matchesStageOrRoleFilter(c, state.stageFilter));
      missingCandidates = missingCandidates.filter(c => matchesStageOrRoleFilter(c, state.stageFilter));
    }

    if (state.elementFilter && state.elementFilter !== 'all' && (filterSupertype === 'pokemon' || filterSupertype === 'energy')) {
      const isElemMatch = (cardItem) => {
        const details = getCardDetails(cardItem.name) || cardItem;
        const types = details.types || cardItem.types || [];
        if (types.includes(state.elementFilter)) return true;
        if (cardItem.energyType === state.elementFilter) return true;
        return false;
      };
      ownedCandidates = ownedCandidates.filter(isElemMatch);
      missingCandidates = missingCandidates.filter(isElemMatch);
    }

    const missingScored = missingCandidates.map(c => {
      const compat = calculateCompatibility(c, currentDeck);
      return { ...c, score: compat.score, reason: c.reason || compat.reason };
    }).sort((a, b) => b.score - a.score);

    const topMissing = missingScored.slice(0, 6);

    const renderChip = (c) => {
      const card = getCardDetails(c.name) || c;
      const typeRaw = (card.types && card.types[0]) || c.energyType || 'Colorless';
      const typeVarMap = { Fire: 'fire', Water: 'water', Grass: 'grass', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Colorless: 'colorless', Dragon: 'dragon', Fairy: 'dragon' };
      const typeCharMap = { Fire: 'r', Water: 'w', Grass: 'g', Lightning: 'l', Psychic: 'p', Fighting: 'f', Darkness: 'd', Metal: 'm', Colorless: 'c', Dragon: 'n', Fairy: 'y' };

      const typeClass = typeVarMap[typeRaw] || 'colorless';
      const typeChar = typeCharMap[typeRaw] || 'c';
      const typeIconHtml = `<span class="chip-type-circle cost-typed cost-${typeClass}" title="${typeRaw}"><span class="tcg-sym">${typeChar}</span></span>`;

      const added = alreadyAdded.has(c.name.toLowerCase());
      const owned = countOwned(c.name);
      const ownedBadge = owned > 0 ? `<span class="chip-owned">Tenés ${owned}</span>` : '';
      const addedBadge = added ? `<span class="chip-added">✓</span>` : '';
      return `<button type="button" class="filter-chip wiz-suggest-chip smart-chip ${added ? 'active' : ''}" data-suggest-name="${escapeHtml(c.name)}">
        <div class="chip-left-icon">
          ${typeIconHtml}
        </div>
        <div class="chip-body">
          <div class="chip-top">
            <span class="chip-name">${escapeHtml(c.name)}</span>
            ${ownedBadge}
            ${addedBadge}
          </div>
          <span class="chip-reason">${escapeHtml(c.reason)}</span>
        </div>
      </button>`;
    };

    const ownedHtml = topOwned.length > 0
      ? topOwned.map(renderChip).join('')
      : '<div class="empty" style="font-size:11px;padding:6px;">No tenés cartas disponibles para este filtro.</div>';

    const missingHtml = topMissing.length > 0
      ? topMissing.map(renderChip).join('')
      : '<div class="empty" style="font-size:11px;padding:6px;">No hay sugerencias para este filtro.</div>';

    const stageFiltersHtml = (filterSupertype === 'pokemon' || filterSupertype === 'energy') ? `
      <div class="element-filter-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0 10px;">
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-dim);font-weight:600;margin-right:2px;">Tipo:</span>
        <button type="button" class="type-filter-btn ${(!state.elementFilter || state.elementFilter === 'all') ? 'active' : ''}" data-elem="all" title="Todos los elementos">★</button>
        <button type="button" class="type-filter-btn cost-typed cost-fire ${state.elementFilter === 'Fire' ? 'active' : ''}" data-elem="Fire" title="Fuego"><span class="tcg-sym">r</span></button>
        <button type="button" class="type-filter-btn cost-typed cost-water ${state.elementFilter === 'Water' ? 'active' : ''}" data-elem="Water" title="Agua"><span class="tcg-sym">w</span></button>
        <button type="button" class="type-filter-btn cost-typed cost-grass ${state.elementFilter === 'Grass' ? 'active' : ''}" data-elem="Grass" title="Planta"><span class="tcg-sym">g</span></button>
        <button type="button" class="type-filter-btn cost-typed cost-electric ${state.elementFilter === 'Lightning' ? 'active' : ''}" data-elem="Lightning" title="Rayo"><span class="tcg-sym">l</span></button>
        <button type="button" class="type-filter-btn cost-typed cost-psychic ${state.elementFilter === 'Psychic' ? 'active' : ''}" data-elem="Psychic" title="Psíquico"><span class="tcg-sym">p</span></button>
        <button type="button" class="type-filter-btn cost-typed cost-fighting ${state.elementFilter === 'Fighting' ? 'active' : ''}" data-elem="Fighting" title="Lucha"><span class="tcg-sym">f</span></button>
        <button type="button" class="type-filter-btn cost-typed cost-darkness ${state.elementFilter === 'Darkness' ? 'active' : ''}" data-elem="Darkness" title="Oscuridad"><span class="tcg-sym">d</span></button>
        <button type="button" class="type-filter-btn cost-typed cost-metal ${state.elementFilter === 'Metal' ? 'active' : ''}" data-elem="Metal" title="Metal"><span class="tcg-sym">m</span></button>
        <button type="button" class="type-filter-btn cost-typed cost-dragon ${state.elementFilter === 'Dragon' ? 'active' : ''}" data-elem="Dragon" title="Dragón"><span class="tcg-sym">n</span></button>
        <button type="button" class="type-filter-btn cost-colorless ${state.elementFilter === 'Colorless' ? 'active' : ''}" data-elem="Colorless" title="Incoloro"><span class="tcg-sym">c</span></button>
      </div>
      ${filterSupertype === 'pokemon' ? `
      <div class="stage-filter-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:4px 0 10px;">
        <span style="font-family:var(--mono);font-size:11px;color:var(--text-dim);font-weight:600;margin-right:2px;">Filtro TCG:</span>
        <button type="button" class="filter-chip wiz-stage-btn ${state.stageFilter === 'all' ? 'active' : ''}" data-stage="all">Todos</button>
        <button type="button" class="filter-chip wiz-stage-btn ${state.stageFilter === 'main' ? 'active' : ''}" data-stage="main">⚔️ Atacante Principal</button>
        <button type="button" class="filter-chip wiz-stage-btn ${state.stageFilter === 'secondary' ? 'active' : ''}" data-stage="secondary">🛡️ Reserva / Secundario</button>
        <button type="button" class="filter-chip wiz-stage-btn ${state.stageFilter === 'support' ? 'active' : ''}" data-stage="support">⚙️ Motor / Banca</button>
        <button type="button" class="filter-chip wiz-stage-btn ${state.stageFilter === 'basic' ? 'active' : ''}" data-stage="basic">🌱 Básicos</button>
        <button type="button" class="filter-chip wiz-stage-btn ${state.stageFilter === 'stage1' ? 'active' : ''}" data-stage="stage1">⚡ Nivel 1</button>
        <button type="button" class="filter-chip wiz-stage-btn ${state.stageFilter === 'stage2' ? 'active' : ''}" data-stage="stage2">🔥 Nivel 2</button>
      </div>` : ''}
    ` : '';

    return `
      <div class="smart-suggestions-block" style="margin-bottom:12px;">
        <p class="hint" style="margin-bottom:2px;font-weight:700;">🧠 Recomendaciones inteligentes</p>
        <div class="hint-small">
          Mostramos primero las mejores cartas de tu colección y, si faltan, las mejoras recomendadas para este mazo.
        </div>

        ${stageFiltersHtml}

        <div class="suggest-section">
          <div class="suggest-title">⭐ De tu colección</div>
          <div id="ownedSuggestions" class="chip-container">${ownedHtml}</div>
        </div>

        <div class="suggest-section">
          <div class="suggest-title">💎 Mejoras</div>
          <div id="missingSuggestions" class="chip-container">${missingHtml}</div>
        </div>
      </div>
    `;
  }

  function renderGroupedList(items) {
    if (!items.length) return '<div class="empty">Sin cartas.</div>';
    const cats = [
      { key: 'pokemon', label: 'Pokémon' },
      { key: 'trainer', label: 'Entrenadores' },
      { key: 'energy', label: 'Energía' }
    ];

    let html = '';
    for (const cat of cats) {
      const group = items.filter(i => (i.category || 'pokemon') === cat.key);
      if (!group.length) continue;
      html += `<div style="font-family:var(--mono);font-size:11px;color:var(--text-dim);text-transform:uppercase;margin:8px 0 4px;font-weight:600;letter-spacing:0.5px;">${cat.label} (${group.reduce((s, x) => s + x.qty, 0)})</div>`;
      html += group.map(i => `<div class="list-item"><span class="li-name">${escapeHtml(i.name)}</span><span class="li-qty">x${i.qty}</span></div>`).join('');
    }
    return html || '<div class="empty">Sin cartas.</div>';
  }

  function updateHaveNeedPanel() {
    const haveList = [], needList = [];
    state.cards.forEach(c => {
      const owned = countOwned(c.name);
      const needed = Number(c.count || 0);
      const cat = c.category || 'pokemon';
      if (owned >= needed) haveList.push({ name: c.name, category: cat, qty: needed });
      else if (owned > 0) {
        haveList.push({ name: c.name, category: cat, qty: owned });
        needList.push({ name: c.name, category: cat, qty: needed - owned });
      }
      else needList.push({ name: c.name, category: cat, qty: needed });
    });

    const buyEl = document.getElementById('buyList');
    const haveEl = document.getElementById('removeList');
    if (buyEl) buyEl.innerHTML = needList.length === 0 ? '<div class="empty">¡Tenés todo lo que necesitás!</div>' : renderGroupedList(needList);
    if (haveEl) haveEl.innerHTML = haveList.length === 0 ? '<div class="empty">Todavía no agregaste cartas.</div>' : renderGroupedList(haveList);
  }

  function renderChips() {
    const rail = document.getElementById('wizardStepChips');
    if (!rail) return;
    rail.innerHTML = STEP_META.map(s => `<button type="button" class="filter-chip ${state.step === s.n ? 'active' : ''}" data-wizard-step="${s.n}">${s.n}. ${s.label}</button>`).join('');
  }

  function getStageBadge(c) {
    const card = getCardDetails(c.name) || c;
    const subtypes = (card.subtypes || []).map(s => String(s).toLowerCase());
    const evoFrom = (card.evolvesFrom || '').trim();

    if (subtypes.some(s => s.includes('ex') || s.includes('vstar') || s.includes('vmax') || s.includes('v'))) {
      return '<span class="stage-tag tag-ex">ex</span>';
    }
    if (subtypes.some(s => s.includes('stage 2') || s.includes('fase 2'))) {
      return '<span class="stage-tag tag-stage2">Fase 2</span>';
    }
    if (subtypes.some(s => s.includes('basic') || s.includes('básico') || s.includes('basico'))) {
      return '<span class="stage-tag tag-basic">Básico</span>';
    }
    if (subtypes.some(s => s.includes('stage 1') || s.includes('fase 1')) || Boolean(evoFrom)) {
      return '<span class="stage-tag tag-stage1">Fase 1</span>';
    }
    return '<span class="stage-tag tag-basic">Básico</span>';
  }

  function getTypeBadge(c) {
    const card = getCardDetails(c.name) || c;
    const typeRaw = (card.types && card.types[0]) || c.energyType || 'Colorless';
    const symbolHtml = UI.getEnergySymbol ? UI.getEnergySymbol(typeRaw) : escapeHtml(typeRaw);
    return `<span class="type-tag">${symbolHtml}</span>`;
  }

  function checkEvolutionLineValidity(c, currentDeckCards = state.cards) {
    const card = getCardDetails(c.name) || c;
    const supertype = (card.supertype || c.category || '').toLowerCase();
    if (!supertype.includes('pok')) return { valid: true, warning: '' };

    const stageCat = getStageCategory(card);
    if (stageCat === 'basic' || stageCat === 'ex') return { valid: true, warning: '' };

    const evolvesFrom = (card.evolvesFrom || '').trim();
    const deckPokemon = currentDeckCards.filter(x => (x.category || '').toLowerCase() === 'pokemon').map(x => getCardDetails(x.name) || x);
    const deckNames = currentDeckCards.map(x => (x.name || '').toLowerCase());

    const hasRareCandy = deckNames.some(n => n.includes('rare candy') || n.includes('caramelo raro'));

    if (stageCat === 'stage1') {
      const hasBasic = deckPokemon.some(p => {
        const pStage = getStageCategory(p);
        if (pStage !== 'basic') return false;
        const pName = (p.name || '').toLowerCase();
        if (evolvesFrom && (pName.includes(evolvesFrom.toLowerCase()) || evolvesFrom.toLowerCase().includes(pName))) return true;
        return shareFamily(card.name, p.name);
      });
      if (!hasBasic) {
        return {
          valid: false,
          warning: `Falta el Pokémon Básico ${evolvesFrom ? `(${evolvesFrom}) ` : ''}en el mazo para poder evolucionar.`
        };
      }
    } else if (stageCat === 'stage2') {
      const hasBasic = deckPokemon.some(p => getStageCategory(p) === 'basic' && shareFamily(card.name, p.name));
      const hasStage1 = deckPokemon.some(p => getStageCategory(p) === 'stage1' && shareFamily(card.name, p.name));
      const hasStage1OrCandy = hasStage1 || hasRareCandy;

      if (!hasBasic && !hasStage1OrCandy) {
        return {
          valid: false,
          warning: `Falta el Pokémon Básico y (Fase 1 o Rare Candy / Caramelo Raro) en el mazo.`
        };
      } else if (!hasBasic) {
        return {
          valid: false,
          warning: `Falta el Pokémon Básico en el mazo para completar la línea evolutiva.`
        };
      } else if (!hasStage1OrCandy) {
        return {
          valid: false,
          warning: `Falta Fase 1 o Rare Candy (Caramelo Raro) en el mazo para evolucionar.`
        };
      }
    }

    return { valid: true, warning: '' };
  }

  function renderCardRow(c) {
    const owned = countOwned(c.name);
    const needed = Number(c.count || 0);
    const missing = Math.max(0, needed - owned);
    const typeBadge = getTypeBadge(c);
    const stageBadge = getStageBadge(c);
    const evoCheck = checkEvolutionLineValidity(c, state.cards);

    const rowClass = evoCheck.valid ? '' : 'row-evo-warning';
    const warningBtn = evoCheck.valid ? '' : `<button type="button" class="ghost info-warn-btn" title="${escapeHtml(evoCheck.warning)}" onclick="UI.toast('${escapeHtml(evoCheck.warning)}', 'error')"><span class="warn-icon">⚠️</span></button>`;

    return `
    <tr data-id="${c.id}" class="${rowClass}">
      <td class="col-name">${escapeHtml(c.name)} ${warningBtn}</td>
      <td class="col-type">${typeBadge}</td>
      <td class="col-stage">${stageBadge}</td>
      <td class="col-qty"><button type="button" class="ghost wizard-qty" data-qty="-1" data-id="${c.id}">−</button> <span class="qty-num">${c.count}</span> <button type="button" class="ghost wizard-qty" data-qty="1" data-id="${c.id}">+</button></td>
      <td class="col-owned ${missing > 0 ? 'owned-missing' : 'owned-complete'}">${missing > 0 ? `Falta ${missing}` : `✔ ${owned}`}</td>
      <td class="col-action"><button type="button" class="ghost wizard-remove" data-remove="${c.id}">✕</button></td>
    </tr>`;
  }

  function renderCardTable(list, category) {
    if (list.length === 0) return `<div class="empty">Todavía no agregaste cartas acá.</div>`;

    if (category === 'pokemon') {
      const groups = [
        { key: 'main', label: '⚔️ Atacantes Principales', items: list.filter(c => getDeckRole(c) === 'main') },
        { key: 'secondary', label: '🛡️ Atacantes de Reserva / Secundarios', items: list.filter(c => getDeckRole(c) === 'secondary') },
        { key: 'support', label: '⚙️ Motor de Banca / Apoyo', items: list.filter(c => getDeckRole(c) === 'support') }
      ];

      let html = '';
      groups.forEach(g => {
        if (g.items.length === 0) return;
        html += `<div class="table-group-block" style="margin-top:14px;margin-bottom:14px;">
          <div style="font-family:var(--mono);font-size:11px;font-weight:700;color:var(--holo-a);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${g.label} (${g.items.reduce((s, x) => s + Number(x.count || 1), 0)})</div>
          <table class="wizard-ledger aligned-ledger">
            <thead>
              <tr>
                <th style="width:30%;">Nombre</th>
                <th style="width:20%;">Tipo</th>
                <th style="width:16%;">Nivel</th>
                <th style="width:16%;text-align:center;">Cant.</th>
                <th style="width:12%;text-align:center;">Tenés</th>
                <th style="width:6%;text-align:right;"></th>
              </tr>
            </thead>
            <tbody>
              ${g.items.map(renderCardRow).join('')}
            </tbody>
          </table>
        </div>`;
      });
      return html || `<div class="empty">Todavía no agregaste cartas acá.</div>`;
    }

    return `
      <table class="wizard-ledger aligned-ledger">
        <thead>
          <tr>
            <th style="width:30%;">Nombre</th>
            <th style="width:20%;">Tipo</th>
            <th style="width:16%;">Nivel</th>
            <th style="width:16%;text-align:center;">Cant.</th>
            <th style="width:12%;text-align:center;">Tenés</th>
            <th style="width:6%;text-align:right;"></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(renderCardRow).join('')}
        </tbody>
      </table>`;
  }

  function renderStepBody(n) {
    if (n === 1) {
      return `<p class="hint">Elegí el plan para tu mazo:</p>
        <div class="grid" id="wizardArchetypeGrid">
          ${ARCHETYPES.map(a => `<button type="button" class="card-box wizard-arche ${state.archetype === a.id ? 'active' : ''}" data-archetype="${a.id}"><strong>${a.name}</strong><p class="hint">${a.desc}</p></button>`).join('')}
        </div>`;
    }
    if (n === 2) {
      return `<p class="hint">Buscá Pokémon para agregar:</p>${buildSuggestionsHtml('pokemon')}
        <div class="row" style="gap:8px;align-items:center;">
          ${buildSearchInputHtml('wizPkSearch', 'wizPkAutocomplete', 'Buscar Pokémon...')}
          <input type="number" id="wizPkCount" min="1" max="4" value="1" style="width:70px;">
          <button class="action" id="wizAddPk">Agregar</button>
        </div>
        ${renderCardTable(cardsBy('pokemon'), 'pokemon')}`;
    }
    if (n === 3) {
      return `<p class="hint">Buscá Energías:</p>${buildSuggestionsHtml('energy')}
        <div class="row" style="gap:8px;align-items:center;">
          ${buildSearchInputHtml('wizEnSearch', 'wizEnAutocomplete', 'Buscar Energía...')}
          <input type="number" id="wizEnCount" min="1" max="20" value="1" style="width:70px;">
          <button class="action" id="wizAddEn">Agregar</button>
        </div>
        ${renderCardTable(cardsBy('energy'), 'energy')}`;
    }
    if (n === 4) {
      return `<p class="hint">Cartas de robo:</p>${renderCardTable(cardsBy('trainer').filter(c => c.isDraw), 'trainer')}`;
    }
    if (n === 5) {
      return `<p class="hint">Buscá Entrenadores / Apoyo:</p>${buildSuggestionsHtml('trainer')}
        <div class="row" style="gap:8px;align-items:center;">
          ${buildSearchInputHtml('wizTrSearch', 'wizTrAutocomplete', 'Buscar Trainer...')}
          <input type="number" id="wizTrCount" min="1" max="4" value="1" style="width:70px;">
          <label><input type="checkbox" id="wizTrDraw"> Es robo</label>
          <button class="action" id="wizAddTr">Agregar</button>
        </div>
        ${renderCardTable(cardsBy('trainer'), 'trainer')}`;
    }
    if (n === 6) {
      return `<div class="status">Total mazo: <strong>${totalDeckCount()}</strong> / 60 cartas.</div>`;
    }
    if (n === 7) {
      return `<p class="hint">Amenazas y respuestas:</p>
        ${state.threats.map((t, i) => `<div class="row"><input type="text" class="wizThreatInput" value="${escapeHtml(t.threat)}" placeholder="Amenaza"/><input type="text" class="wizAnswerInput" value="${escapeHtml(t.answer)}" placeholder="Tech"/><button type="button" class="ghost" data-remove-threat="${i}">✕</button></div>`).join('')}
        <button type="button" class="ghost" id="wizAddThreat">+ Amenaza</button>`;
    }
    if (n === 8) {
      return `<div class="status">Mazo completo — <strong>${totalDeckCount()} cartas</strong>.</div>
        <div style="display:flex;gap:8px;margin-top:12px;">
          <button type="button" class="action" id="wizSaveDeck">Guardar mazo</button>
          <button type="button" class="ghost" id="wizExport">Exportar TXT</button>
        </div>`;
    }
    return '';
  }

  function render() {
    renderChips();
    const body = document.getElementById('wizardStepBody');
    if (body) body.innerHTML = renderStepBody(state.step);
    attachStepListeners();
    updateHaveNeedPanel();
    save();
  }

  function setupAutocomplete(inputId, listId, onSelect) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (val.length < 2) { list.classList.remove('show'); return; }
      setTimeout(async () => {
        try {
          const suggestions = await API.autocomplete(val);
          if (!suggestions.length) { list.classList.remove('show'); return; }
          list.innerHTML = suggestions.map(s => {
            const owned = countOwned(s);
            const badge = owned > 0 ? `<span class="ac-owned">Tenés ${owned}</span>` : '';
            return `<div class="autocomplete-item" data-val="${escapeHtml(s)}"><span>${escapeHtml(s)}</span>${badge}</div>`;
          }).join('');
          list.classList.add('show');
          list.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
              const cardName = el.dataset.val || el.querySelector('span')?.textContent || el.textContent;
              input.value = cardName;
              list.classList.remove('show');
              if (onSelect) onSelect(cardName);
            });
          });
        } catch (e) { list.classList.remove('show'); }
      }, 50);
    });
  }

  async function addCardByName(name, category, countInputId, extraOpts) {
    if (!name) return;
    const count = countInputId ? (Number(document.getElementById(countInputId)?.value) || 1) : 1;
    const details = getCardDetails(name);
    state.cards.push({
      id: nextId++,
      category,
      name,
      count,
      isDraw: extraOpts?.isDraw || false,
      types: details?.types || [],
      subtypes: details?.subtypes || [],
      evolvesFrom: details?.evolvesFrom || null,
      hp: details?.hp || null,
      attacks: details?.attacks || [],
      abilities: details?.abilities || []
    });
    render();
  }

  function attachStepListeners() {
    const body = document.getElementById('wizardStepBody');
    if (!body) return;

    body.querySelectorAll('.wizard-qty').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id), delta = Number(btn.dataset.qty);
        const card = state.cards.find(c => c.id === id);
        if (card) { card.count = Math.max(1, Number(card.count) + delta); render(); }
      });
    });
    body.querySelectorAll('.wizard-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        state.cards = state.cards.filter(c => c.id !== Number(btn.dataset.remove));
        render();
      });
    });

    body.querySelectorAll('.wiz-stage-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.stageFilter = btn.dataset.stage;
        render();
      });
    });

    body.querySelectorAll('[data-elem]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.elementFilter = btn.dataset.elem;
        render();
      });
    });

    body.querySelectorAll('.wiz-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const name = chip.dataset.suggestName;
        let cat = state.step === 3 ? 'energy' : state.step === 5 ? 'trainer' : 'pokemon';
        addCardByName(name, cat, null, null);
      });
    });

    if (state.step === 1) {
      body.querySelectorAll('[data-archetype]').forEach(btn => {
        btn.addEventListener('click', () => { state.archetype = btn.dataset.archetype; render(); });
      });
    }
    if (state.step === 2) {
      setupAutocomplete('wizPkSearch', 'wizPkAutocomplete');
      document.getElementById('wizAddPk')?.addEventListener('click', () => {
        const name = document.getElementById('wizPkSearch')?.value?.trim();
        if (name) addCardByName(name, 'pokemon', 'wizPkCount');
      });
    }
    if (state.step === 3) {
      setupAutocomplete('wizEnSearch', 'wizEnAutocomplete');
      document.getElementById('wizAddEn')?.addEventListener('click', () => {
        const name = document.getElementById('wizEnSearch')?.value?.trim();
        if (name) addCardByName(name, 'energy', 'wizEnCount');
      });
    }
    if (state.step === 5) {
      setupAutocomplete('wizTrSearch', 'wizTrAutocomplete');
      document.getElementById('wizAddTr')?.addEventListener('click', () => {
        const name = document.getElementById('wizTrSearch')?.value?.trim();
        const isDraw = document.getElementById('wizTrDraw')?.checked || false;
        if (name) addCardByName(name, 'trainer', 'wizTrCount', { isDraw });
      });
    }
    if (state.step === 7) {
      document.getElementById('wizAddThreat')?.addEventListener('click', () => { state.threats.push({ threat: '', answer: '' }); render(); });
      body.querySelectorAll('[data-remove-threat]').forEach(btn => {
        btn.addEventListener('click', () => { state.threats.splice(Number(btn.dataset.removeThreat), 1); render(); });
      });
    }
    if (state.step === 8) {
      document.getElementById('wizExport')?.addEventListener('click', exportDeckAsText);
      document.getElementById('wizSaveDeck')?.addEventListener('click', async () => {
        const name = prompt('Nombre del mazo:', 'Mi Mazo') || 'Mi Mazo';
        const deckData = {
          archetypeName: state.archetype || 'Personalizado',
          totalCards: totalDeckCount(),
          cards: state.cards,
          deck: {
            pokemon: cardsBy('pokemon').map(c => ({ name: c.name, qty: c.count, need: c.count })),
            trainers: cardsBy('trainer').map(c => ({ name: c.name, qty: c.count, need: c.count })),
            energies: cardsBy('energy').map(c => ({ name: c.name, qty: c.count, need: c.count }))
          }
        };
        await Storage.saveNamedDeck(name, deckData);
        UI.toast(`Mazo "${name}" guardado`, 'success');
      });
    }
  }

  function exportDeckAsText() {
    const lines = ['Pokémon:'];
    cardsBy('pokemon').forEach(c => lines.push(`${c.count}x ${c.name}`));
    lines.push('', 'Entrenadores:');
    cardsBy('trainer').forEach(c => lines.push(`${c.count}x ${c.name}`));
    lines.push('', 'Energía:');
    cardsBy('energy').forEach(c => lines.push(`${c.count}x ${c.name}`));
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mazo.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadSavedDeck(deckData, name) {
    if (deckData && deckData.cards) state.cards = deckData.cards;
    state.step = 8;
    render();
    UI.toast(`Mazo "${name || ''}" cargado`, 'success');
  }

  function init() {
    const panel = document.getElementById('panel-build');
    if (!panel) return;
    load();
    document.getElementById('wizardStepChips')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-wizard-step]');
      if (btn) { state.step = Number(btn.dataset.wizardStep); render(); }
    });
    document.getElementById('wizImportBtn')?.addEventListener('click', () => {
      const res = importFromCollection();
      UI.toast(res.msg, res.ok ? 'success' : 'info');
      if (res.ok) render();
    });
    document.getElementById('wizClearBtn')?.addEventListener('click', () => {
      if (state.cards.length === 0) {
        UI.toast('El mazo ya está vacío', 'info');
        return;
      }
      if (confirm('¿Vaciar todas las cartas del mazo actual?')) {
        state.cards = [];
        render();
        UI.toast('Mazo vaciado', 'success');
      }
    });
    render();
  }

  return { init, loadSavedDeck };
})();

/* ==========================================
   SAVED MODULE (GUARDADO)
   ========================================== */
const Saved = (() => {
  let searchTimer = null;
  let isInitialized = false;

  function setupSearch() {
    const input = document.getElementById('savedCollectionSearch');
    const list = document.getElementById('savedSearchAutocomplete');
    if (!input || !list) return;

    input.addEventListener('input', () => {
      clearTimeout(searchTimer);
      const val = input.value.trim().toLowerCase();

      searchTimer = setTimeout(async () => {
        renderCollections(val);

        if (val.length < 2) {
          list.classList.remove('show');
          return;
        }

        const apiSuggestions = await API.autocomplete(val);

        const saved = await Storage.loadNamedCollections();
        const liveData = Collection.getMap();
        const liveName = Collection.getCurrentName();
        const localCards = [];

        if (liveName) Object.values(liveData).forEach(c => localCards.push(c.name));
        saved.forEach(col => (col.data || []).forEach(c => localCards.push(c.name)));

        const matchingLocal = [...new Set(localCards)].filter(n => (n || '').toLowerCase().includes(val));
        const combined = [...new Set([...matchingLocal, ...apiSuggestions])].slice(0, 10);

        if (!combined.length) {
          list.classList.remove('show');
          return;
        }

        list.innerHTML = combined.map(s => {
          const owned = Collection.countByName(s);
          const badge = owned > 0 ? `<span class="ac-owned">Tenés ${owned}</span>` : '';
          return `<div class="autocomplete-item" data-val="${escapeHtml(s)}"><span>${escapeHtml(s)}</span>${badge}</div>`;
        }).join('');

        list.classList.add('show');
        list.querySelectorAll('.autocomplete-item').forEach(el => {
          el.addEventListener('click', () => {
            const cardName = el.dataset.val || el.querySelector('span')?.textContent || el.textContent;
            input.value = cardName;
            list.classList.remove('show');
            renderCollections(cardName.toLowerCase());
          });
        });
      }, API.isDbReady ? 50 : 200);
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#savedCollectionSearch') && !e.target.closest('#savedSearchAutocomplete')) {
        list.classList.remove('show');
      }
    });

    document.getElementById('exportAllCollectionsTxt')?.addEventListener('click', async () => {
      const saved = await Storage.loadNamedCollections();
      if (!saved.length) { UI.toast('No hay colecciones para exportar', 'info'); return; }

      let text = '=== COLECCIONES GUARDADAS ===\n\n';
      saved.forEach(col => {
        text += `--- ${col.name} ---\n`;
        (col.data || []).forEach(c => {
          text += `${c.count || 1}x ${c.name} (${c.set || ''} #${c.number || ''})\n`;
        });
        text += '\n';
      });

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'todas_las_colecciones.txt';
      a.click();
      URL.revokeObjectURL(url);
      UI.toast('Colecciones exportadas a TXT', 'success');
    });
  }

  async function renderCollections(searchQuery = '') {
    const container = document.getElementById('savedCollectionsFull');
    const empty = document.getElementById('savedCollectionsEmpty');
    if (!container) return;

    const saved = await Storage.loadNamedCollections();
    const liveData = Collection.getMap();
    const liveName = Collection.getCurrentName();

    const currentEntry = liveName ? { id: 'current', name: liveName, savedAt: Date.now(), data: Object.values(liveData) } : null;
    const others = liveName ? saved.filter(c => c.name !== liveName) : saved;
    let all = currentEntry ? [currentEntry, ...others] : others;

    if (searchQuery) {
      all = all.map(col => {
        const matchingCards = (col.data || []).filter(c => (c.name || '').toLowerCase().includes(searchQuery));
        const matchesColName = (col.name || '').toLowerCase().includes(searchQuery);
        if (matchesColName || matchingCards.length > 0) {
          return { ...col, matchingCards };
        }
        return null;
      }).filter(Boolean);
    }

    if (all.length === 0) {
      container.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        empty.textContent = searchQuery ? `No se encontraron colecciones con "${searchQuery}".` : 'No tenés colecciones guardadas. Andá a "Colección" y guardá una.';
      }
      return;
    }
    if (empty) empty.style.display = 'none';

    container.innerHTML = all.map(c => {
      const total = (c.data || []).reduce((s, x) => s + (x.count || 0), 0);
      const isCurrent = c.id === 'current';

      let matchesHtml = '';
      if (c.matchingCards && c.matchingCards.length > 0) {
        matchesHtml = `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:12px;">
          <div style="color:var(--holo-a);font-weight:600;margin-bottom:4px;">Cartas encontradas (${c.matchingCards.length}):</div>
          ${c.matchingCards.slice(0, 5).map(m => `<div style="color:var(--text);">${escapeHtml(m.name)} (x${m.count || 1})</div>`).join('')}
        </div>`;
      }

      return `
        <div class="saved-card" data-id="${c.id}">
          <div class="saved-card-header">
            <div class="saved-card-name">${escapeHtml(c.name)} ${isCurrent ? '<span style="font-size:11px;color:var(--grass);font-weight:700;">(Actual)</span>' : ''}</div>
          </div>
          <div class="saved-card-stats"><span class="sc-stat">${total} cartas</span></div>
          ${matchesHtml}
          <div class="saved-card-actions" style="margin-top:10px;">
            <button class="action saved-card-load">${isCurrent ? 'Actualizar' : 'Cargar'}</button>
            ${!isCurrent ? '<button class="ghost saved-card-delete">Eliminar</button>' : ''}
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('.saved-card-load').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.saved-card').dataset.id;
        if (id === 'current') return;
        const loaded = await Storage.loadCollectionAsNamed(id);
        if (loaded) {
          await Storage.saveCollection(loaded);
          Collection.setCurrentName(id);
          Collection.init();
          UI.toast('Colección cargada', 'success');
        }
      });
    });

    container.querySelectorAll('.saved-card-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.saved-card').dataset.id;
        if (confirm('¿Eliminar colección?')) {
          await Storage.deleteNamedCollection(id);
          const searchVal = document.getElementById('savedCollectionSearch')?.value?.trim().toLowerCase() || '';
          renderCollections(searchVal);
          UI.toast('Eliminada', 'success');
        }
      });
    });
  }

  async function renderDecks() {
    const container = document.getElementById('savedDecksFull');
    const empty = document.getElementById('savedDecksEmpty');
    if (!container) return;
    const saved = await Storage.loadNamedDecks();

    if (saved.length === 0) {
      container.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    container.innerHTML = saved.map(d => `
      <div class="saved-card" data-id="${d.id}">
        <div class="saved-card-header"><div class="saved-card-name">${escapeHtml(d.name)}</div></div>
        <div class="saved-card-actions">
          <button class="action saved-card-load">Cargar mazo</button>
          <button class="ghost saved-card-delete">Eliminar</button>
        </div>
      </div>`).join('');

    container.querySelectorAll('.saved-card-load').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.saved-card').dataset.id;
        const loaded = await Storage.loadNamedDeck(id);
        if (loaded && loaded.data) {
          document.querySelector('[data-tab="build"]')?.click();
          Wizard.loadSavedDeck(loaded.data, loaded.name);
        }
      });
    });

    container.querySelectorAll('.saved-card-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('.saved-card').dataset.id;
        if (confirm('¿Eliminar mazo?')) {
          await Storage.deleteNamedDeck(id);
          renderDecks();
          UI.toast('Eliminado', 'success');
        }
      });
    });
  }

  return {
    async render() {
      if (!isInitialized) {
        setupSearch();
        isInitialized = true;
      }
      const searchVal = document.getElementById('savedCollectionSearch')?.value?.trim().toLowerCase() || '';
      await renderCollections(searchVal);
      await renderDecks();
    }
  };
})();

/* ==========================================
   APP BOOTSTRAPPER MODULE
   ========================================== */
const App = (() => {
  async function initTabs() {
    document.querySelectorAll('nav.tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + btn.dataset.tab)?.classList.add('active');

        if (btn.dataset.tab === 'collection') Collection.render();
        if (btn.dataset.tab === 'saved') Saved.render();
      });
    });
  }

  function initModal() {
    document.getElementById('modalClose')?.addEventListener('click', () => UI.hideModal());
    document.getElementById('cardModal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('cardModal')) UI.hideModal();
    });
  }

  return {
    async init() {
      try {
        await Storage.init();
        await API.loadLocalDb();
        await Collection.init();
        Scanner.init();
        Wizard.init();
        initTabs();
        initModal();
        Scanner.updateDbStatus();
        console.log('Trainer\'s Ledger v2.0 inicializado');
      } catch (err) {
        console.error('Init error:', err);
      }
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
