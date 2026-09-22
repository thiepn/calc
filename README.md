# Calc

A local-first universal calculator PWA.

This repository contains the production implementation of Calc: an installable, offline-first mathematical workstation with exact arithmetic, scientific calculation, graphing, matrices, data/statistics, specialized tools, worksheets, history, and local persistence.

## Run

Open `index.html` with a static server, or use the GitHub Pages deployment included in `.github/workflows/pages.yml`.

## Architecture

- `math.js` — parser, exact rational arithmetic, expression evaluation, algebra helpers, matrices, statistics, units and finance helpers.
- `app.js` — application state, IndexedDB persistence, workspaces, command palette, graph renderer and interaction.
- `styles.css` — responsive app UI and Light/Graphite/OLED themes.
- `sw.js` + `manifest.webmanifest` — offline/installable PWA runtime.

No external runtime libraries are required.
