self.onmessage = async function(e) {
  const { type, payload } = e.data;

  if (type === 'analyze') {
    const { collection, archetypes, meta, staples, userPokemon, variant, sourceMap } = payload;
    try {
      const safeArchetypes = Array.isArray(archetypes) ? archetypes : [];
      const safeStaples = Array.isArray(staples) ? staples : (staples?.cards || []);
      const safeUserPokemon = Array.isArray(userPokemon) ? userPokemon : [];
      const result = analyzeCollection(collection, safeArchetypes, meta, safeStaples, safeUserPokemon, variant || 'auto', sourceMap || {});
      self.postMessage({ type: 'result', payload: result });
    } catch (err) {
      self.postMessage({ type: 'error', payload: err.message || String(err) });
    }
  }
};

function sendProgress(pct, task) {
  self.postMessage({ type: 'progress', payload: { percent: pct, task } });
}

function analyzeCollection(collection, archetypes, meta, staples, userPokemon, variant, sourceMap) {
  sendProgress(0, 'Iniciando análisis...');

  const allCards = Object.values(collection);
  const pokemon = allCards.filter(c => c.supertype === 'Pokémon');
  const trainers = allCards.filter(c => c.supertype === 'Trainer');
  const energies = allCards.filter(c => c.supertype === 'Energy');

  sendProgress(15, 'Clasificando cartas...');
  const byType = {};
  pokemon.forEach(p => {
    const t = (p.types && p.types[0]) || 'Colorless';
    if (!byType[t]) byType[t] = [];
    byType[t].push(p);
  });

  sendProgress(30, 'Detectando Pokémon principales...');
  const scoredPokemon = pokemon.map(p => ({
    ...p,
    score: scorePokemon(p, collection)
  })).sort((a, b) => b.score - a.score);

  let targetPokemon = [];
  if (userPokemon && userPokemon.length > 0) {
    targetPokemon = userPokemon.map(name => {
      const found = scoredPokemon.find(p => p.name.toLowerCase().includes(name.toLowerCase()));
      return found || { name, score: 0, count: 0, types: [], subtypes: [], notOwned: true };
    }).sort((a, b) => b.score - a.score);
  } else {
    targetPokemon = scoredPokemon.slice(0, 6);
  }

  sendProgress(45, 'Buscando arquetipos compatibles...');
  const archetypeMatches = (archetypes || []).map(arch => {
    const match = matchArchetype(arch, collection);
    return { ...arch, matchPct: match.pct, matchDetails: match };
  }).sort((a, b) => b.matchPct - a.matchPct);

  sendProgress(60, 'Comparando contra el meta...');
  const metaMatches = (meta?.archetypes || []).map(m => {
    const pct = calculateMetaMatch(m, collection);
    return { ...m, collectionPct: pct };
  }).sort((a, b) => b.collectionPct - a.collectionPct);

  sendProgress(75, 'Armando mazo con tus cartas...');
  const bestArchetype = archetypeMatches[0] || null;
  let deck = [];
  let missing = [];
  let buyList = [];
  let removeList = [];
  let pokemonSuggestions = [];
  let trainerSuggestions = [];

  const buildResult = buildDeckFromCollection(targetPokemon, collection, staples, trainers, energies, bestArchetype, variant, sourceMap);
  deck = buildResult.deck;
  pokemonSuggestions = buildResult.suggestions.filter(s => s.type === 'pokemon');
  trainerSuggestions = buildResult.suggestions.filter(s => s.type === 'trainer');

  sendProgress(90, 'Optimizando consistencia...');
  deck = optimizeDeck(deck);

  missing = deck.filter(c => c.owned < c.need);
  buyList = missing.map(c => ({
    name: c.name,
    qty: c.need - c.owned,
    reason: c.explanation || 'Necesaria para completar el mazo'
  }));

  const missingEvoSuggestions = detectMissingPreEvolutions(deck, collection);
  missingEvoSuggestions.forEach(s => {
    const existing = buyList.find(b => b.name.toLowerCase() === s.name.toLowerCase());
    if (!existing) {
      buyList.push({ name: s.name, qty: s.qty, reason: s.reason, type: 'missing-evo' });
    }
    const existingSugg = pokemonSuggestions.find(ps => ps.name.toLowerCase() === s.name.toLowerCase());
    if (!existingSugg) {
      pokemonSuggestions.push({
        type: 'pokemon',
        priority: 'alta',
        name: s.name,
        message: s.reason,
        action: 'Comprar ' + s.name + ' para evolucionar a ' + s.evolvesTo
      });
    }
  });

  const deckCardNames = new Set(deck.map(c => c.name.toLowerCase()));
  removeList = allCards
    .filter(c => !deckCardNames.has(c.name.toLowerCase()) && c.count > 1)
    .map(c => ({ name: c.name, qty: c.count - 1, reason: 'No utilizada en este mazo' }))
    .slice(0, 10);

  sendProgress(100, 'Construyendo mazo...');

  const pokemonDeck = deck.filter(c => c.supertype === 'Pokémon');
  const trainerDeck = deck.filter(c => c.supertype === 'Trainer');
  const energyDeck = deck.filter(c => c.supertype === 'Energy');

  const score = calculateDeckScore(deck, collection, bestArchetype);
  const variants = generateVariants(bestArchetype, deck, archetypeMatches);
  const gameplayTips = generateGameplayTips(deck, bestArchetype, variant);
  const metaComparison = metaMatches.slice(0, 5);

  return {
    deck: { pokemon: pokemonDeck, trainers: trainerDeck, energies: energyDeck },
    totalCards: deck.reduce((s, c) => s + c.need, 0),
    score,
    variants,
    gameplayTips,
    missing,
    buyList,
    removeList,
    metaComparison,
    bestArchetype: bestArchetype?.name || targetPokemon[0]?.name || 'Sin arquetipo',
    targetPokemon,
    pokemonSuggestions,
    trainerSuggestions
  };
}

