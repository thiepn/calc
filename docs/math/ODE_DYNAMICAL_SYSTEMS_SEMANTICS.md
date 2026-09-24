# Differential Equations & Dynamical Systems Semantics — Calc v2.2 / Phase U3

Phase U3 extends Calc's University Mathematics Workstation with certified symbolic ODE families, numerical initial-value solvers, Laplace tools, and planar dynamical-systems analysis.

The implementation remains deliberately conservative:

> Exact formulas are exposed only for supported symbolic families and are verified by substitution or differentiation. General IVPs use explicit numerical solvers with convergence and singularity reporting. Unsupported forms fail clearly instead of being guessed.

The U3 runtime lives in `ode.js` and is available from both **Calculate** and **Worksheet** Math blocks.

## Evaluation order

Math input is routed through:

1. `CalcODE.runCommand`
2. `CalcMultivariable.runCommand`
3. `CalcCAS.runCommand`
4. `CalcCalculus.runCommand`
5. `CalcAlgebra.runCommand`
6. unit/quantity evaluation
7. core scalar evaluation

U3 is additive. U1 CAS and U2 multivariable/vector semantics remain unchanged.

## First-order symbolic ODEs

### Separable equations

Syntax:

```text
separable(f(x); g(y); x; y)
```

represents

```text
dy/dx = f(x) / g(y)
```

and returns the implicit relation

```text
∫ g(y) dy = ∫ f(x) dx + C
```

using Calc's certified symbolic integration rules.

Example:

```text
separable(x; y; x; y)
→ 1/2*y^2 = 1/2*x^2 + C
```

If either required antiderivative is outside the certified integration rules, Calc returns `UNSUPPORTED_ODE`.

### Exact equations

Syntax:

```text
exactode(M; N; x; y)
```

represents

```text
M(x,y) dx + N(x,y) dy = 0.
```

Calc first verifies

```text
∂M/∂y = ∂N/∂x.
```

It then reconstructs a scalar potential through the verified U2 conservative-field engine.

Example:

```text
exactode(2*x*y; x^2+2*y; x; y)
→ x^2*y + y^2 = C
```

The current potential reconstruction remains polynomial in the integration variables.

### First-order linear equations

Syntax:

```text
linearode(P; Q; x; y)
```

represents

```text
y' + P(x)y = Q(x).
```

Calc constructs

```text
μ(x) = exp(∫P(x)dx)
```

and returns

```text
y = (∫ μQ dx + C1) / μ.
```

The resulting symbolic family is differentiated back into the original ODE and numerically sampled before exposure.

Example:

```text
linearode(1; 1; x; y)
```

### Bernoulli equations

Syntax:

```text
bernoulli(P; Q; n; x; y)
```

represents

```text
y' + P(x)y = Q(x)y^n.
```

For `n ≠ 0,1`, U3 uses

```text
u = y^(1-n)
```

and solves the resulting first-order linear equation.

For `n=0` or `n=1`, Calc directs the problem back to the linear family instead of maintaining duplicate semantics.

## Second-order constant-coefficient equations

Syntax:

```text
ode2hom(a; b; c; x; y)
```

solves

```text
a y'' + b y' + c y = 0
```

for real constant coefficients with `a ≠ 0`.

U3 handles all three characteristic-root cases:

- two distinct real roots;
- one repeated real root;
- a complex-conjugate pair.

Examples:

```text
ode2hom(1; -3; 2; x; y)
ode2hom(1; 2; 1; x; y)
ode2hom(1; 0; 4; x; y)
```

Each generated family is differentiated twice and substituted back into the differential equation before exposure.

## Power-series IVP solutions

Syntax:

```text
seriesivp(rhs; x; y; x0,y0; order)
```

builds a Taylor solution for

```text
y' = f(x,y),   y(x0)=y0.
```

Higher derivatives are generated through repeated total differentiation along the flow:

```text
D = ∂/∂x + f(x,y) ∂/∂y.
```

U3 currently supports orders 1–8.

Example:

```text
seriesivp(x+y; x; y; 0,1; 5)
```

The result is a local truncated series with explicit big-O notation.

## Numerical IVPs

### Adaptive Dormand–Prince RK45

Syntax:

```text
ivp(rhs; x; y; x0,y0; x1)
```

