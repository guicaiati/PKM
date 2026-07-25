# Trainer's Ledger (PKM)

Aplicación web ligera para coleccionistas y jugadores de Pokémon TCG. Permite buscar cartas, armar mazos paso a paso con seguimiento de cartas faltantes en tiempo real y gestionar tu inventario personal.

## Pestañas principales

### 1. Buscar
Búsqueda de cartas por nombre o ID con autocompletado en tiempo real. Conecta a la [Pokémon TCG API](https://pokemontcg.io/).

### 2. Armar mazo
Guía interactiva de 8 pasos para armar mazos competitivos de 60 cartas:
- Buscador con autocompletado en cada paso.
- Sugerencias automáticas basadas en las cartas de tu colección.
- Panel fijo "Tenés / Falta comprar" agrupado por tipo que se actualiza en tiempo real.
- Exportación a formato texto (.txt) y guardado.

### 3. Colección
Gestión completa de tu inventario personal. Controles de cantidad (+/-), métricas superiores, filtros por tipo/elemento, ordenamiento y exportación/importación en JSON.

### 4. Guardado
Panel centralizado para administrar, renombrar, cargar o eliminar mazos y colecciones guardadas (primer plano para Mis mazos).

---

## Estructura del proyecto

```
PKM/
├── index.html              # Punto de entrada HTML
├── package.json            # Scripts de compilación SASS
├── scss/
│   ├── _vars.scss          # Fuentes, variables SASS y tokens CSS
│   └── styles.scss         # Estilos SASS anidados
├── css/
│   └── styles.css          # Estilos compilados
├── js/
│   ├── core.js             # Infraestructura: Storage, API y UI
│   └── views.js            # Controladores de vista: Buscar, Wizard, Colección, Guardado y App
├── data/                   # Diccionario Español-Inglés y sets locales
└── fonts/                  # Fuentes personalizadas (EssentiarumTCG, ThraexMagnus)
```

---

## Comandos

```bash
npm run build:css   # Compila SASS hacia css/styles.css
npm run watch:css   # Compila en tiempo real ante cambios en scss/
```

---

## Tecnologías

- JavaScript Vanilla (modular en 2 capas: `core.js` y `views.js`)
- SASS / SCSS
- IndexedDB & localStorage
- Pokémon TCG API