function buildDeckFromCollection(targetPokemon, collection, staples, trainers, energies, bestArchetype, variant, sourceMap) {
  const deck = [];
  const usedNames = new Set();
  let totalCards = 0;
  const suggestions = [];

  const isAgro = variant === 'agresivo';
  const isControl = variant === 'control';
  const isEco = variant === 'economico';
  const isCompetitive = variant === 'competitivo';

  const maxPokemon = isAgro ? 16 : isControl ? 8 : isCompetitive ? 10 : 12;
  const maxEnergy = isEco ? 12 : 14;
  const maxTrainers = 60 - maxPokemon - maxEnergy;

  const archetypeCards = bestArchetype?.cards || [];
  function getExplanation(name, supertype, count) {
    if (supertype === 'Energy') return 'Energía necesaria para atacar. Ponela en tu principal atacante.';
    const archCard = archetypeCards.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (archCard) return archCard.explanation;
    return getDefaultExplanation(name, bestArchetype?.name || 'mazo', count || 1);
  }

  function addCard(cardData, owned, need, supertype, category, explanation) {
    if (totalCards >= 60 || usedNames.has(cardData.name.toLowerCase())) return false;
    const currentOfType = deck.filter(c => c.supertype === supertype).reduce((s, c) => s + c.need, 0);
    if (supertype === 'Pokémon' && currentOfType >= maxPokemon) return false;
    if (supertype === 'Energy' && currentOfType >= maxEnergy) return false;
    if (supertype === 'Trainer' && currentOfType >= maxTrainers) return false;
    const qty = Math.min(need, 60 - totalCards);
    let collectionName = '';
    const cardLower = cardData.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, v] of Object.entries(sourceMap)) {
      if (k.startsWith(cardLower + '|')) { collectionName = v; break; }
    }
    deck.push({
      id: cardData.id || cardData.name,
      name: cardData.name,
      need: qty,
      owned: owned,
      supertype: supertype,
      types: cardData.types || [],
      image: cardData.image || '',
      set: cardData.set || '',
      explanation: explanation || getExplanation(cardData.name, supertype, need),
      category: category || guessCategory(cardData.name),
      collectionName: collectionName
    });
    usedNames.add(cardData.name.toLowerCase());
    totalCards += qty;
    return true;
  }

  function getCount(supertype) {
    return deck.filter(c => c.supertype === supertype).reduce((s, c) => s + c.need, 0);
  }

  const allPokemon = Object.values(collection).filter(c => c.supertype === 'Pokémon');
  const evoLines = buildEvolutionLines(allPokemon);

  evoLines.forEach(line => {
    if (getCount('Pokémon') >= maxPokemon) return;
    line.forEach(p => {
      if (getCount('Pokémon') >= maxPokemon) return;
      const owned = countInCollection(p.name, collection);
      if (owned === 0) return;
      const cardData = findInCollection(p.name, collection) || p;
      const need = Math.min(owned, 4);
      const expl = getExplanation(p.name, 'Pokémon', need) || generatePokemonExplanation(p, line, bestArchetype);
      addCard(cardData, owned, need, 'Pokémon', guessCategory(p.name), expl);
    });
  });

  const remainingPokemon = allPokemon
    .filter(p => !usedNames.has(p.name.toLowerCase()) && (p.count || 0) > 0)
    .sort((a, b) => {
      const aEx = a.subtypes?.some(s => /ex|vmax|vstar/i.test(s)) ? 10 : 0;
      const bEx = b.subtypes?.some(s => /ex|vmax|vstar/i.test(s)) ? 10 : 0;
      return (b.count + bEx) - (a.count + aEx);
    });

  remainingPokemon.forEach(p => {
    if (getCount('Pokémon') >= maxPokemon) return;
    if (p.evolvesFrom && countInCollection(p.evolvesFrom, collection) === 0) {
      suggestions.push({
        type: 'pokemon',
        priority: 'alta',
        name: p.name,
        message: 'Tenés ' + p.name + ' pero no tenés ' + p.evolvesFrom + ' (su pre-evolución). Sin ' + p.evolvesFrom + ' no podés usar ' + p.name + ' en el mazo.',
        action: 'Comprar ' + p.evolvesFrom + ' para evolucionar a ' + p.name
      });
      return;
    }
    const need = Math.min(p.count || 1, 4);
    addCard(p, p.count || 0, need, 'Pokémon', guessCategory(p.name), generatePokemonExplanation(p, [], bestArchetype));
  });

  const stapleList = Array.isArray(staples) ? staples : (staples?.cards || []);
  const allTrainers = Object.values(collection).filter(c => c.supertype === 'Trainer');

  const sortedTrainers = allTrainers.sort((a, b) => {
    const aRec = stapleList.find(s => s.name.toLowerCase() === a.name.toLowerCase());
    const bRec = stapleList.find(s => s.name.toLowerCase() === b.name.toLowerCase());
    if (aRec && !bRec) return -1;
    if (!aRec && bRec) return 1;
    return (b.count || 0) - (a.count || 0);
  });

  sortedTrainers.forEach(t => {
    if (getCount('Trainer') >= maxTrainers) return;
    if (usedNames.has(t.name.toLowerCase())) return;
    const rec = stapleList.find(s => s.name.toLowerCase() === t.name.toLowerCase());
    const need = rec ? Math.min(t.count || 1, rec.recommended || 4) : Math.min(t.count || 1, 4);
    addCard(t, t.count || 0, need, 'Trainer', rec ? 'staple' : guessCategory(t.name), rec?.explanation || getExplanation(t.name, 'Trainer', need));
  });

  const mainType = targetPokemon[0]?.types?.[0] || 'Colorless';
  const allEnergies = Object.values(collection).filter(c => c.supertype === 'Energy');
  const typeEnergies = allEnergies.filter(e => (e.types?.[0] || 'Colorless') === mainType);
  const otherEnergies = allEnergies.filter(e => (e.types?.[0] || 'Colorless') !== mainType);

  [...typeEnergies, ...otherEnergies].forEach(e => {
    if (getCount('Energy') >= maxEnergy) return;
    if (usedNames.has(e.name.toLowerCase())) return;
    const need = Math.min(e.count || 1, 60 - getCount('Energy'));
    addCard(e, e.count || 0, need, 'Energy', 'energy', 'Energía de tu colección para alimentar los ataques de tu Pokémon.');
  });

  const energyNeeded = maxEnergy - getCount('Energy');
  if (energyNeeded > 0) {
    const primaryEnergyName = mainType + ' Energy';
    if (!usedNames.has(primaryEnergyName.toLowerCase())) {
      const owned = countInCollection(primaryEnergyName, collection);
      addCard({ name: primaryEnergyName, types: [mainType] }, owned, energyNeeded, 'Energy', 'energy', 'Energía básica del tipo ' + mainType + ' para tus Pokémon principales.');
    }
  }

  if (getCount('Trainer') < maxTrainers) {
    stapleList.forEach(s => {
      if (totalCards >= 60) return;
      if (usedNames.has(s.name.toLowerCase())) return;
      const owned = countInCollection(s.name, collection);
      const trainerSlots = maxTrainers - getCount('Trainer');
      if (trainerSlots <= 0) return;
      const need = Math.min(s.recommended || 2, trainerSlots, 60 - totalCards);
      const cardData = findInCollection(s.name, collection);
      addCard(cardData || { name: s.name }, owned, need, s.supertype || 'Trainer', s.category || 'staple', s.explanation || '');
    });
  }

  const pokemonSuggestions = generatePokemonSuggestions(collection, bestArchetype, evoLines);
  const trainerSuggestions = generateTrainerSuggestions(collection, stapleList, usedNames);

  return { deck, suggestions: [...pokemonSuggestions, ...trainerSuggestions] };
}

