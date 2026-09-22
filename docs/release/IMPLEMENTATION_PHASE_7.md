# Implementation Phase 7 — Graphing V2

Status: **implemented**

## Delivered

### Canonical graph engine

Added `graph.js` with:

- Viewport
- PlotSeries
- FunctionPlot
- PiecewisePlot
- ParametricPlot
- PolarPlot
- ImplicitPlot
- InequalityPlot
- ScatterPlot
- HistogramPlot
- BoxPlot
- DistributionPlot
- VectorPlot
- GraphSession

### Geometry

Implemented:

- world/screen transforms;
- 1–2–5 ticks;
- π ticks;
- adaptive function sampling;
- discontinuity splitting;
- removable-hole markers;
- piecewise endpoint markers;
- adaptive parametric/polar sampling;
- marching-squares implicit contours;
- inequality fill/boundary models;
- statistical model rendering;
- vector arrows.

### Certified analysis

Graph analysis now routes through certified math engines:

- roots → Phase 3 hybrid root solver;
- repeated-root discovery → symbolic derivative;
- intersections → root of f-g;
- extrema → derivative roots + second derivative;
- tangents → symbolic derivative;
- definite integrals → Phase 3 definiteIntegral.

Analysis coordinates never come from canvas pixels.

### Session/sliders

Added GraphSession and slider syntax:

```text
slider(a;1;-3;3;0.1)
```

Slider state feeds both rendering and certified analysis.

### Graph input syntax

Added:

```text
f(x)=...
piecewise(...)
parametric(...)
polar(...)
implicit(...)
ineq(...)
slider(...)
```

Malformed reserved syntax is rejected explicitly.

### Data integration

Graph overlays consume Phase 6 models directly:

- scatter;
- SVD regression line;
- histogram;
- box plot;
- current probability distribution.

Graph does not recalculate bins, quartiles, pairing, regression coefficients, or probability values.

### Workspace V2

Rebuilt production Graph UI with:

- plot input;
- sliders;
- series legend/toggles;
- π tick option;
- roots/intersections/extrema/tangent/integral controls;
- Data overlay controls;
- pointer trace;
- drag pan;
- wheel zoom;
- pinch zoom;
- PNG export;
- accessibility summary.

Also fixed the pre-existing workspace-navigation regression caused by calling `forEach` on a single-element query.

### Worker

Added `graph-worker.js` for geometry/root/implicit workloads using the canonical engines.

### PWA

Graph engine and worker are part of the offline shell.

## Certification

The Graph V2 suite covers:

- viewport transform round trips;
- zoom/pan invariants;
- numeric and π ticks;
- adaptive explicit sampling;
- no segment crossing a 1/x pole;
- removable-hole detection;
- piecewise open/closed endpoints;
- parametric circle closure;
- polar trace;
- implicit circle contour residual;
- inequality membership and boundary state;
- roots;
- even-multiplicity roots;
- intersections;
- extrema classification;
- tangent slope/line;
- exact definite-integral handoff;
- slider/render/analysis environment consistency;
- graph syntax parser;
- reserved-syntax rejection;
- Phase 6 scatter/histogram/box/distribution model fidelity;
- vector visualization;
- GraphSession serialization;
- series-budget enforcement.

## Phase boundary

Implementation Phase 8 should move the broad everyday/specialized tool catalog onto the typed Tool Registry/FormulaRelation architecture.

Do not expand Graph with unrelated formula calculators during Phase 8.