solves a scalar first-order IVP.

Example:

```text
ivp(y; x; y; 0,1; 1)
→ y(1) ≈ 2.7182818...
```

The solver uses the embedded Dormand–Prince 5(4) pair with:

- adaptive step size;
- absolute and relative error tolerances;
- accepted/rejected step tracking;
- maximum step and RHS-evaluation budgets;
- forward and backward integration;
- step-underflow detection;
- non-finite RHS/state detection.

### Second-order IVPs

Syntax:

```text
ivp2(rhs; x; y; v; x0,y0,v0; x1)
```

represents

```text
y' = v
v' = rhs(x,y,v).
```

This supports general numerical second-order equations, including damped and forced oscillators.

Example:

```text
ivp2(sin(x)-y; x; y; v; 0,0,0; pi)
```

solves the resonantly forced oscillator

```text
y'' + y = sin(x).
```

### Systems of ODEs

Syntax:

```text
ivpsystem(f1,f2,...; t; y1,y2,...; t0; initial values; t1)
```

Example:

```text
ivpsystem(y,-x; t; x,y; 0; 1,0; pi/2)
```

The RHS/state/initial dimensions must match exactly.

### Fixed-step RK4

Syntax:

```text
rk4(f1,...; t; y1,...; t0; initial; t1; steps)
```

This exists as a transparent, deterministic fixed-step method for comparison and coursework.

U3 caps the number of RK4 steps to prevent accidental browser lockups.

## Numerical failure semantics

Important numerical errors include:

```text
ODE_CONVERGENCE
ODE_SINGULARITY
INVALID_STEPS
INVALID_TOLERANCE
```

`ODE_SINGULARITY` means the RHS or state was actually undefined/non-finite at an evaluated point.

`ODE_CONVERGENCE` means the solver could not meet the requested numerical contract, for example:

- exhausted step budget;
- exhausted evaluation budget;
- step-size underflow while approaching a difficult or singular region.

These meanings are intentionally distinct.

## Trajectories and phase-space data

### Sampled trajectories

Syntax:

```text
trajectory(f1,f2,...; t; y1,y2,...; t0,t1; initial; samples)
```

U3 integrates to each requested sample time using RK45 and returns a deterministic array of time/state points.

### Direction fields

Syntax:

```text
directionfield(rhs; x,y; xmin,xmax; ymin,ymax; nx,ny)
```

Each finite sample contains:

- point coordinates;
- raw slope;
- normalized direction vector.

Grid locations where the RHS is singular are omitted rather than assigned invented directions.

### 2D phase portraits

Syntax:

```text
phase2(f,g; x,y; xmin,xmax; ymin,ymax; nx,ny; x0,y0; t0,t1; samples)
```

The result combines:

- a normalized autonomous vector-field grid;
- one adaptive RK45 trajectory from the supplied initial state.

This is a mathematical data model. Phase U3 does not introduce a new canvas or plotting workspace; the existing Graph architecture remains separate.

## Equilibria and linearization

### Equilibria

Syntax:

```text
equilibria(f,g; x,y)
```

solves

```text
f(x,y)=0
g(x,y)=0
```

through Calc's existing exact linear-system solver and certified U1 two-variable nonlinear fallback.

### Jacobian linearization

Syntax:

```text
linearize(f,g; x,y; x0,y0)
```

returns the exact Jacobian at the supplied point.

### Stability classification

Syntax:

```text
stability(f,g; x,y; x0,y0)
```

The point is first verified to be an equilibrium.

For the 2×2 Jacobian (J), U3 computes:

```text
trace(J)
det(J)
trace(J)^2 - 4 det(J)
```

and classifies the linearization as:

- stable node;
- unstable node;
- saddle;
- stable spiral;
- unstable spiral;
- stable/unstable repeated node;
- center (linearized);
- non-hyperbolic.

Hyperbolic classifications carry their standard local nonlinear stability consequence.

When eigenvalues have zero real part, U3 explicitly reports nonlinear stability as inconclusive rather than inferring it from the linearized system.

## 2×2 matrix exponentials

Syntax:

```text
matrixexp2(a,b,c,d; t)
```

computes

```text
exp([[a,b],[c,d]] t)
```

through the trace/deviatoric closed form.