function generatePokemonExplanation(pokemon, evoLine, bestArchetype) {
  const name = pokemon.name;
  const lower = name.toLowerCase();
  const isEx = pokemon.subtypes?.some(s => /ex/i.test(s));
  const isVmax = pokemon.subtypes?.some(s => /vmax/i.test(s));
  const isVstar = pokemon.subtypes?.some(s => /vstar/i.test(s));
  const isV = pokemon.subtypes?.some(s => /^v$/i.test(s));
  const type = pokemon.types?.[0] || 'Colorless';
  const hp = pokemon.hp || 0;
  const abilities = pokemon.ability ? [pokemon.ability] : (pokemon.abilities || []);
  const hasAbility = abilities.length > 0;
  const attacks = pokemon.attacks || [];
  const bestAttack = attacks.length > 0 ? attacks.reduce((a, b) => (a.convertedEnergyCost || 0) > (b.convertedEnergyCost || 0) ? a : b) : null;
  const energyCost = bestAttack?.convertedEnergyCost || 0;

  if (isEx) {
    let info = name + ' ex es el atacante principal. ';
    if (bestAttack) {
      info += 'Usá "' + bestAttack.name + '" (' + energyCost + ' energía) para hacer ' + bestAttack.damage + ' de daño. ';
    }
    if (hasAbility) {
      info += 'Su habilidad "' + abilities[0].name + '" te da ventaja extra — ¡usala cuando puedas! ';
    }
    info += 'Mantenelo en banca hasta tener energía suficiente, luego pasalo al activo.';
    return info;
  }
  if (isVmax) {
    let info = name + ' VMAX es tanque. ';
    if (bestAttack) info += '"' + bestAttack.name + '" hace ' + bestAttack.damage + ' de daño con ' + energyCost + ' energía. ';
    info += 'No da prizes al ser knockouteado. Úsalo para aguantar turnos.';
    return info;
  }
  if (isVstar) {
    let info = name + ' VSTAR combina ataque y habilidad. ';
    if (hasAbility) info += 'Activá "' + abilities[0].name + '" para ganar ventaja. ';
    if (bestAttack) info += 'Atacá con "' + bestAttack.name + '" cuando tengas la energía.';
    return info;
  }
  if (isV) {
    let info = name + ' V es tu amenaza temprana. ';
    if (bestAttack) info += '"'+ bestAttack.name + '" necesita solo ' + energyCost + ' energía — rápido de activar. ';
    info += 'Evoluciona a VMAX/VSTAR si podés.';
    return info;
  }

  if (pokemon.evolvesFrom) {
    const prevLower = pokemon.evolvesFrom.toLowerCase();
    if (evoLine && evoLine.length > 1) {
      const isLast = evoLine[evoLine.length - 1].name.toLowerCase() === lower;
      if (isLast) {
        return 'Forma final de la línea de ' + pokemon.evolvesFrom + '. ¡Evolucioná con Rare Candy o jugá ' + pokemon.evolvesFrom + ' primero para llegar acá!';
      }
    }
    return 'Evolucioná de ' + pokemon.evolvesFrom + '. Ponelo en la banca y evolucioná en el turno siguiente. Si tenés Rare Candy, pasá directo a Stage 2.';
  }

  const isBasic = !pokemon.evolvesFrom;
  if (pokemon.evolvesTo?.length > 0) {
    return 'Pokémon básico — necesitás este para evolucionar a ' + pokemon.evolvesTo[0] + '. Ponelo en la banca el primer turno y evolucioná después.';
  }
  if (isBasic) {
    if (hp > 70) return 'Pokémon básico con ' + hp + ' HP — buen activo inicial para aguantar los primeros turnos.';
    return 'Pokémon básico. Úsalo como activo inicial o como支援 (support) en banca.';
  }

  return 'Pokémon de tipo ' + type + '. Complementa la estrategia del mazo.';
}

