const Progress = (() => {
  const TASKS = [
    { pct: 0, task: 'Iniciando análisis...' },
    { pct: 12, task: 'Leyendo colección...' },
    { pct: 28, task: 'Clasificando cartas...' },
    { pct: 41, task: 'Detectando Pokémon principales...' },
    { pct: 56, task: 'Buscando arquetipos compatibles...' },
    { pct: 72, task: 'Comparando contra el meta...' },
    { pct: 84, task: 'Calculando cartas faltantes...' },
    { pct: 95, task: 'Optimizando consistencia...' },
    { pct: 100, task: 'Construyendo mazo...' }
  ];

  let boxEl, taskEl, pctEl, fillEl;

  function init() {
    boxEl = document.getElementById('progressBox');
    taskEl = document.getElementById('progressTask');
    pctEl = document.getElementById('progressPercent');
    fillEl = document.getElementById('progressFill');
  }

  return {
    show() {
      if (!boxEl) init();
      boxEl.style.display = 'block';
      this.update(0, 'Iniciando análisis...');
    },

    hide() {
      if (!boxEl) init();
      boxEl.style.display = 'none';
    },

    update(percent, task) {
      if (!taskEl) init();
      pctEl.textContent = percent + '%';
      taskEl.textContent = task || '';
      fillEl.style.width = percent + '%';
    },

    updateFromStep(stepIndex) {
      if (stepIndex < TASKS.length) {
        this.update(TASKS[stepIndex].pct, TASKS[stepIndex].task);
      }
    },

    complete() {
      this.update(100, 'Análisis completo');
      setTimeout(() => this.hide(), 800);
    },

    reset() {
      this.update(0, '');
      this.hide();
    }
  };
})();