U3 handles:

- real distinct spectral branches with hyperbolic functions;
- complex-conjugate branches with sine/cosine;
- repeated/Jordan branches.

Every candidate is checked numerically against

```text
E'(t) = A E(t).
```

### Linear flow

Syntax:

```text
linearflow2(a,b,c,d; x0,y0; t)
```

returns

```text
exp(At) x0.
```

This provides an exact bridge between linear algebra and planar dynamical systems.

## Laplace transforms

### Forward transform

Syntax:

```text
laplace(f; t; s)
```

U3 includes certified table rules for:

- constants;
- nonnegative integer powers of (t);
- exponentials with linear exponents;
- zero-phase sine/cosine;
- zero-phase hyperbolic sine/cosine;
- finite sums/differences;
- constant multiples.

Unsupported products such as (tsin t) are reported explicitly rather than transformed by an unimplemented property.

### Inverse transform

Syntax:

```text
invlaplace(F; s; t)
```

The certified inverse table currently covers proper rational transforms with denominator degree 1 or 2.

That includes:

- real simple poles;
- real distinct quadratic poles;
- repeated quadratic poles;
- irreducible quadratic oscillatory factors.

General partial fractions, repeated poles above order two, and non-rational transforms remain unsupported.

## Convolution

Syntax:

```text
convolution(f; g; t; value)
```

numerically evaluates the causal convolution

```text
(f*g)(T) = ∫_0^T f(τ) g(T-τ) dτ
```

for finite (T ≥ 0), using Calc's certified adaptive integration kernel.

## Worksheet integration

All U3 commands are valid Worksheet Math blocks.

U3 command names are excluded from symbol-dependency discovery so names such as `ivp`, `stability`, and `laplace` are never mistaken for user-defined notebook variables.

Structured non-scalar U3 outputs remain serializable but are not assigned to the calculator's scalar `ans` variable.

## Discoverability

The command palette includes U3 entry points for:

- first-order linear ODEs;
- second-order homogeneous ODEs;
- adaptive IVPs;
- forced oscillators;
- equilibrium stability;
- phase portraits;
- Laplace transforms;
- 2×2 matrix exponentials.

`odehelp()` returns the compact U3 command list.

## Error semantics

Important U3 errors include:

```text
ODE_ERROR
UNSUPPORTED_ODE
ODE_CONVERGENCE
ODE_SINGULARITY
NOT_EXACT
NOT_EQUILIBRIUM
DEGENERATE_ORDER
DEGENERATE_BERNOULLI
INVALID_GRID
INVALID_SAMPLES
```

An unsupported result means the certified U3 implementation does not cover that mathematical form. It does not mean the ODE has no solution.

## Certification boundary

U3 is covered by:

- `tests/ode.js`;
- existing U1/U2 regression suites;
- Worksheet integration tests;
- browser-level Calculate regression coverage;
- primary CI;
- static release gates;
- the Chromium / Firefox / WebKit / mobile Chromium production soak.

Certification includes:

- separable implicit relations;
- exact differential equations;
- integrating-factor first-order equations;
- Bernoulli transformations;
- all constant-coefficient homogeneous second-order characteristic cases;
- Taylor-series IVPs;
- forward/inverse Laplace table entries;
- convolution;
- RK4;
- adaptive scalar, second-order, and system IVPs;
- backward integration;
- forced oscillators;
- explicit singularity/convergence semantics;
- sampled trajectories;
- direction fields;
- phase portraits;
- equilibria;
- Jacobian linearization;
- node/spiral/saddle/center classification;
- 2×2 matrix exponentials and linear flows.

U3 does **not** implement:

- a universal symbolic ODE solver;
- symbolic nonlinear second-order ODE families;
- arbitrary symbolic forced-response undetermined-coefficient solving;
- arbitrary integrating factors for non-exact equations;
- arbitrary higher-dimensional symbolic matrix exponentials;
- stiff BDF/Radau solvers;
- differential-algebraic equations;
- boundary-value problem solvers;
- event detection or discontinuous RHS handling;
- delay differential equations;
- PDEs;
- general Laplace expressions outside the certified table/rational families;
- automatic nonlinear stability proofs for non-hyperbolic equilibria;
- bifurcation continuation or Lyapunov-exponent analysis.
