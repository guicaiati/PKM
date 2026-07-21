const ArchetypesUI = (() => {
  let userArchetypes = [];

  function renderArchetypeCard(arch) {
    let haveTotal = 0, needTotal = 0;
    const chips = (arch.cards || []).map(c => {
      const have = Collection.countByName(c.name);
      haveTotal += Math.min(have, c.need);
      needTotal += c.need;
      const missing = c.need - have;
      return `<span class="need-chip ${missing > 0 ? 'missing' : 'owned'}">${c.name} — tenés ${have}/${c.need}${missing > 0 ? ' (faltan ' + missing + ')' : ''}</span>`;
    }).join('');
    const pct = needTotal > 0 ? Math.round((haveTotal / needTotal) * 100) : 0;

    return `
      <div class="arch-card">
        <div class="arch-top">
          <div class="arch-name">${arch.name}</div>
          <div class="arch-score">${pct}% completo</div>
        </div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="need-list">${chips}</div>
      </div>`;
  }

  return {
    async render() {
      // Load both built-in and user archetypes
      let builtIn = [];
      try {
        builtIn = await fetch('data/archetypes.json').then(r => r.ok ? r.json() : []);
      } catch {}
      userArchetypes = await Storage.loadArchetypes();

      const container = document.getElementById('archetypeList');
      const all = [...builtIn, ...userArchetypes];
      if (all.length === 0) {
        container.innerHTML = '<div class="empty">No hay arquetipos cargados.</div>';
        return;
      }
      container.innerHTML = all.map(renderArchetypeCard).join('');
    },

    async addArcheType() {
      const name = document.getElementById('archName').value.trim();
      const raw = document.getElementById('archList').value.trim();
      if (!name || !raw) return;

      const cards = raw.split('\n').map(line => {
        const m = line.match(/^(.*?)\s*x(\d+)\s*$/i);
        if (m) return { name: m[1].trim(), need: parseInt(m[2], 10) };
        return { name: line.trim(), need: 1 };
      }).filter(c => c.name);

      const arch = { name, cards, id: 'user_' + Date.now() };
      userArchetypes.push(arch);
      await Storage.saveArchetypes(userArchetypes);

      document.getElementById('archName').value = '';
      document.getElementById('archList').value = '';
      UI.toast('Arquetipo "' + name + '" agregado', 'success');
      this.render();
    },

    async resetDefaults() {
      userArchetypes = [];
      await Storage.saveArchetypes([]);
      UI.toast('Arquetipos de usuario eliminados', 'info');
      this.render();
    }
  };
})();

const App = (() => {
  async function initTabs() {
    document.querySelectorAll('nav.tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('nav.tabs button').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + btn.dataset.tab).classList.add('active');

        if (btn.dataset.tab === 'collection') Collection.render();
        if (btn.dataset.tab === 'build') DeckBuilder.refreshChips();
        if (btn.dataset.tab === 'meta') Meta.init();
        if (btn.dataset.tab === 'archetypes') ArchetypesUI.render();
        if (btn.dataset.tab === 'saved') Saved.render();
      });
    });
  }

  function initModal() {
    document.getElementById('modalClose').addEventListener('click', () => UI.hideModal());
    document.getElementById('cardModal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('cardModal')) UI.hideModal();
    });
  }

  function initArchetypeButtons() {
    document.getElementById('addArchBtn').addEventListener('click', () => ArchetypesUI.addArcheType());
    document.getElementById('resetArchBtn').addEventListener('click', () => ArchetypesUI.resetDefaults());
  }

  return {
    async init() {
      try {
        await Storage.init();
        await API.loadLocalDb();
        await Collection.init();
        Scanner.init();
        DeckBuilder.init();
        Meta.init();
        initTabs();
        initModal();
        initArchetypeButtons();
        console.log('Trainer\'s Ledger v2.0 inicializado — DB local:', API.isDbReady() ? API.getDbSize() + ' cartas' : 'no descargada');
      } catch (err) {
        console.error('Init error:', err);
      }
    }
  };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
