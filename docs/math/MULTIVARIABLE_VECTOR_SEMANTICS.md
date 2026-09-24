# Multivariable Calculus & Vector Analysis Semantics — Calc v2.1 / Phase U2

Phase U2 extends Calc from a single-variable/symbolic workstation into a certified multivariable and vector-calculus environment.

The implementation rule remains conservative:

> Calc only reports a multivariable or vector-calculus result when the implemented symbolic or numerical path is explicitly supported and verified. Unsupported general cases fail clearly instead of being guessed.

The U2 runtime lives in `multivariable.js` and is available from both **Calculate** and **Worksheet** Math blocks.

## Evaluation order

Math input is routed in this order:

1. `CalcMultivariable.runCommand`
2. `CalcCAS.runCommand`
3. `CalcCalculus.runCommand`
4. `CalcAlgebra.runCommand`
5. quantity/unit evaluation
6. core scalar evaluation

U2 is additive. Existing U1 CAS, calculus, algebra, numerical, unit, graph, and notebook semantics are retained.

## Differential geometry of scalar fields

### Gradient, Jacobian, and Hessian at a point

```text
gradat(x^2+y^2; x,y; 1,2)
→ [2, 4]

jacobianat(x^2+y,x*y; x,y; 2,3)
→ [[4, 1], [3, 2]]

hessianat(x^2+3*x*y+y^2; x,y; 2,3)
→ [[2, 3], [3, 2]]
```

The underlying symbolic derivatives come from the certified calculus engine and are then exactly substituted at the supplied point when possible.

### Total differential

```text
totaldiff(x^2*y+sin(y); x,y)
```

returns the exact first-order differential in coordinate form:

```text
df = f_x dx + f_y dy + ...
```

### Directional derivative

```text
directional(x^2+y^2; x,y; 1,2; 3,4)
→ 22/5
```

The supplied direction vector is normalized automatically. Zero direction vectors are rejected.

### Implicit differentiation

```text
implicitdiff(x^2+y^2-1; y; x)
```

uses

```text
dy/dx = -F_x / F_y
```

and rejects cases where the denominator is identically zero.

### Tangent planes

```text
tangentplane(x^2+y^2; x,y; 1,2)
```

constructs the tangent plane to `z=f(x,y)` from the exact function value and gradient at the supplied point.

## Multivariable Taylor expansions

Syntax:

```text
mtaylor(f; x,y,...; center; order)
```

U2 supports:

- 1–3 variables;
- total order 0–3;
- multi-index derivative construction;
- exact symbolic coefficients where the underlying kernel can preserve them.

The implementation explicitly caps order and dimension to prevent combinatorial expression explosion.

## Multivariable limits

Syntax:

```text
mlimit(f; x,y[,z]; point)
```

U2 certifies a finite limit directly when the expression is structurally continuous at the target.

For singular expressions, U2 probes independent paths including axes, diagonals, and selected nonlinear paths. If two paths approach different values, Calc returns `MULTIVARIABLE_LIMIT_DNE` with the conflicting path evidence.

Example:

```text
mlimit(x*y/(x^2+y^2); x,y; 0,0)
→ does not exist
```

If continuity does not certify the limit and sampled paths do not prove disagreement, Calc returns `UNSUPPORTED_MULTIVARIABLE`. U2 does not infer equality from finite path sampling.

## Unconstrained optimization

### Critical points

```text
critical(x^2+2*y^2-4*x+8*y; x,y)
→ x = 2, y = -2
```

U2 solves the gradient system through Calc's exact linear-system solver first, with the certified U1 two-variable nonlinear substitution solver as a fallback.

### Hessian classification

```text
classify(x^2-y^2; x,y; 0,0)
→ saddle point
```

For two variables, U2 uses the standard determinant test:

```text
D = f_xx f_yy - f_xy^2
```

and returns:

- local minimum;
- local maximum;
- saddle point;
- inconclusive when the Hessian test is degenerate.

It does not claim a classification when `D=0`.

## Constrained optimization

Syntax:

```text
lagrange(f; g; target; x,y)
```

Example:

```text
lagrange(x^2+y^2; x+y; 1; x,y)
→ x = 1/2, y = 1/2, lambda = 1
```

U2 currently certifies the important university case where the resulting Lagrange equations form an exact linear system, including quadratic objectives with linear equality constraints.

General nonlinear Lagrange systems remain explicit unsupported cases.

## Vector fields

A U2 vector field is a 2D or 3D ordered list of symbolic components associated with the same number of coordinate variables.

### Divergence

```text
div(x^2,y^2,z^2; x,y,z)
→ 2*x + 2*y + 2*z
```

### Curl

2D curl returns the scalar perpendicular component.

3D curl returns a vector:

```text
curl(-y,x,0; x,y,z)
→ [0, 0, 2]
```

### Conservative fields and scalar potentials

```text
conservative(y,x; x,y)
potential(2*x,2*y; x,y)
```

U2 verifies conservativity from the symbolic curl and reconstructs polynomial scalar potentials component-by-component.

Potential reconstruction is verified by differentiating the resulting potential back to every field component before exposure.