function generatePokemonSuggestions(collection, bestArchetype, evoLines) {
  const suggestions = [];
  const allPokemon = Object.values(collection).filter(c => c.supertype === 'Pokémon');
  const ownedNames = new Set(allPokemon.map(p => p.name.toLowerCase()));

  evoLines.forEach(line => {
    const top = line[line.length - 1];
    const isEx = top?.subtypes?.some(s => /ex|vmax|vstar/i.test(s));
    if (isEx && top.count < 2) {
      suggestions.push({
        type: 'pokemon',
        priority: 'alta',
        name: top.name,
        message: 'Tenés solo ' + top.count + ' copia de ' + top.name + '. Ideal tener 2 para consistencia.',
        action: 'Agregar 1 copia más de ' + top.name
      });
    }

    const basic = line[0];
    if (basic && line.length > 1 && basic.count < 3) {
      suggestions.push({
        type: 'pokemon',
        priority: 'media',
        name: basic.name,
        message: 'Para evolucionar a ' + top.name + ' necesitás al menos 2-3 ' + basic.name + ' en el mazo.',
        action: 'Agregar ' + basic.name + ' hasta tener 3 copias'
      });
    }
  });

  if (bestArchetype?.cards) {
    const archPokemon = bestArchetype.cards.filter(c => {
      const lower = c.name.toLowerCase();
      return !ownedNames.has(lower);
    });

    archPokemon.forEach(c => {
      const isEx = /ex|vmax|vstar/i.test(c.name);
      if (isEx || /ball|candy|energy/i.test(c.name)) {
        const existing = suggestions.find(s => s.name === c.name);
        if (!existing) {
          suggestions.push({
            type: 'pokemon',
            priority: isEx ? 'alta' : 'media',
            name: c.name,
            message: c.explanation || 'Carta importante en el arquetipo ' + bestArchetype.name + '.',
            action: 'Buscar ' + c.name + ' para completar el mazo'
          });
        }
      }
    });
  }

  const exCount = allPokemon.filter(p => p.subtypes?.some(s => /ex/i.test(s))).reduce((s, p) => s + (p.count || 0), 0);
  if (exCount < 4) {
    suggestions.push({
      type: 'pokemon',
      priority: 'alta',
      name: 'Pokémon ex',
      message: 'Tenés pocas cartas Pokémon ex (' + exCount + ' en colección). Los ex son clave para el meta actual.',
      action: 'Buscar Pokémon ex de tipo ' + (allPokemon[0]?.types?.[0] || 'Fire') + ' para reforzar el mazo'
    });
  }

  return suggestions;
}

