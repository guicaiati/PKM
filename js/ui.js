const UI = (() => {
  const TYPE_BORDER = {
    Fire: 't-fire', Water: 't-water', Grass: 't-grass', Lightning: 't-lightning',
    Psychic: 't-psychic', Fighting: 't-fighting', Darkness: 't-darkness',
    Metal: 't-metal', Colorless: 't-colorless', Dragon: 't-dragon'
  };

  const TYPE_ES = { Fire: 'Fuego', Water: 'Agua', Grass: 'Planta', Lightning: 'Rayo', Psychic: 'Psíquico', Fighting: 'Lucha', Darkness: 'Oscuridad', Metal: 'Metal', Colorless: 'Incoloro', Dragon: 'Dragón', Fairy: 'Hada' };

  const TCG_KEEP_EN = [
    'Supporter', 'Item', 'Stadium', 'Tool',
    'Prize card', 'Prize cards', 'Prize',
    'Active Pokémon', 'Benched Pokémon', 'Defending Pokémon', 'Active',
    'Bench', 'Knocked Out',
    'Fire', 'Water', 'Grass', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal', 'Colorless', 'Dragon', 'Fairy',
    'Energy', 'Energy card', 'Energy cards',
    'Pokémon', 'EX', '-ex', 'VMAX', 'VSTAR', 'GX',
    'ACE SPEC', 'Technical Machine',
    'Confused', 'Asleep', 'Paralyzed', 'Poisoned', 'Burned',
    'Weakness', 'Resistance', 'Retreat',
    'Basic', 'Stage 1', 'Stage 2',
    'HP',
  ];
  const _sortedTCG = TCG_KEEP_EN.sort((a, b) => b.length - a.length);

  const _transCache = {};
  async function translateText(text) {
    if (!text || !text.trim()) return text;
    if (_transCache[text]) return _transCache[text];
    let wip = text;
    const placeholders = [];
    for (let i = 0; i < _sortedTCG.length; i++) {
      const term = _sortedTCG[i];
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      if (re.test(wip)) {
        const ph = `§${i}§`;
        wip = wip.replace(re, ph);
        placeholders.push([ph, term]);
      }
    }
    try {
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(wip)}&langpair=en|es`);
      const data = await res.json();
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        let t = data.responseData.translatedText;
        for (const [ph, term] of placeholders) t = t.split(ph).join(term);
        _transCache[text] = t;
        return t;
      }
    } catch (e) { console.warn('Translation failed:', e); }
    for (const [ph, term] of placeholders) wip = wip.split(ph).join(term);
    return wip;
  }

  async function translateRules(rules) {
    if (!rules || rules.length === 0) return [];
    const results = await Promise.all(rules.map(r => translateText(r)));
    return results;
  }

  const RARITY_ES = { 'Common': 'Común', 'Uncommon': 'Poco Común', 'Rare': 'Raro', 'Double Rare': 'Doble Raro', 'Ultra Rare': 'Ultra Raro', 'Illustration Rare': 'Ilustración Rara', 'Special Illustration Rare': 'Ilustración Especial Rara', 'Hyper Rare': 'Hiper Raro', 'Rare Holo': 'Raro Holográfico', 'Rare Holo EX': 'Raro Holo EX', 'Rare Holo GX': 'Raro Holo GX', 'Rare V': 'Raro V', 'Rare VMAX': 'Raro VMAX', 'Rare VSTAR': 'Raro VSTAR', 'Amazing Rare': 'Raro Increíble', 'Promo': 'Promo' };

  const SUBTYPE_ES = { 'Supporter': 'Soporte', 'Item': 'Objeto', 'Tool': 'Herramienta', 'Stadium': 'Estadio' };

  let _reverseNameMap = null;
  function getReverseNameMap() { return _reverseNameMap; }
  function setReverseNameMap(m) { _reverseNameMap = m; }

  function cardNameDisplay(enName) {
    if (!enName) return '';
    const rev = _reverseNameMap;
    if (!rev) return enName;
    const esName = rev[enName.toLowerCase()];
    if (esName && esName.toLowerCase() !== enName.toLowerCase()) return enName + ' <span style="opacity:0.5;font-size:0.85em;">(' + esName + ')</span>';
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

  function typeClass(types) {
    const t = types && types[0];
    return TYPE_BORDER[t] || '';
  }

  function starsHTML(score) {
    const full = Math.round(score / 20);
    const empty = 5 - full;
    return '<span class="stars">' +
      '<span class="star filled">'.repeat(full) + '</span>' +
      '<span class="star empty">'.repeat(empty) + '</span>' +
      '</span>';
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
      div.className = 'pkcard ' + typeClass(card.types);
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
          qtyHTML = `<div style="display:flex;gap:4px;">
            <span style="flex:1;text-align:center;padding:6px;background:var(--grass);color:var(--bg);border-radius:6px;font-size:12px;font-weight:600;">✔ Tengo ${owned}</span>
            <button class="ghost add-btn" style="flex:1;font-size:12px;">+ Agregar</button>
          </div>`;
        } else {
          qtyHTML = `<button class="ghost add-btn" style="width:100%;">+ Agregar</button>`;
        }
      }
      const typeColor = { Fire: 'fire', Water: 'water', Grass: 'grass', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Colorless: 'colorless', Dragon: 'dragon', Fairy: 'dragon' };
      const tcVar = typeColor[card.types && card.types[0]] || 'colorless';
      const initial = (card.name || '?')[0].toUpperCase();
      const placeholder = `<div class="card-placeholder" style="background:var(--${tcVar});color:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;width:100%;aspect-ratio:48.5/68;border-radius:8px;">${initial}</div>`;
      div.innerHTML = `
        ${card.image ? `<img src="" alt="${card.name}" loading="lazy"/>` : placeholder}
        <div class="meta">
          <div class="name-row"><span class="name">${cardNameDisplay(card.name)}</span><button class="ghost card-info-btn" title="Qué hace esta carta"><span class="tcg-sym" style="font-size:14px;">?</span></button></div>
          <div class="set">${card.set || ''}</div>
          ${card.number ? `<div class="card-info">#${card.number}</div>` : ''}
          ${qtyHTML}
        </div>`;
      if (card.image) {
        const imgEl = div.querySelector('img');
        loadCachedImage(imgEl, card.id || card.name, card.image);
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

    renderDeckCard(row, card, opts = {}) {
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
      rowEl.innerHTML = `
        ${card.image ? `<img src="" alt="${card.name}" loading="lazy"/>` : placeholder}
        <div class="dc-info">
          <div class="dc-name">${cardNameDisplay(card.name)}${collectionLabel}</div>
          <div class="dc-set">${card.set || ''}</div>
        </div>
        <div class="dc-qty">x${needed}</div>
        <div class="dc-owned ${missing > 0 ? 'missing' : 'ok'}">
          ${missing > 0 ? `Faltan ${missing}` : `✔ ${owned}/${needed}`}
        </div>
        ${explainBtn}`;
      if (card.image) {
        const imgEl = rowEl.querySelector('img');
        loadCachedImage(imgEl, card.id || card.name, card.image);
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

    renderVariants(container, variants, activeType, onSelect) {
      container.innerHTML = variants.map((v, i) => `
        <div class="variant-card ${(v.type || '') === activeType ? 'active' : ''}" data-idx="${i}" data-type="${v.type || ''}">
          <div class="v-name">${v.name}</div>
          <div class="v-pct">${v.match}%</div>
          <div class="v-meta">${v.cost || ''} ${v.difficulty || ''}</div>
          ${v.desc ? `<div class="v-desc">${v.desc}</div>` : ''}
        </div>`).join('');
      container.querySelectorAll('.variant-card').forEach(el => {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          container.querySelectorAll('.variant-card').forEach(c => c.classList.remove('active'));
          el.classList.add('active');
          const type = el.getAttribute('data-type');
          if (onSelect && type) onSelect(type);
        });
      });
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
      document.getElementById('scoreTotal').textContent = total + ' / 100';
    },

    renderMetaRanking(container, archetypes) {
      container.innerHTML = archetypes.map((a, i) => `
        <div class="meta-row">
          <span class="mr-rank">${i + 1}.</span>
          <span class="mr-name">${a.name}</span>
          <div class="mr-bar"><div class="mr-bar-fill" style="width:${a.usage}%"></div></div>
          <span class="mr-pct">${a.usage}%</span>
        </div>`).join('');
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
      const weaknesses = card.weaknesses || [];
      const resistances = card.resistances || [];
      const retreatN = card.convertedRetreatCost || (card.retreatCost || []).length;
      const hp = card.hp || 0;
      const type = (card.types && card.types[0]) || 'Colorless';
      const subs = card.subtypes || [];
      const evoFrom = card.evolvesFrom || '';
      const hasRealData = attacks.length > 0 || abilities.length > 0 || cardText.length > 0;

      if (sup === 'Energy') {
        if (hasRealData) return await this._energyDetailHTML(card, cardText);
        const lower = (card.name || '').toLowerCase();
        const isBasic = subs.includes('Basic');
        const isSpecial = subs.includes('Special');
        const isAceSpec = subs.some(s => /ACE SPEC/i.test(s));
        const type = (card.types && card.types[0]) || 'Colorless';
        const typeLabel = TYPE_ES[type] || type;
        const typeIcons = { Fire: 'r', Water: 'w', Grass: 'g', Lightning: 'l', Psychic: 'p', Fighting: 'f', Darkness: 'd', Metal: 'm', Colorless: 'c', Dragon: 'n', Fairy: 'y' };
        const typeVar = { Fire: 'fire', Water: 'water', Grass: 'grass', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Colorless: 'colorless', Dragon: 'dragon', Fairy: 'dragon' };
        const typeChar = typeIcons[type] || 'c';
        let badgeLabel = isBasic ? 'Básica' : 'Especial';
        let extra = '';
        if (isAceSpec) extra += ' <span class="cd-subtype ace-spec" style="font-size:10px;">ACE SPEC</span>';
        return '<div class="card-detail"><div class="cd-header"><span class="cd-type-badge" style="background:var(--' + (typeVar[type] || 'colorless') + ')"><span class="tcg-sym" style="margin-right:4px;font-size:12px;">' + typeChar + '</span>' + typeLabel + '</span><span class="cd-subtype" style="font-size:10px;">' + badgeLabel + '</span>' + extra + '</div><div class="cd-section"><div class="cd-section-title">Efecto</div><div class="cd-trainer-text">Energía ' + badgeLabel.toLowerCase() + ' de tipo ' + typeLabel + '.</div></div></div>';
      }

      if (sup === 'Trainer') {
        if (hasRealData) return await this._trainerDetailHTML(card, cardText);
        const lower = (card.name || '').toLowerCase();
        const isSupporter = subs.includes('Supporter');
        const isItem = subs.includes('Item');
        const isTool = subs.includes('Tool');
        const isStadium = subs.includes('Stadium');
        const isAceSpec = subs.some(s => /ACE SPEC/i.test(s));
        const isTM = subs.some(s => /Technical Machine/i.test(s));
        let tag = isSupporter ? 'Soporte' : isTool ? 'Herramienta' : isStadium ? 'Estadio' : 'Objeto';
        let extra = '';
        if (isAceSpec) extra += ' <span class="cd-subtype ace-spec" style="font-size:10px;">ACE SPEC</span>';
        if (isTM) extra += ' <span class="cd-subtype tm" style="font-size:10px;">TM</span>';
        return '<div class="card-detail"><div class="cd-header"><span class="cd-type-badge" style="background:var(--holo-c)">' + tag + '</span>' + extra + '</div><div class="cd-section"><div class="cd-section-title">Efecto</div><div class="cd-trainer-text">Carta de Trainer — ' + tag + '.</div></div></div>';
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
      const sup = card.supertype || '';
      const attacks = card.attacks || [];
      const abilities = card.abilities || [];
      const cardText = card.text && card.text.length > 0 ? card.text : (card.rules || []);
      const hasRealData = attacks.length > 0 || abilities.length > 0 || cardText.length > 0;
      if (hasRealData) return await this.getCardExplanation(card);
      if (!card.id && !card.name) return await this.getCardExplanation(card);
      try {
        const query = card.name;
        const results = await API.searchCards(query, 1);
        if (results.length > 0) {
          const full = results[0];
          card.attacks = full.attacks || [];
          card.abilities = full.abilities || [];
          card.text = full.text && full.text.length > 0 ? full.text : (full.rules || []);
          card.weaknesses = full.weaknesses || [];
          card.resistances = full.resistances || [];
          card.retreatCost = full.retreatCost || [];
          card.convertedRetreatCost = full.convertedRetreatCost || 0;
          if (full.hp) card.hp = parseInt(full.hp, 10);
          if (full.types) card.types = full.types;
          if (full.subtypes) card.subtypes = full.subtypes;
          if (full.evolvesFrom) card.evolvesFrom = full.evolvesFrom;
          if (full.rarity) card.rarity = full.rarity;
          if (!card.number && full.number) card.number = full.number;
          if (full.images?.small && !card.image) card.image = full.images.small;
        }
      } catch (e) { console.warn('getCardExplanationAsync fetch failed:', e); }
      return await this.getCardExplanation(card);
    },

    async _pokemonDetailHTML(card) {
      const subs = card.subtypes || [];
      const isEx = subs.some(s => /ex/i.test(s));
      const isVmax = subs.some(s => /vmax/i.test(s));
      const isVstar = subs.some(s => /vstar/i.test(s));
      const isV = subs.some(s => /^v$/i.test(s));
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
      html += '<div class="cd-header"><span class="cd-type-badge" style="background:var(--' + (typeVar[type] || type.toLowerCase()) + ')"><span class="tcg-sym" style="margin-right:4px;font-size:12px;">' + typeChar + '</span>' + typeLabel + '</span>';
      if (isEx) html += '<span class="cd-subtype ex"><span class="tcg-sym" style="font-size:13px;">-ex</span></span>';
      else if (isVmax) html += '<span class="cd-subtype vmax"><span class="tcg-sym" style="font-size:13px;">VMAX</span></span>';
      else if (isVstar) html += '<span class="cd-subtype vstar"><span class="tcg-sym" style="font-size:13px;">VSTAR</span></span>';
      else if (isV) html += '<span class="cd-subtype v"><span class="tcg-sym" style="font-size:13px;">V</span></span>';
      html += '</div>';

      if (hp) html += '<div class="cd-stat"><span class="cd-label">HP</span><span class="cd-value">' + hp + '</span></div>';
      if (rarity) {
        const rarityMap = { 'Common': '(C)', 'Uncommon': '(U)', 'Rare': '(R)', 'Double Rare': '(RR)', 'Ultra Rare': '(SR)', 'Illustration Rare': '(AR)', 'Special Illustration Rare': '(SAR)', 'Hyper Rare': '(UR)', 'Rare Holo': '(R)', 'Rare Holo EX': '(RR)', 'Rare Holo GX': '(RR)', 'Rare V': '(RR)', 'Rare VMAX': '(RR)', 'Rare VSTAR': '(RR)', 'Amazing Rare': '(R)', 'Promo': '(C)' };
        const rChar = rarityMap[rarity] || '(R)';
        const rarityLabel = RARITY_ES[rarity] || rarity;
        html += '<div class="cd-stat"><span class="cd-label">Rareza</span><span class="cd-value"><span class="tcg-sym rarity">' + rChar + '</span> ' + rarityLabel + '</span></div>';
      }
      if (evoFrom) html += '<div class="cd-stat"><span class="cd-label">Evoluciona de</span><span class="cd-value">' + evoFrom + '</span></div>';
      if (retreatN > 0) html += '<div class="cd-stat"><span class="cd-label">Coste de retirada</span><span class="cd-value">' + '<span class="cost-colorless"><span class="tcg-sym">c</span></span>'.repeat(retreatN) + '</span></div>';

      if (abilities.length > 0) {
        html += '<div class="cd-section"><div class="cd-section-title">Habilidades</div>';
        for (const a of abilities) {
          html += '<div class="cd-ability"><span class="cd-ability-name">' + (a.name || '') + '</span>';
          if (a.text) {
            const tr = (await translateRules([a.text]))[0];
            html += '<span class="cd-ability-text">' + tr + '</span>';
            if (tr !== a.text) html += '<span class="cd-ability-text" style="opacity:0.45;font-size:0.82em;font-style:italic;">' + a.text + '</span>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

        if (attacks.length > 0) {
        html += '<div class="cd-section"><div class="cd-section-title">Ataques</div>';
        for (const a of attacks) {
          const costArr = a.cost || [];
          let costStr;
          if (costArr.length === 0) {
            costStr = '<span class="cost-free" title="Gratis">⬤</span>';
          } else {
            costStr = costArr.map(c => {
              if (c === 'Colorless') return '<span class="cost-colorless" title="Incoloro"><span class="tcg-sym">c</span></span>';
              const ch = typeIcons[c] || '';
              const cv = typeVar[c] || 'colorless';
              return ch ? `<span class="cost-typed cost-${cv}" title="${TYPE_ES[c]||c}"><span class="tcg-sym">${ch}</span></span>` : c;
            }).join(' ');
          }
          html += '<div class="cd-attack"><div class="cd-attack-header"><span class="cd-attack-name">' + (a.name || '') + '</span><span class="cd-attack-cost">' + costStr + '</span></div>';
          if (a.damage) html += '<div class="cd-attack-damage">' + a.damage + '</div>';
          if (a.text) {
            const tr = (await translateRules([a.text]))[0];
            html += '<div class="cd-attack-text">' + tr + '</div>';
            if (tr !== a.text) html += '<div class="cd-attack-text" style="opacity:0.45;font-size:0.82em;font-style:italic;">' + a.text + '</div>';
          }
          html += '</div>';
        }
        html += '</div>';
      }

      if (weaknesses.length > 0) {
        html += '<div class="cd-section"><div class="cd-section-title">Debilidades</div>';
        weaknesses.forEach(w => {
          const wChar = typeIcons[w.type] || '';
          const wLabel = TYPE_ES[w.type] || w.type;
          const tc = typeVar[w.type] || 'colorless';
          html += '<div class="cd-weakness" style="background:var(--' + tc + ');color:var(--bg)">' + (wChar ? '<span class="tcg-sym" style="font-size:12px;">' + wChar + '</span> ' : '') + wLabel + ' ' + (w.value || '×2') + '</div>';
        });
        html += '</div>';
      }
      if (resistances.length > 0) {
        html += '<div class="cd-section"><div class="cd-section-title">Resistencias</div>';
        resistances.forEach(r => {
          const rChar = typeIcons[r.type] || '';
          const rLabel = TYPE_ES[r.type] || r.type;
          const tc = typeVar[r.type] || 'colorless';
          html += '<div class="cd-resistance" style="background:var(--' + tc + ');color:var(--bg)">' + (rChar ? '<span class="tcg-sym" style="font-size:12px;">' + rChar + '</span> ' : '') + rLabel + ' ' + (r.value || '-30') + '</div>';
        });
        html += '</div>';
      } else {
        html += '<div class="cd-section"><div class="cd-section-title">Resistencias</div><div style="font-size:12px;color:var(--text-dim);">Ninguna</div></div>';
      }

      if (isEx || isVmax || isVstar || isV) {
        html += '<div class="cd-note">⚠️ Da 2 cartas de premio al ser debilitado.</div>';
      }

      html += '</div>';
      return html;
    },

    async _trainerDetailHTML(card, cardText) {
      const subs = card.subtypes || [];
      const isSupporter = subs.includes('Supporter');
      const isItem = subs.includes('Item');
      const isTool = subs.includes('Tool');
      const isStadium = subs.includes('Stadium');
      const isAceSpec = subs.some(s => /ACE SPEC/i.test(s));
      const isTechnicalMachine = subs.some(s => /Technical Machine/i.test(s));
      const rarity = card.rarity || '';

      const subColors = {
        Supporter: 'var(--holo-a)',
        Item: 'var(--holo-c)',
        Tool: 'var(--holo-b)',
        Stadium: 'var(--grass)'
      };
      const subLabels = {
        Supporter: 'Soporte',
        Item: 'Objeto',
        Tool: 'Herramienta',
        Stadium: 'Estadio'
      };
      const subIcons = { Supporter: 's', Item: 't', Tool: 't', Stadium: 'g' };

      let badgeLabel = 'Trainer';
      let badgeColor = 'var(--text-dim)';
      let badgeIcon = 't';
      if (isSupporter) { badgeLabel = subLabels.Supporter; badgeColor = subColors.Supporter; badgeIcon = subIcons.Supporter; }
      else if (isStadium) { badgeLabel = subLabels.Stadium; badgeColor = subColors.Stadium; badgeIcon = subIcons.Stadium; }
      else if (isTool) { badgeLabel = subLabels.Tool; badgeColor = subColors.Tool; badgeIcon = subIcons.Tool; }
      else if (isItem) { badgeLabel = subLabels.Item; badgeColor = subColors.Item; badgeIcon = subIcons.Item; }

      let html = '<div class="card-detail">';
      html += '<div class="cd-header">';
      html += '<span class="cd-type-badge" style="background:' + badgeColor + '">';
      html += '<span class="tcg-sym" style="margin-right:4px;font-size:12px;">' + badgeIcon + '</span>' + badgeLabel + '</span>';
      if (isAceSpec) html += '<span class="cd-subtype ace-spec">ACE SPEC</span>';
      if (isTechnicalMachine) html += '<span class="cd-subtype tm">TM</span>';
      html += '</div>';

      if (cardText.length > 0) {
        const translated = await translateRules(cardText);
        const hasTranslation = translated.some((t, i) => t !== cardText[i]);
        if (hasTranslation) {
          html += '<div class="cd-section"><div class="cd-section-title">Efecto</div>';
          translated.forEach((t, i) => {
            html += '<div class="cd-trainer-text">' + t + '</div>';
            if (cardText[i] && cardText[i] !== t) html += '<div class="cd-trainer-text" style="opacity:0.45;font-size:0.82em;font-style:italic;">' + cardText[i] + '</div>';
          });
          html += '</div>';
        } else {
          html += '<div class="cd-section"><div class="cd-section-title">Efecto</div>';
          cardText.forEach(t => { html += '<div class="cd-trainer-text">' + t + '</div>'; });
          html += '</div>';
        }
      } else {
        html += '<div class="cd-section"><div class="cd-section-title">Efecto</div>';
        html += '<div class="cd-trainer-text">Carta de Trainer — ' + badgeLabel + '.</div>';
        html += '</div>';
      }

      if (rarity) {
        const rarityMap = { 'Common': '(C)', 'Uncommon': '(U)', 'Rare': '(R)', 'Double Rare': '(RR)', 'Ultra Rare': '(SR)', 'Illustration Rare': '(AR)', 'Special Illustration Rare': '(SAR)', 'Hyper Rare': '(UR)', 'Rare Holo': '(R)', 'Rare Holo EX': '(RR)', 'Rare Holo GX': '(RR)', 'Rare V': '(RR)', 'Rare VMAX': '(RR)', 'Rare VSTAR': '(RR)', 'Amazing Rare': '(R)', 'Promo': '(C)' };
        const rChar = rarityMap[rarity] || '(C)';
        const rarityLabel = RARITY_ES[rarity] || rarity;
        html += '<div class="cd-stat"><span class="cd-label">Rareza</span><span class="cd-value"><span class="tcg-sym rarity">' + rChar + '</span> ' + rarityLabel + '</span></div>';
      }

      html += '</div>';
      return html;
    },

    async _energyDetailHTML(card, cardText) {
      const subs = card.subtypes || [];
      const isBasic = subs.includes('Basic');
      const isSpecial = subs.includes('Special');
      const isAceSpec = subs.some(s => /ACE SPEC/i.test(s));
      const type = (card.types && card.types[0]) || 'Colorless';
      const rarity = card.rarity || '';

      const typeIcons = { Fire: 'r', Water: 'w', Grass: 'g', Lightning: 'l', Psychic: 'p', Fighting: 'f', Darkness: 'd', Metal: 'm', Colorless: 'c', Dragon: 'n', Fairy: 'y' };
      const typeVar = { Fire: 'fire', Water: 'water', Grass: 'grass', Lightning: 'electric', Psychic: 'psychic', Fighting: 'fighting', Darkness: 'darkness', Metal: 'metal', Colorless: 'colorless', Dragon: 'dragon', Fairy: 'dragon' };
      const typeChar = typeIcons[type] || 'c';
      const typeLabel = TYPE_ES[type] || type;

      let html = '<div class="card-detail">';

      html += '<div class="cd-header">';
      html += '<span class="cd-type-badge" style="background:var(--' + (typeVar[type] || 'colorless') + ')">';
      html += '<span class="tcg-sym" style="margin-right:4px;font-size:12px;">' + typeChar + '</span>' + typeLabel + '</span>';
      if (isBasic) html += '<span class="cd-subtype"><span class="tcg-sym" style="font-size:11px;">e</span> Básica</span>';
      else if (isSpecial) html += '<span class="cd-subtype" style="background:var(--holo-b);">Especial</span>';
      if (isAceSpec) html += '<span class="cd-subtype ace-spec">ACE SPEC</span>';
      html += '</div>';

      if (cardText.length > 0) {
        const translated = await translateRules(cardText);
        const hasTranslation = translated.some((t, i) => t !== cardText[i]);
        if (hasTranslation) {
          html += '<div class="cd-section"><div class="cd-section-title">Efecto</div>';
          translated.forEach((t, i) => {
            html += '<div class="cd-trainer-text">' + t + '</div>';
            if (cardText[i] && cardText[i] !== t) html += '<div class="cd-trainer-text" style="opacity:0.45;font-size:0.82em;font-style:italic;">' + cardText[i] + '</div>';
          });
          html += '</div>';
        } else {
          html += '<div class="cd-section"><div class="cd-section-title">Efecto</div>';
          cardText.forEach(t => { html += '<div class="cd-trainer-text">' + t + '</div>'; });
          html += '</div>';
        }
      } else if (isBasic) {
        html += '<div class="cd-section"><div class="cd-section-title">Uso</div>';
        html += '<div class="cd-trainer-text">Se adjunta a un Pokémon para proveer energía de tipo ' + typeLabel + '.</div>';
        html += '</div>';
      }

      if (rarity) {
        const rarityMap = { 'Common': '(C)', 'Uncommon': '(U)', 'Rare': '(R)', 'Double Rare': '(RR)', 'Ultra Rare': '(SR)', 'Illustration Rare': '(AR)', 'Special Illustration Rare': '(SAR)', 'Hyper Rare': '(UR)', 'Rare Holo': '(R)', 'Rare Holo EX': '(RR)', 'Rare Holo GX': '(RR)', 'Rare V': '(RR)', 'Rare VMAX': '(RR)', 'Rare VSTAR': '(RR)', 'Amazing Rare': '(R)', 'Promo': '(C)' };
        const rChar = rarityMap[rarity] || '(C)';
        const rarityLabel = RARITY_ES[rarity] || rarity;
        html += '<div class="cd-stat"><span class="cd-label">Rareza</span><span class="cd-value"><span class="tcg-sym rarity">' + rChar + '</span> ' + rarityLabel + '</span></div>';
      }

      html += '</div>';
      return html;
    },

    showLoading(title) {
      const modal = document.getElementById('cardModal');
      const body = document.getElementById('modalBody');
      body.innerHTML = `<h3>${title}</h3><div class="card-detail"><div class="cd-section" style="text-align:center;padding:20px;color:var(--text-dim);">Cargando info de la carta...</div></div>`;
      modal.style.display = 'flex';
    },

    showModal(title, content) {
      const modal = document.getElementById('cardModal');
      const body = document.getElementById('modalBody');
      const isHTML = content.startsWith('<');
      body.innerHTML = `<h3>${title}</h3>${isHTML ? content : `<p>${content}</p>`}`;
      modal.style.display = 'flex';
    },

    showEditableModal(title, card, onSave) {
      const modal = document.getElementById('cardModal');
      const body = document.getElementById('modalBody');
      const sup = (card.supertype || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const TYPES = ['Fire','Water','Grass','Lightning','Psychic','Fighting','Darkness','Metal','Colorless','Dragon','Fairy'];
      const typeChar = { Fire:'r', Water:'w', Grass:'g', Lightning:'l', Psychic:'p', Fighting:'f', Darkness:'d', Metal:'m', Colorless:'c', Dragon:'n', Fairy:'y' };
      const typeVar = { Fire:'fire', Water:'water', Grass:'grass', Lightning:'electric', Psychic:'psychic', Fighting:'fighting', Darkness:'darkness', Metal:'metal', Colorless:'colorless', Dragon:'dragon', Fairy:'dragon' };
      const typeOptsHTML = (selected) => `<option value="">Ninguna</option>` + TYPES.map(t => `<option value="${t}" ${selected===t?'selected':''} style="background:var(--${typeVar[t]});color:var(--bg)">${typeChar[t]} ${TYPE_ES[t]||t}</option>`).join('');
      const rarOpts = Object.keys(RARITY_ES).map(r => `<option value="${r}" ${card.rarity===r?'selected':''}>${RARITY_ES[r]}</option>`).join('');

      let html = `<h3>${title}</h3><div class="edit-modal">`;
      if (sup === 'pokemon') {
        html += `<div class="edit-row"><label>HP</label><input type="number" id="em-hp" value="${card.hp||0}" min="0" max="999"/></div>`;
        html += `<div class="edit-row"><label>Rareza</label><select id="em-rarity"><option value="">-</option>${rarOpts}</select></div>`;
        const w = card.weaknesses || [];
        html += `<div class="edit-row"><label>Debilidad</label><select id="em-wtype">${typeOptsHTML(w[0]?.type||'')}</select><input type="text" id="em-wval" value="${w[0]?.value||'×2'}" style="width:60px"/></div>`;
        const r = card.resistances || [];
        html += `<div class="edit-row"><label>Resistencia</label><select id="em-rtype">${typeOptsHTML(r[0]?.type||'')}</select><input type="text" id="em-rval" value="${r[0]?.value||''}" style="width:60px"/></div>`;
        html += `<div class="edit-row"><label>Retirada</label><input type="number" id="em-retreat" value="${card.convertedRetreatCost||0}" min="0" max="5"/></div>`;
        const abs = card.abilities || [];
        html += `<div class="edit-section"><div class="edit-section-title">Habilidades</div><div id="em-abs">`;
        abs.forEach(a => { html += `<div class="edit-block"><input class="em-ab-name" value="${(a.name||'').replace(/"/g,'&quot;')}" placeholder="Nombre"/><textarea class="em-ab-text" placeholder="Efecto">${a.text||''}</textarea></div>`; });
        html += `<button class="ghost" id="em-add-ab">+ Habilidad</button></div></div>`;
        const atks = card.attacks || [];
        html += `<div class="edit-section"><div class="edit-section-title">Ataques</div><div id="em-atks">`;
        atks.forEach(a => {
          html += `<div class="edit-block"><div class="edit-attack-row"><input class="em-at-name" value="${(a.name||'').replace(/"/g,'&quot;')}" placeholder="Nombre" style="flex:2"/><input class="em-at-cost" value="${(a.cost||[]).join(',')}" placeholder="Coste" style="flex:1"/><input class="em-at-dmg" value="${a.damage||''}" placeholder="Daño" style="flex:0.5"/></div><textarea class="em-at-text" placeholder="Efecto">${a.text||''}</textarea></div>`;
        });
        html += `<button class="ghost" id="em-add-at">+ Ataque</button></div></div>`;
      } else {
        const txt = (card.text || []).join('\n');
        html += `<div class="edit-section"><div class="edit-section-title">Efecto</div><textarea id="em-text" style="width:100%;min-height:80px">${txt}</textarea></div>`;
      }
      html += `<div class="edit-actions"><button class="btn primary" id="em-save">Guardar</button><button class="ghost" id="em-cancel">Cancelar</button></div></div>`;
      body.innerHTML = html;
      modal.style.display = 'flex';

      body.querySelector('#em-cancel').onclick = () => { modal.style.display = 'none'; };
      body.querySelector('#em-save').onclick = () => {
        const u = { ...card };
      if (sup === 'pokemon') {
          u.hp = parseInt(body.querySelector('#em-hp').value,10)||0;
          u.rarity = body.querySelector('#em-rarity').value;
          const wt = body.querySelector('#em-wtype').value, wv = body.querySelector('#em-wval').value.trim()||'×2';
          u.weaknesses = wt ? [{type:wt,value:wv}] : [];
          const rt = body.querySelector('#em-rtype').value, rv = body.querySelector('#em-rval').value.trim();
          u.resistances = rt&&rv ? [{type:rt,value:rv}] : [];
          u.convertedRetreatCost = parseInt(body.querySelector('#em-retreat').value,10)||0;
          u.retreatCost = Array(u.convertedRetreatCost).fill('Colorless');
          u.abilities = [];
          body.querySelectorAll('.em-ab-name').forEach((el,i) => {
            const t = body.querySelectorAll('.em-ab-text')[i];
            if(el.value.trim()) u.abilities.push({name:el.value.trim(),text:t?t.value:''});
          });
          u.attacks = [];
          body.querySelectorAll('.em-at-name').forEach((el,i) => {
            const c = body.querySelectorAll('.em-at-cost')[i];
            const d = body.querySelectorAll('.em-at-dmg')[i];
            const t = body.querySelectorAll('.em-at-text')[i];
            if(el.value.trim()) u.attacks.push({name:el.value.trim(),cost:c?c.value.split(',').map(s=>s.trim()).filter(Boolean):[],damage:d?d.value.trim():'',text:t?t.value:''});
          });
        } else {
          const t = body.querySelector('#em-text');
          u.text = t ? t.value.split('\n').filter(Boolean) : [];
        }
        modal.style.display = 'none';
        if(onSave) onSave(u);
      };
      body.querySelector('#em-add-ab')?.addEventListener('click', () => {
        const c = body.querySelector('#em-abs'), b = body.querySelector('#em-add-ab');
        const d = document.createElement('div'); d.className='edit-block';
        d.innerHTML=`<input class="em-ab-name" value="" placeholder="Nombre"/><textarea class="em-ab-text" placeholder="Efecto"></textarea>`;
        c.insertBefore(d,b);
      });
      body.querySelector('#em-add-at')?.addEventListener('click', () => {
        const c = body.querySelector('#em-atks'), b = body.querySelector('#em-add-at');
        const d = document.createElement('div'); d.className='edit-block';
        d.innerHTML=`<div class="edit-attack-row"><input class="em-at-name" value="" placeholder="Nombre" style="flex:2"/><input class="em-at-cost" value="" placeholder="Coste" style="flex:1"/><input class="em-at-dmg" value="" placeholder="Daño" style="flex:0.5"/></div><textarea class="em-at-text" placeholder="Efecto"></textarea>`;
        c.insertBefore(d,b);
      });
    },

    hideModal() {
      document.getElementById('cardModal').style.display = 'none';
    },

    toast(msg, type = 'info') {
      const container = document.getElementById('toastContainer');
      const el = document.createElement('div');
      el.className = 'toast ' + type;
      el.textContent = msg;
      container.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    },

    setStatus(el, msg, isError = false) {
      el.textContent = msg;
      el.classList.toggle('err', isError);
    },

    cardNamePlain,
    setReverseNameMap
  };
})();
