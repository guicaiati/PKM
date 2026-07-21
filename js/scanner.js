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
    const history = getHistory();
    if (history.length === 0) { container.parentElement.style.display = 'none'; return; }
    container.parentElement.style.display = 'block';
    container.innerHTML = history.map(q => `<span class="history-chip">${q}</span>`).join('');
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
    input.addEventListener('input', () => {
      clearTimeout(autocompleteTimer);
      const val = input.value.trim();
      if (val.length < 2) { list.classList.remove('show'); return; }
      autocompleteTimer = setTimeout(async () => {
        try {
          const suggestions = await API.autocomplete(val);
          if (!suggestions.length) { list.classList.remove('show'); return; }
          list.innerHTML = suggestions.map(s => `<div class="autocomplete-item">${s}</div>`).join('');
          list.classList.add('show');
          list.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
              input.value = el.textContent;
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
    try {
      const sets = await API.getStandardSetsStatus();
      if (!sets.length) {
        el.innerHTML = `<span style="color:var(--holo-c);">⚠ No se pudieron cargar los sets</span>
          <button class="action" id="downloadDbBtn" style="font-size:12px;padding:6px 12px;margin-top:8px;width:100%;">Descargar todo</button>`;
        document.getElementById('downloadDbBtn')?.addEventListener('click', downloadAll);
        renderSetDownloadInput(el);
        return;
      }

      const downloaded = sets.filter(s => s.downloaded);
      const totalCards = downloaded.reduce((sum, s) => sum + s.cardCount, 0);

      let html = `<div style="margin-bottom:8px;">
        <span style="color:var(--grass);font-weight:600;">✔ ${totalCards} cartas</span>
        <span style="color:#888;font-size:11px;"> ${downloaded.length}/${sets.length} sets</span>
      </div>`;

      const groups = [
        { key: 'standard', label: 'Standard', color: 'var(--grass)' },
        { key: 'expanded', label: 'Expanded', color: 'var(--holo-a)' },
        { key: 'mcd', label: "McDonald's", color: 'var(--holo-b)' },
        { key: 'other', label: 'Otros', color: '#888' },
      ];

      for (const g of groups) {
        const groupSets = sets.filter(s => s.format === g.key);
        if (!groupSets.length) continue;
        const groupDl = groupSets.filter(s => s.downloaded);
        const groupMissing = groupSets.filter(s => !s.downloaded);

        html += `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:6px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="color:${g.color};font-weight:600;font-size:11px;">${g.label}</span>
            <span style="color:#888;font-size:10px;">${groupDl.length}/${groupSets.length}</span>
          </div>`;

        for (const s of groupSets) {
          if (s.downloaded) {
            html += `<div class="set-status-row">
              <span style="color:var(--grass);">✔</span>
              <span style="flex:1;">${s.name}</span>
              <span style="color:#888;">${s.cardCount}</span>
            </div>`;
          } else {
            html += `<div class="set-status-row">
              <span style="color:var(--fire);">✘</span>
              <span style="flex:1;">${s.name}</span>
              <button class="ghost download-set-btn" data-set-id="${s.id}" style="font-size:10px;padding:2px 6px;">↓</button>
            </div>`;
          }
        }

        if (groupMissing.length > 0) {
          html += `<button class="action download-group-btn" data-format="${g.key}" style="font-size:10px;padding:4px 8px;margin-top:4px;width:100%;">Descargar ${g.label} (${groupMissing.length})</button>`;
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
      el.innerHTML = `<span style="color:var(--holo-c);">⚠ Sin base local</span>
        <button class="action" id="downloadDbBtn" style="font-size:12px;padding:6px 12px;margin-top:8px;width:100%;">Descargar todo</button>`;
      document.getElementById('downloadDbBtn')?.addEventListener('click', downloadAll);
      renderSetDownloadInput(el);
    }
  }

  function renderSetDownloadInput(el) {
    const div = document.createElement('div');
    div.style.cssText = 'margin-top:10px;border-top:1px solid var(--line);padding-top:8px;';
    div.innerHTML = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Descargar set por ID:</div>
      <div style="display:flex;gap:4px;">
        <input type="text" id="setDownloadInput" placeholder="ej: xy6" style="flex:1;font-size:11px;padding:4px 6px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);border-radius:4px;font-family:var(--mono);" />
        <button class="ghost" id="setDownloadBtn" style="font-size:11px;padding:4px 8px;">↓</button>
      </div>
      <div id="setDownloadStatus" style="font-size:10px;color:var(--holo-a);margin-top:4px;"></div>`;
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
        status.textContent = '✔ ' + n + ' cartas descargadas';
        status.style.color = 'var(--grass)';
        UI.toast('Set ' + setId + ' descargado (' + n + ' cartas)', 'success');
        renderSetStatus(document.getElementById('dbStatus'));
      } catch (err) {
        status.textContent = '✘ Error: ' + err.message;
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
    sidebar.classList.add('downloading');

    try {
      const sets = await API.getStandardSetsStatus();
      const groupSets = sets.filter(s => s.format === format && !s.downloaded);
      if (!groupSets.length) {
        UI.toast('Ya tenés todos los sets de este grupo', 'success');
        sidebar.classList.remove('downloading');
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
          try { await API.downloadSingleSet(s.id); } catch {}
        }
      }

      UI.toast(`${totalNew} cartas descargadas`, 'success');
    } catch (err) {
      el.innerHTML = `<span style="color:var(--fire);">Error: ${err.message}</span>`;
    }
    sidebar.classList.remove('downloading');
    renderSetStatus(el);
  }

  async function downloadAll() {
    const el = document.getElementById('dbStatus');
    const sidebar = document.getElementById('dbSidebar');
    sidebar.classList.add('downloading');

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
    sidebar.classList.remove('downloading');
    renderSetStatus(el);
  }

  async function checkAndDownloadNew() {
    if (!API.isDbReady()) return;
    try {
      const newSets = await API.checkForNewSets();
      if (newSets.length > 0) {
        const el = document.getElementById('dbStatus');
        const currentHtml = el.innerHTML;
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

      document.getElementById('searchBtn').addEventListener('click', () => this.doSearch());
      document.getElementById('searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.doSearch(); });
      document.getElementById('clearSearchBtn').addEventListener('click', () => {
        document.getElementById('searchInput').value = '';
        document.getElementById('searchResults').innerHTML = '';
        document.getElementById('searchStatus').textContent = '';
      });
    },

    async doSearch() {
      const input = document.getElementById('searchInput');
      const statusEl = document.getElementById('searchStatus');
      const gridEl = document.getElementById('searchResults');
      const query = input.value.trim();
      if (!query) return;

      const isLocal = API.isDbReady();
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
        const note = elapsed > 0.5 ? ` (${elapsed}s — posiblemente nombre en otro idioma)` : '';
        UI.setStatus(statusEl, `${results.length} resultado(s).${note}`);
        document.querySelectorAll('#searchFilters .filter-chip').forEach(b => b.classList.remove('active'));
        document.querySelector('#searchFilters .filter-chip[data-filter="all"]').classList.add('active');
        renderResults(results);
      } catch (err) {
        UI.setStatus(statusEl, 'Error: ' + err.message, true);
      }
    },

    updateDbStatus,
    checkAndDownloadNew
  };
})();