function generateTrainerSuggestions(collection, stapleList, usedNames) {
  const suggestions = [];
  const allTrainers = Object.values(collection).filter(c => c.supertype === 'Trainer');
  const ownedNames = new Set(allTrainers.map(t => t.name.toLowerCase()));

  stapleList.forEach(s => {
    if (usedNames.has(s.name.toLowerCase())) return;
    const owned = countInCollection(s.name, collection);
    if (owned === 0) {
      suggestions.push({
        type: 'trainer',
        priority: s.recommended >= 4 ? 'alta' : 'media',
        name: s.name,
        message: s.explanation || 'Carta staple importante para completar el mazo.',
        action: 'Buscar ' + s.name + ' (recomendado: ' + s.recommended + ' copias)'
      });
    } else if (owned < s.recommended) {
      suggestions.push({
        type: 'trainer',
        priority: 'media',
        name: s.name,
        message: 'Tenés ' + owned + ' copias, se recomiendan ' + s.recommended + '.',
        action: 'Agregar ' + (s.recommended - owned) + ' copia(s) más de ' + s.name
      });
    }
  });

  return suggestions;
}

function buildEvolutionLines(allPokemon) {
  const lines = [];
  const handled = new Set();

  const byName = {};
  allPokemon.forEach(p => {
    const key = p.name.toLowerCase();
    if (!byName[key] || (p.count || 0) > (byName[key].count || 0)) {
      byName[key] = p;
    }
  });

  const basicPokemon = allPokemon.filter(p => !p.evolvesFrom);
  basicPokemon.forEach(basic => {
    if (handled.has(basic.name.toLowerCase())) return;
    if ((basic.count || 0) === 0) return;

    const line = [basic];
    handled.add(basic.name.toLowerCase());

    let current = basic;
    while (current) {
      const evolution = allPokemon.find(p =>
        p.evolvesFrom && p.evolvesFrom.toLowerCase() === current.name.toLowerCase() &&
        !handled.has(p.name.toLowerCase()) && (p.count || 0) > 0
      );
      if (evolution) {
        line.push(evolution);
        handled.add(evolution.name.toLowerCase());
        current = evolution;
      } else {
        current = null;
      }
    }

    if (line.length > 1) {
      lines.push(line);
    }
  });

  allPokemon.forEach(p => {
    if (!handled.has(p.name.toLowerCase()) && (p.count || 0) > 0) {
      if (p.evolvesFrom) return;
      lines.push([p]);
      handled.add(p.name.toLowerCase());
    }
  });

  lines.sort((a, b) => {
    const aScore = a.reduce((s, p) => s + (p.count || 0) * (p.subtypes?.some(s => /ex/i.test(s)) ? 15 : 1), 0);
    const bScore = b.reduce((s, p) => s + (p.count || 0) * (p.subtypes?.some(s => /ex/i.test(s)) ? 15 : 1), 0);
    const aHasEx = a.some(p => p.subtypes?.some(s => /ex/i.test(s)));
    const bHasEx = b.some(p => p.subtypes?.some(s => /ex/i.test(s)));
    if (aHasEx !== bHasEx) return bHasEx - aHasEx;
    return bScore - aScore;
  });

  return lines;
}