The current reconstruction algorithm is intentionally restricted to polynomial dependence in each integration variable.

## Curves and line integrals

### Parametric curves

Curves are supplied as coordinate expressions in one parameter.

### Vector line integral

```text
lineint(-y,x; x,y; cos(t),sin(t); t; 0,2*pi)
```

computes

```text
∫ F(r(t)) · r'(t) dt
```

and uses symbolic definite integration where supported, otherwise adaptive numerical integration.

### Arc length

```text
arclength(cos(t),sin(t); t; 0,2*pi)
```

computes

```text
∫ ||r'(t)|| dt
```

### Scalar line integral

```text
scalarline(f; x,y; rx(t),ry(t); t; a,b)
```

computes

```text
∫ f(r(t)) ||r'(t)|| dt
```

## Multiple integrals

U2 provides adaptive iterated integration over rectangular boxes:

```text
doubleint(f; x; a,b; y; c,d)
tripleint(f; x; a,b; y; c,d; z; e,f)
```

These are numerical integrations. They do not currently accept variable-dependent inner limits.

Adaptive Simpson recursion reports `INTEGRATION_CONVERGENCE` when the requested tolerance is not reached within the recursion budget.

## Parameterized surfaces

A surface is supplied by three coordinate expressions in two parameters.

### Surface area

```text
surfacearea(u,v,0; u,v; 0,1; 0,1)
→ approximately 1
```

U2 forms

```text
r_u × r_v
```

symbolically and integrates its norm over the parameter rectangle.

### Flux

```text
flux(0,0,1; x,y,z; u,v,0; u,v; 0,1; 0,1)
→ approximately 1
```

The parameter orientation determines the surface normal. Reversing the parameter order reverses signed flux.

## Integral theorems

The theorem commands are verification tools over explicit certified domains. They do not claim arbitrary-region geometric integration.

### Green's theorem

```text
green(P,Q; x,y; x0,x1; y0,y1)
```

For a positively oriented rectangle, Calc independently evaluates:

- the counterclockwise boundary circulation;
- the double integral of `Q_x - P_y`.

The result displays both values and their residual.

### Stokes' theorem

```text
stokes(Fx,Fy,Fz; x,y,z; x0,x1; y0,y1; z0)
```

U2 verifies Stokes' theorem on a rectangle in the plane `z=z0`, with upward normal and the corresponding counterclockwise boundary orientation.

Calc independently evaluates:

- `∮ F·dr`;
- `∬ (curl F)·n dS`.

### Divergence theorem / Gauss theorem

```text
gauss(Fx,Fy,Fz; x,y,z; x0,x1; y0,y1; z0,z1)
```

For an axis-aligned rectangular box, Calc independently evaluates:

- the triple integral of `div F`;
- outward flux across all six faces.

The residual is returned as a numerical verification metric.

## Numerical semantics

U2's numerical integrations:

- reject non-finite integrands;
- use adaptive Simpson refinement;
- expose an error estimate and evaluation count in metadata;
- fail explicitly on recursion-budget exhaustion;
- never silently replace a failed symbolic result with an unrelated approximation.

The theorem verifiers compute both sides independently; they do not simply duplicate one side algebraically.

## Discoverability

The command palette contains U2 entry points for:

- directional derivatives;
- tangent planes;
- multivariable limits;
- critical points;
- vector differential operators;
- line integrals;
- surface flux;
- integral theorem verification.

`mvhelp()` gives the compact U2 command list.

## Error semantics

Important U2 errors include:

```text
MULTIVARIABLE_ERROR
UNSUPPORTED_MULTIVARIABLE
MULTIVARIABLE_LIMIT_DNE
VARIABLE_REQUIRED
SHAPE_ERROR
ZERO_DIRECTION
INTEGRATION_CONVERGENCE
NON_FINITE
```

An unsupported result means that the certified U2 implementation does not cover the requested form. It does not imply that the mathematical problem is impossible.

## Certification boundary

U2 is covered by `tests/multivariable.js`, Worksheet integration tests, browser-level Calculate regression coverage, and the complete existing release suite.

Certification includes:

- evaluated gradients, Jacobians, and Hessians;
- total and directional derivatives;
- implicit derivatives and tangent planes;
- multivariable Taylor polynomials;
- continuity-certified limits and path-based nonexistence witnesses;
- critical-point solving and Hessian classification;
- certified Lagrange systems;
- divergence, curl, conservative-field checks, and scalar potentials;
- vector/scalar line integrals and arc length;
- rectangular double/triple integrals;
- parameterized surface area and flux;
- Green, Stokes, and divergence-theorem verification;
- explicit numerical non-convergence semantics.

U2 does **not** implement:

- a general multivariable symbolic-limit theorem prover;
- arbitrary nonlinear constrained optimization;
- general Gröbner elimination for critical/Lagrange systems;
- arbitrary non-rectangular multiple-integral regions;
- variable-dependent iterated bounds;
- general implicit or triangulated surface integration;
- arbitrary Green/Stokes/Gauss domains;
- differential forms or manifold calculus;
- symbolic tensor calculus.
