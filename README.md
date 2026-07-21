# Trainer's Ledger (PKM)

Aplicación web para coleccionistas y jugadores de Pokémon TCG. Permite buscar, catalogar y armar mazos usando tu propia colección de cartas.

## Funcionalidades principales

### Buscar
Búsqueda de cartas por nombre, número o ID. Autocompletado, filtros por tipo (Pokémon, Trainer, Energy) y historial de búsquedas. Conecta a la [Pokémon TCG API](https://pokemontcg.io/) para obtener datos actualizados.

### Mi colección
Gestión completa de tu colección personal. Controles de cantidad por carta (+/-), filtros por tipo y elemento, ordenamiento (nombre, copias, fecha). Soporta múltiples colecciones nombradas con guardado y carga. Exportación e importación en JSON.

### Construir mazo
Constructor inteligente de mazos de 60 cartas. Analiza tu colección, genera variantes con puntaje, lista de cartas a comprar, cartas a eliminar de la colección, comparación con el meta actual y sugerencias de mejora. Incluye tips de juego para cada mazo generado.

### Guardados
Panel centralizado para ver, cargar, renombrar y eliminar colecciones y mazos guardados.

### Meta
Ranking de arquetipos competitivos del formato Standard, con datos de uso y popularidad actualizados desde [Limitless TCG](https://limitlesstcg.com). Verifica qué arquetipos puedes jugar con tu colección actual.

### Arquetipos
Plantillas de mazos pre-cargados y creación de arquetipos personalizados. Seguimiento de progreso de compilación con porcentaje de completado y lista de cartas faltantes.

## Estructura del proyecto

```
PKM/
├── index.html              # Página principal con todas las secciones
├── trainers-ledger.html    # Versión anterior (standalone)
├── css/
│   └── styles.css          # Estilos globales
├── js/
│   ├── api.js              # Conexión a Pokémon TCG API e índices locales
│   ├── app.js              # Inicialización y control de pestañas
│   ├── collection.js       # Lógica de colección (agregar, filtrar, guardar)
│   ├── deckbuilder.js      # Constructor inteligente de mazos
│   ├── deckbuilder.worker.js # Web Worker para cálculos del mazo
│   ├── meta.js             # Datos del meta competitivo
│   ├── progress.js         # Barra de progreso para procesos largos
│   ├── saved.js            # Gestión de colecciones y mazos guardados
│   ├── scanner.js          # Búsqueda y renderizado de resultados
│   ├── storage.js          # Persistencia en IndexedDB y localStorage
│   └── ui.js               # Renderizado de cartas, modales y utilidades UI
├── data/                   # Datos locales (cartas, nombres, arquetipos, meta)
└── fonts/                  # Fuentes personalizadas (EssentiarumTCG, ThraexMagnus)
```

## Tecnologías

- HTML, CSS y JavaScript puro (sin frameworks)
- IndexedDB para persistencia de la colección
- localStorage para colecciones/mazos guardados y configuración
- Pokémon TCG API para búsqueda y datos de cartas
- Web Workers para procesamiento del constructor de mazos