function detectMissingPreEvolutions(deck, collection) {
  const missing = [];
  const seen = new Set();
  const pokemonDeck = deck.filter(c => c.supertype === 'Pokémon');

  pokemonDeck.forEach(p => {
    if (!p.evolvesFrom) return;
    const preEvoName = p.evolvesFrom.toLowerCase();
    if (seen.has(preEvoName)) return;
    seen.add(preEvoName);

    const owned = countInCollection(p.evolvesFrom, collection);
    if (owned > 0) return;

    const stage = p.subtypes?.some(s => /stage 2/i.test(s)) ? 'Stage 2' :
                  p.subtypes?.some(s => /stage 1/i.test(s)) ? 'Stage 1' : '';
    const qty = p.subtypes?.some(s => /stage 2/i.test(s)) ? 2 : 3;
    missing.push({
      name: p.evolvesFrom,
      qty: qty,
      evolvesTo: p.name,
      reason: 'Falta ' + p.evolvesFrom + ' (pre-evolución de ' + p.name + stage + '). Sin ella no podés evolucionar a ' + p.name + '. Podés usar Rare Candy si es Stage 2.'
    });
  });

  return missing;
}

function generateGameplayTips(deck, bestArchetype, variant) {
  const pokemonDeck = deck.filter(c => c.supertype === 'Pokémon');
  const trainerDeck = deck.filter(c => c.supertype === 'Trainer');
  const energyDeck = deck.filter(c => c.supertype === 'Energy');

  const mainAttacker = pokemonDeck.find(c => c.category === 'attacker') || pokemonDeck[0];
  const hasRareCandy = trainerDeck.some(c => /rare candy/i.test(c.name));
  const hasBoss = trainerDeck.some(c => /boss/i.test(c.name));
  const hasSwitch = trainerDeck.some(c => /switch/i.test(c.name));
  const hasResearch = trainerDeck.some(c => /research|Professor/i.test(c.name));
  const hasIono = trainerDeck.some(c => /iono/i.test(c.name));

  const tips = [];

  if (mainAttacker) {
    if (mainAttacker.evolvesFrom) {
      tips.push('Tu atacante principal es ' + mainAttacker.name + ', que evoluciona de ' + mainAttacker.evolvesFrom + '.');
      if (hasRareCandy) {
        tips.push('Tenés Rare Candy — podés saltar la Stage 1 y evolucionar directo a Stage 2.');
      } else {
        tips.push('Sin Rare Candy necesitás tener ' + mainAttacker.evolvesFrom + ' en banca para evolucionar normalmente.');
      }
    } else {
      tips.push('Tu atacante principal es ' + mainAttacker.name + ' (básico). No necesitás pre-evolución — podés atacar desde el primer turno si tenés la energía.');
    }
  }

  if (variant === 'agresivo') {
    tips.push('Variante AGRESIVA: llená la banca rápido con Pokémon básicos y atacá lo más pronto posible. No esperes a tener todo — presioná desde el turno 1-2.');
  } else if (variant === 'control') {
    tips.push('Variante CONTROL: foco en disruptar al rival con trainers como Iono o Boss. Sacá sus Pokémon clave del banca y controlá el ritmo del juego.');
  } else if (variant === 'competitivo') {
    tips.push('Variante COMPETITIVA: optimizá cada turno. Usá Boss para sacar Pokémon débiles del banca rival y sacar prizes fáciles.');
  } else if (variant === 'economico') {
    tips.push('Variante ECONÓMICA: priorizá cartas de tu colección y evitá comprar caro. Jugá con lo que tengas y andá mejorando de a poco.');
  } else {
    tips.push('Variante BALANCEADA: equilibrá entre ataque y defensa. Evolucioná tus Pokémon principales y usá trainers para mantener ventaja.');
  }

  if (hasBoss) tips.push('Usá Boss\'s Orders para forzar al rival a mover un Pokémon débil de banca al activo — excelente para sacar prizes.');
  if (hasSwitch) tips.push('Tenés Switch para reposicionar tu activo herido o sacarlo de una situación mala. No lo desperdicies.');
  if (hasResearch) tips.push('Professor\'s Research te da 7 cartas nuevas. Activalo cuando tengas poca utilidad en mano.');
  if (hasIono) tips.push('Iono ambos barajan y roban. Disruptá si el rival tiene mucha ventaja o refrescá tu mano mala.');

  const energyTypes = [...new Set(energyDeck.map(e => e.types?.[0]).filter(Boolean))];
  if (energyTypes.length === 1) {
    tips.push('Tu mazo usa solo energía de tipo ' + energyTypes[0] + ' —シンプル y consistente.');
  } else if (energyTypes.length > 1) {
    tips.push('Tu mazo usa múltiples tipos de energía (' + energyTypes.join(', ') + '). Asegurate de tener la energía correcta para cada atacante.');
  }

  return tips;
}

