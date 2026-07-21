const Meta = (() => {
  let metaData = null;

  async function loadData() {
    try {
      metaData = await fetch('data/meta.json?v=' + Date.now()).then(r => r.ok ? r.json() : null);
    } catch {
      metaData = null;
    }
    return metaData;
  }

  async function fetchLimitless() {
    try {
      const cached = await Storage.loadMetaCache();
      if (cached) return cached;

      const res = await fetch('https://limitlesstcg.com/api/decks?format=standard&limit=100');
      if (!res.ok) throw new Error('No se pudo obtener datos de Limitless');
      const data = await res.json();
      await Storage.saveMetaCache(data);
      return data;
    } catch {
      return null;
    }
  }

  return {
    async init() {
      await loadData();
      this.render();
      this.renderCompatibility();
    },

    render() {
      const container = document.getElementById('metaRanking');
      const infoEl = document.getElementById('metaInfo');

      if (!metaData || !metaData.archetypes) {
        container.innerHTML = '<div class="empty">No hay datos de meta disponibles. Se cargaron datos base.</div>';
        if (infoEl) infoEl.innerHTML = '';
        return;
      }

      if (infoEl) {
        infoEl.innerHTML = `<p class="hint">Actualizado: ${metaData.lastUpdated || 'N/A'} — Formato: ${metaData.format || 'Standard'}</p>`;
      }

      UI.renderMetaRanking(container, metaData.archetypes);
    },

    renderCompatibility() {
      const container = document.getElementById('collectionCompatibility');
      if (!metaData || !metaData.archetypes) {
        container.innerHTML = '<div class="empty">Cargá cartas para ver tu compatibilidad con el meta.</div>';
        return;
      }

      const collection = Collection.getMap();
      const hasCards = Object.keys(collection).length > 0;
      if (!hasCards) {
        container.innerHTML = '<div class="empty">Cargá cartas para ver tu compatibilidad con el meta.</div>';
        return;
      }

      const items = metaData.archetypes.map(arch => {
        let have = 0;
        let need = 0;
        (arch.cards || []).forEach(c => {
          const owned = Collection.countByName(c.name);
          have += Math.min(owned, c.need);
          need += c.need;
        });
        const pct = need > 0 ? Math.round((have / need) * 100) : 0;
        return { name: arch.name, pct, compatible: pct >= 50 };
      }).sort((a, b) => b.pct - a.pct);

      UI.renderCompatibility(container, items);
    },

    getData() { return metaData; }
  };
})();
