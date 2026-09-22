# Graphing V2 Semantics

This document defines the certified graphing behavior introduced in Implementation Phase 7.

## Governing rule

Rendering may be approximate.

Mathematical claims may not be.

Pixels, samples, marching-square cells, and screen-space geometry are used to visualize canonical mathematical objects. They are not used as the final authority for roots, intersections, extrema, tangents, or definite-integral values.

Certified analysis routes through the Phase 2–6 engines.

## Architecture

Graphing lives in `graph.js` and consumes:

- `math.js` — parser/evaluator;
- `algebra.js` — symbolic expressions and domain restrictions;
- `calculus.js` — derivatives, limits, roots, integrals;
- `linear-algebra.js` — vectors/matrices;
- `statistics.js` — scatter/histogram/box/distribution models.

Primary graph objects:

- `Viewport`
- `PlotSeries`
- `FunctionPlot`
- `PiecewisePlot`
- `ParametricPlot`
- `PolarPlot`
- `ImplicitPlot`
- `InequalityPlot`
- `ScatterPlot`
- `HistogramPlot`
- `BoxPlot`
- `DistributionPlot`
- `VectorPlot`
- `GraphSession`

A separate `graph-worker.js` provides an off-main-thread geometry/analysis boundary.

## Viewport

`Viewport` owns:

- xMin/xMax;
- yMin/yMax;
- world ↔ screen transforms;
- focal zoom;
- pixel-based panning;
- serialization.

Viewport bounds must be finite and have positive span.

World/screen transforms are certified round-trip operations.

## Axis ticks

Linear ticks use a 1–2–5 progression.

The x-axis can optionally use π-aware labels.

Examples:

- `0`
- `π/2`
- `π`
- `−π`

Axis labels are presentation only and do not affect expression evaluation.

## Function plots

`FunctionPlot` stores the original source expression and canonical AST.

Evaluation uses the Phase 1 evaluator in real mode.

Sampling is adaptive.

The sampler begins from a bounded coarse grid and recursively subdivides intervals when screen-space midpoint error exceeds the configured threshold.

Sampling is bounded by explicit point/depth budgets.

## Discontinuities

Function sampling must not connect across known or detected discontinuities.

The graph engine uses:

- non-finite evaluations;
- algebraic domain restrictions;
- restriction-root discovery;
- screen-space jump heuristics;
- recursive subdivision.

Example:

```text
1/x
```

must not render a vertical polyline through x = 0.

## Removable discontinuities

Domain restrictions survive algebraic cancellation.

For:

```text
(x^2 - 1)/(x - 1)
```

Graph V2 retains the exclusion x = 1.

Where the two-sided certified limit exists, the graph exposes an open-hole marker at the limiting coordinate.

For this example:

```text
(1, 2)
```

is rendered as an open point.

## Piecewise plots

`PiecewisePlot` stores explicit branch ranges and open/closed endpoint state.

Programmatic branch form:

```text
source
lower bound
upper bound
lower closed?
upper closed?
```

Graph input syntax:

```text
piecewise(expr; lower; upper; [) | expr; lower; upper; [])
```

Infinite endpoints use `inf` / `-inf`.

Open/closed endpoint markers are derived from the branch definition, not inferred from rendered pixels.

## Parametric plots

Input syntax:

```text
parametric(x(t); y(t); t; tMin; tMax)
```

Both coordinate expressions use the shared evaluator.

Adaptive subdivision is based on screen-space curve error.

Trace results report the parameter plus evaluated x/y coordinates.

## Polar plots

Input syntax:

```text
polar(r(theta); theta; thetaMin; thetaMax)
```

Internal conversion is:

```text
x = r cos(theta)
y = r sin(theta)
```

Radians are used internally.

Negative radius values are handled naturally by this coordinate transformation.

## Implicit plots

Input syntax:

```text
implicit(f(x,y))
```

The rendered contour represents:

```text
f(x,y) = 0
```

Graph V2 uses marching squares.

Ambiguous saddle cells use the center sign as the local disambiguation rule.

Implicit plots are geometry approximations; the contour does not become a mathematical solver.

The implicit cell and segment counts are bounded.

## Inequality plots

Input syntax:

```text
ineq(left <= right)
ineq(left < right)
ineq(left >= right)
ineq(left > right)
```

Region membership is computed from the mathematical predicate at cell centers.

The boundary is generated from the implicit equation:

```text
left - right = 0
```

Included boundaries are solid.

Excluded boundaries are rendered dashed.

## Statistical plot models

Graph V2 consumes Phase 6 visualization models directly.

### Scatter

Scatter points retain Dataset row IDs.

Graph does not independently drop/re-pair observations.

### Histogram

Histogram bins/counts are consumed unchanged from the Phase 6 histogram model.

Graph does not recalculate bins.

### Box plot

Quartiles, fences, and outliers are consumed unchanged from the Phase 6 box-plot model.

Graph does not recalculate quartiles.

### Distribution

PMF/PDF points are consumed from the Phase 6 distribution model.

Graph does not recalculate probabilities.

## Vector plots

`VectorPlot` consumes a canonical Phase 5 2D Vector and renders an arrow from an explicit origin.