function scorePokemon(p, collection) {
  let score = (p.count || 0) * 10;
  if (p.subtypes && p.subtypes.some(s => /\bex\b|\bgx\b|^v$|vmax|vstar/i.test(s))) score += 15;
  if (p.hp) score += Math.min(p.hp / 50, 5);
  if (p.evolvesFrom) score += 3;
  if (p.rarity && /hyper|rare|ultra|illustration|special/i.test(p.rarity)) score += 5;
  return Math.round(score);
}

function matchArchetype(arch, collection) {
  if (!arch.cards || arch.cards.length === 0) return { pct: 0, have: 0, need: 0 };
  let haveTotal = 0;
  let needTotal = 0;
  arch.cards.forEach(c => {
    const owned = countInCollection(c.name, collection);
    haveTotal += Math.min(owned, c.need);
    needTotal += c.need;
  });
  const pct = needTotal > 0 ? Math.round((haveTotal / needTotal) * 100) : 0;
  return { pct, have: haveTotal, need: needTotal };
}

function countInCollection(name, collection) {
  const target = name.toLowerCase();
  let total = 0;
  Object.values(collection).forEach(c => {
    if (c.name.toLowerCase() === target) total += c.count;
  });
  return total;
}

function calculateMetaMatch(metaArch, collection) {
  if (!metaArch.cards || metaArch.cards.length === 0) return 0;
  let have = 0;
  let need = 0;
  metaArch.cards.forEach(c => {
    const owned = countInCollection(c.name, collection);
    have += Math.min(owned, c.need);
    need += c.need;
  });
  return need > 0 ? Math.round((have / need) * 100) : 0;
}

function getDefaultExplanation(cardName, archName, cardCount) {
  const lower = cardName.toLowerCase();
  if (lower.includes('ultra ball')) return 'Descartá 2 cartas para buscar cualquier Pokémon del mazo. Usalo para encontrar tu atacante o evolución clave.';
  if (lower.includes('professor')) return 'Descartá toda tu mano y roba 7. Activalo cuando tengas poca utilidad en mano para reciclar.';
  if (lower.includes('boss')) return 'Forzá al rival a mover un Pokémon de banca al activo. Úsalo para sacar un Pokémon débil y sacar prizes fáciles.';
  if (lower.includes('switch')) return 'Cambialo por otro de tu banca. Útil para sacar tu activo herido o reposicionar.';
  if (lower.includes('rare candy')) return 'Evolucioná directamente un básico a Stage 2 sin Stage 1. Guardalo para cuando tengas el Stage 2 en mano.';
  if (lower.includes('nest ball')) return 'Buscá un Pokémon básico y ponelo en la banca gratis. Ideal para llenar la mesa rápido.';
  if (lower.includes('buddy')) return 'Busca básicos de 70 HP o menos de tu mazo. Úsalo temprano para estabilizar.';
  if (lower.includes('iono')) return 'Ambos barajan y roban. Disruptá al rival si tiene mucha ventaja o refrescá tu mano mala.';
  if (lower.includes('energy')) return 'Pegalo a tu Pokémon activo o de banca para poder atacar. No lo uses si ya tenés suficiente.';
  if (lower.includes('ear')) return 'Tomá 2 cartas del tope de tu mazo. Bueno para encontrar lo que necesitás rápido.';
  if (lower.includes('vip')) return 'Busca 2 básicos de tu mazo y ponelos en banca. Activalo en tu primer turno para arrancar fuerte.';
  if (lower.includes('stadium')) return 'Campo que afecta a ambos jugadores. Ponelo cuando te beneficie a vos.';
  if (lower.includes('tool')) return 'Equipalo a un Pokémon para darle un bonus. No lo quemes si no lo vas a usar.';
  if (lower.includes('retriever') || lower.includes('recovery')) return 'Recuperá energías del descarte. Activalo cuando te falten energías para atacar.';
  if (lower.includes('cap')) return 'Robá cartas del tope hasta tener 3 en mano. Bueno para rellenar después de gastar.';
  return 'Carta incluida en ' + archName + '. Repetí ' + cardCount + ' veces en el mazo para consistencia.';
}