The displayed arrow is derived from the Vector coordinates.

## Graph sessions

`GraphSession` owns:

- Viewport;
- ordered series;
- markers;
- sliders;
- base evaluation environment;
- revision counter.

The series limit is bounded.

Session serialization retains:

- viewport;
- series definitions;
- markers;
- slider definitions.

## Sliders

Graph input syntax:

```text
slider(a; value; min; max; step)
```

Slider values live in the GraphSession environment.

The same slider environment is passed to:

- plotted evaluation;
- tracing;
- root analysis;
- extrema analysis.

This prevents analysis/rendering environment drift.

## Parsing

Graph input is one plot/session directive per line.

Supported line forms:

- ordinary explicit expression;
- `f(x) = expression`;
- `slider(...)`;
- `piecewise(...)`;
- `parametric(...)`;
- `polar(...)`;
- `implicit(...)`;
- `ineq(...)`.

Reserved constructors are strict.

Malformed reserved syntax fails explicitly instead of falling through and being interpreted as a normal function call.

## Root analysis

`findRoots` accepts a FunctionPlot and viewport.

Candidate discovery uses bounded mathematical sampling.

Every sign-change candidate is refined through the certified Phase 3 hybrid root solver.

Repeated/even-multiplicity roots are additionally searched through stationary points from the certified symbolic derivative.

A returned root must satisfy the configured function residual threshold.

Pixels are never used as root coordinates.

## Intersections

Intersections of two FunctionPlots are solved as roots of:

```text
f(x) - g(x)
```

using the same certified root path.

The y coordinate is then evaluated from the original function.

## Extrema

Extrema analysis:

1. symbolically differentiates the function;
2. finds certified roots of the derivative;
3. evaluates the original function at those x values;
4. uses the second derivative where available to classify minimum / maximum / stationary.

The viewport scopes candidate discovery; it does not redefine the mathematical functions.

## Tangents

A tangent result evaluates:

- original function value;
- certified symbolic derivative.

The line is represented as a normal FunctionPlot source.

Example conceptual form:

```text
y0 + m * (x - x0)
```

The tangent marker uses the exact analysis point, not a sampled canvas point.

## Definite-integral analysis

Graph integral analysis delegates to Phase 3 `definiteIntegral`.

The displayed value can therefore be exact when the calculus engine has an exact certified antiderivative.

Integral shading is visual only.

The shaded polygon is not used to estimate the integral result.

## Trace

Function trace evaluates the canonical expression at the current world-space x coordinate.

The pointer does not snap to or interpolate from rendered samples.

Parametric/polar trace operates on the parameter.

Scatter trace preserves source row identity when an explicit point is provided.

## Pan and zoom

Graph V2 supports:

- pointer drag;
- wheel zoom;
- pinch zoom.

All interactions update the canonical Viewport.

Pinch zoom uses a focal world-space anchor and then applies center translation.

## Export

The production workspace can export the current canvas as PNG.

The exported image represents the current viewport and rendering state.

Exported pixels do not serve as persisted mathematical data.

## Accessibility

The canvas has a textual live summary containing:

- number of series;
- visible/hidden state;
- plot type;
- series label;
- analysis-marker count.

The UI does not create one accessibility node per rendered point.

Analysis results are ordinary textual DOM output.

## Rendering budgets

Graph V2 centralizes bounded limits including:

- maximum active series;
- maximum function points;
- adaptive depth;
- implicit cells;
- contour segments;
- scatter points.

Budget exhaustion raises `GRAPH_BUDGET_EXCEEDED`.

The engine does not silently allocate unbounded geometry.

## Worker architecture

`graph-worker.js` imports the canonical math/algebra/calculus/statistics/graph layers.

Supported worker tasks include:

- series geometry;
- root analysis;
- implicit contour geometry.

The worker does not contain independent duplicate mathematical algorithms.

## Typed errors

Phase 7 adds:

- `GRAPH_ERROR`
- `GRAPH_DOMAIN_ERROR`
- `GRAPH_BUDGET_EXCEEDED`
- `UNSUPPORTED_GRAPH`

Errors from calculus/algebra/statistics remain visible where those engines own the mathematical operation.

## Production Graph workspace

The Graph workspace now supports:

- multiple explicit functions;
- piecewise plots;
- sliders;
- parametric plots;
- polar plots;
- implicit curves;
- inequalities;
- π ticks;
- pan/wheel/pinch navigation;
- canonical pointer trace;
- roots;
- intersections;
- extrema;
- tangents;
- definite integrals;
- scatter overlays;
- regression overlays;
- histograms;
- box plots;
- distribution plots;
- PNG export.

Data overlays consume the current Phase 6 Dataset selections and models.

## Deliberate Phase 7 limitations

Not yet certified:

- 3D graphing;
- arbitrary symbolic implicit solving;
- proof-complete discontinuity classification for every transcendental function;
- contour topology guarantees beyond the bounded marching-squares model;
- GPU/WebGL rendering;
- logarithmic axes;
- general complex-plane plots;
- full graph-session persistence across app restarts;
- publication-grade SVG export;
- arbitrary styling editors;
- mathematical area-between-curves solver.

These remain explicit boundaries rather than hidden pixel heuristics.