function guessSupertype(name) {
  const lower = name.toLowerCase();
  if (/energy/i.test(lower)) return 'Energy';
  if (/ball|candy|switch|research|boss|iono|poffin|charm|vest|goggles|rod|potion|capture/i.test(lower)) return 'Trainer';
  return 'Pokémon';
}

function guessCategory(name) {
  const lower = name.toLowerCase();
  if (/energy/i.test(lower)) return 'energy';
  if (/ball|candy|switch|research|boss|iono|poffin/i.test(lower)) return 'staple';
  if (/ex|gx|^v$|vmax|vstar/i.test(lower)) return 'attacker';
  return 'supporter';
}

function findInCollection(name, collection) {
  const target = name.toLowerCase();
  return Object.values(collection).find(c => c.name.toLowerCase() === target);
}

function optimizeDeck(deck) {
  let total = deck.reduce((s, c) => s + c.need, 0);
  if (total > 60) {
    const energyCards = deck.filter(c => c.category === 'energy');
    const stapleCards = deck.filter(c => c.category === 'staple');
    for (const c of [...energyCards, ...stapleCards]) {
      if (total <= 60) break;
      const excess = total - 60;
      const reduce = Math.min(c.need, excess);
      c.need -= reduce;
      total -= reduce;
    }
    deck = deck.filter(c => c.need > 0);
  }
  return deck;
}

function calculateDeckScore(deck, collection, bestMatch) {
  const ownedTotal = deck.reduce((s, c) => s + Math.min(c.owned, c.need), 0);
  const neededTotal = deck.reduce((s, c) => s + c.need, 0);
  const ownedPct = neededTotal > 0 ? Math.round((ownedTotal / neededTotal) * 100) : 0;

  const consistency = bestMatch ? Math.min(95, bestMatch.matchPct + 10) : 65;
  const speed = deck.some(c => /switch|nest ball|buddy/i.test(c.name)) ? 85 : 70;
  const power = deck.filter(c => c.category === 'attacker').length > 0 ? 90 : 60;
  const recovery = deck.some(c => /research|iono|potion/i.test(c.name)) ? 80 : 55;
  const competitiveness = bestMatch ? Math.min(98, bestMatch.matchPct + 5) : 50;
  const cost = ownedPct;

  const total = Math.round((consistency + speed + power + recovery + competitiveness + cost) / 6);

  return {
    consistency, speed, power, recovery, competitiveness, cost, total
  };
}

function generateVariants(bestArchetype, deck, allMatches) {
  const ownedTotal = deck.reduce((s, c) => s + Math.min(c.owned, c.need), 0);
  const neededTotal = deck.reduce((s, c) => s + c.need, 0);
  const pct = neededTotal > 0 ? Math.round((ownedTotal / neededTotal) * 100) : 0;
  const variants = [
    { name: 'Competitivo', type: 'competitivo', match: bestArchetype?.matchPct || 70, cost: 'Alto', difficulty: 'Difícil', desc: 'Máxima potencia, usa las mejores cartas' },
    { name: 'Económico', type: 'economico', match: Math.max(40, (bestArchetype?.matchPct || 70) - 20), cost: 'Bajo', difficulty: 'Fácil', desc: 'Prioriza cartas baratas y comunes' },
    { name: 'Casual', type: 'casual', match: Math.max(30, (bestArchetype?.matchPct || 70) - 30), cost: 'Medio', difficulty: 'Fácil', desc: 'Equilibrado para jugar tranquilo' },
    { name: 'Control', type: 'control', match: Math.max(35, (bestArchetype?.matchPct || 70) - 25), cost: 'Medio', difficulty: 'Media', desc: 'Más trainers y disruptors' },
    { name: 'Agresivo', type: 'agresivo', match: Math.max(45, (bestArchetype?.matchPct || 70) - 15), cost: 'Alto', difficulty: 'Difícil', desc: 'Más Pokémon, ataque rápido' }
  ];
  return variants;
}
