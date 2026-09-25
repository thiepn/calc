# Numerical Mathematics Semantics — Calc v2.5 / Phase U6

Phase U6 adds a certified numerical-analysis layer to Calc's University Mathematics Workstation.

The U6 runtime is `numerical-mathematics.js` and is shared by **Calculate** and **Worksheet Math** blocks.

U6 builds on existing kernels rather than replacing them:

- CalcCalculus: derivatives, adaptive Simpson, root solvers;
- CalcODE: compiled ODE systems and RK kernels;
- CalcLinearAlgebra / U5: Matrix/Vector, SVD, conditioning;
- CalcOptimization: BFGS/Newton/gradient optimization.

The design rule is:

> A numerical answer is accompanied by the error, residual, order, conditioning, convergence, or stability evidence that supports it whenever that evidence is available.

## Routing

U6 commands are routed before U5/U4 so unique numerical commands are recognized first.

The existing U3 command

```text
stability(f,g; x,y; x0,y0)
```

remains unchanged.

U6 therefore uses the non-conflicting command:

```text
absstability(method; Re(z); Im(z))
```

for numerical ODE absolute-stability analysis.

## Floating-point diagnostics

### floatinfo

```text
floatinfo(x)
```

reports:

- the supplied IEEE-754 binary64 value;
- conventional binade ULP spacing;
- the next larger representable value;
- the next smaller representable value;
- machine epsilon.

At (x=1),

```text
ulp(1) = 2^-52
```

The ULP definition uses the spacing of the binade containing (|x|). Subnormals use `Number.MIN_VALUE`.

### numerror

```text
numerror(reference; approximation)
```

reports absolute, relative, and percentage error plus an approximate significant-digit diagnostic.

### cancellation

```text
cancellation(a; b)
```

analyzes subtraction (a-b) through the size of the result relative to the operands.

The reported "lost decimal digits" is a scale diagnostic, not a proof of the exact number of trustworthy digits in a larger algorithm.

## Scalar conditioning

```text
scalarcond(f; x; x0)
```

reports

```text
absolute condition ≈ |f'(x0)|
relative condition ≈ |x0 f'(x0) / f(x0)|
```

The derivative is estimated through Calc's certified numerical-derivative path.

A zero output may make the relative condition infinite even when the absolute condition is finite.

## Richardson extrapolation and observed order

### richardson

```text
richardson(coarse; fine; p)
richardson(coarse; fine; p; ratio)
```

assumes an asymptotic error model

```text
A(h) = A + C h^p + higher-order terms.
```

For refinement ratio (r>1),

```text
A ≈ A(h/r) + [A(h/r)-A(h)]/(r^p-1).
```

The reported error estimate is meaningful only when the approximations are in the asymptotic regime and the assumed order is valid.

### convorder

```text
convorder(A_h; A_h/r; A_h/r²)
```

estimates

```text
p = log(|A1-A2| / |A2-A3|) / log(r).
```

Identical successive approximations make the observed order undefined rather than "infinite."

## Root finding V2

### fixedpoint

```text
fixedpoint(g(x); x; x0)
```

performs fixed-point iteration

```text
x_(n+1) = g(x_n)
```

with step-size convergence checks.

At the final point Calc also estimates (|g'(x^*)|) as a local contraction diagnostic.

Convergence of one run does not prove global convergence from arbitrary initial values.

### rootcompare

```text
rootcompare(f; x; a,b; x0,x1)
```

runs the existing certified:

- bisection;
- Newton;
- secant;
- hybrid Newton/bisection

solvers under the same tolerance contract.

Each method reports its root, residual, iterations, and evaluation count or its explicit failure reason.

## Polynomial interpolation

### Barycentric Lagrange

```text
interp(x-list; y-list; target)
```

uses first-form barycentric weights.

Duplicate nodes are rejected.

### Newton divided differences

```text
newtoninterp(x-list; y-list; target)
```

returns the interpolated value plus Newton divided-difference coefficients.

### Hermite interpolation

```text
hermite(x-list; y-list; derivative-list; target)
```

uses repeated-node divided differences for first-derivative Hermite data.

The x/y/derivative lists must have equal length.

## Natural cubic splines

```text
spline(x-list; y-list; target)
```

constructs a natural cubic spline:

```text
S''(x_0) = S''(x_n) = 0.
```

The internal second derivatives are solved by a tridiagonal Thomas algorithm.

Nodes must be strictly increasing.

Evaluation outside the supplied node interval uses the nearest end spline segment. This is extrapolation, not a certified interpolation error bound.

## Numerical differentiation

```text
fdiff(f; x; x0; h; method; derivative-order)
```

Supported first-derivative formulas:

- forward difference, formal order 1;
- backward difference, formal order 1;
- central difference, formal order 2;
- five-point central difference, formal order 4.

Supported second-derivative formulas:

- central difference, formal order 2;
- five-point central difference, formal order 4.

U6 evaluates both step (h) and (h/2), then applies Richardson extrapolation using the formal truncation order.

When the symbolic derivative is available, Calc also reports the actual fine-grid error for certification/testing.

The error estimate does not account for every round-off regime; sufficiently tiny (h) can increase floating-point error.

## Quadrature

```text
quad(f; x; a; b; n; method)
```

### Composite Newton–Cotes

Supported methods:

- `midpoint` — formal order 2;
- `trapezoid` — formal order 2;
- `simpson` — formal order 4.

Composite Simpson requires even (n).

U6 evaluates (n) and (2n) panels and uses Richardson extrapolation.

### Composite Gauss–Legendre

Supported:

```text
gauss2
gauss3
gauss4
gauss5
```

The `n` argument is the number of subinterval panels; each panel receives the selected Gauss rule.

A (p)-point Gauss rule uses a formal smooth-function order (2p) for the panel-refinement Richardson estimate.

A single (p)-point Gauss rule integrates polynomials through degree (2p-1) exactly up to floating-point arithmetic.

### Adaptive Simpson

```text
quad(f; x; a; b; n; adaptive)
```

delegates to CalcCalculus' adaptive Simpson implementation.

The `n` field is retained for a uniform command shape and is not used by adaptive Simpson.

Adaptive integration fails explicitly on recursion/evaluation-budget exhaustion or non-finite integrands.

## Iterative linear systems

### Jacobi

```text
jacobi(A; b; x0)
```

### Gauss–Seidel

```text
gaussseidel(A; b; x0)
```

### Conjugate gradient

```text
cg(A; b; x0)
```

Jacobi and Gauss–Seidel require nonzero diagonal entries.

They report:

- solution;
- residual norm;
- relative residual;
- iteration count;
- diagonal-dominance diagnostics.

Strict diagonal dominance is reported as a sufficient convergence clue, not a necessary condition.

CG requires a real symmetric positive-definite matrix, verified before iteration.

CG monitors residuals and fails if positive curvature is lost.

## Linear-system forward/backward error diagnostics

```text
linsysdiag(A; b; x_approx)
```

reports:

- (||Ax-b||_2);
- relative residual;
- normwise backward error

```text
η = ||r||_2 / (||A||_2 ||x||_2 + ||b||_2)
```

- U5 2-norm condition number;
- the standard first-order condition estimate (kappa_2 η).

The (kappa η) quantity is an error bound/estimate only in the regime where the usual perturbation assumptions apply.

## Eigenvalue iteration

### Power iteration

```text
poweriter(A; x0)
```

targets a dominant eigenpair when the iteration has a suitable spectral gap and initial component.

### Shifted inverse iteration

```text
inverseiter(A; x0; shift)
```

solves repeated shifted systems and targets an eigenvalue near the supplied shift.

### Rayleigh quotient iteration

```text
rayleighiter(A; x0)
```

updates the shift using the current Rayleigh quotient.

Every converged eigenpair must satisfy a residual test

```text
||Av - λv||_2
```

before exposure.

Power/inverse/Rayleigh iteration are local iterative algorithms; they do not guarantee convergence for arbitrary matrices and initial vectors.

A symmetric starting vector exactly equidistant between eigenvectors can produce a legitimate Rayleigh-iteration cycle; U6 reports non-convergence rather than inventing an eigenvalue.

## Numerical optimization comparison

```text
optcompare(f; x,y,...; initial)
```

runs U4:

- BFGS;
- Newton;
- gradient descent

from the same initial point and reports objective value, iterations, gradient norm, and second-order classification.

This is a method-comparison tool, not a global optimizer.

## Fixed-step ODE methods

```text
odefixed(rhs; x; y; x0; y0; x1; steps; method)
```

Supported scalar IVP methods:

- Euler, formal order 1;
- Heun, formal order 2;
- explicit midpoint, formal order 2;
- classical RK4, formal order 4.

The same compiled ODE RHS semantics as U3 are used.

## ODE convergence-order diagnostics

```text
odeorder(rhs; x; y; x0; y0; x1; steps; method)
```

runs the selected fixed-step method with:

```text
N, 2N, 4N
```

steps.

It reports:

- observed order from successive differences;
- formal method order;
- Richardson-extrapolated terminal value;
- estimated fine-grid error.

For an exactly solved or nearly round-off-limited problem, observed order may be undefined or unreliable.

## Absolute stability

### Pointwise stability function

```text
absstability(method; Re(z); Im(z))
```

uses (z=hλ) and reports (|R(z)|).

A point is marked stable when

```text
|R(z)| <= 1
```

within a small floating tolerance.

Supported stability functions:

- explicit Euler;
- Heun / RK2;
- explicit midpoint;
- RK4;
- backward Euler;
- implicit midpoint.

This command evaluates the stability polynomial/rational function only. It does not numerically integrate an implicit ODE.

### Negative-real stability interval

```text
stabinterval(method)
```

finds the stable interval on the negative real axis.

Backward Euler and implicit midpoint report ((-infty,0]).

RK4's boundary is approximately

```text
-2.785293563...
```

## Worksheet integration

All U6 commands work in Worksheet Math blocks.

U6 command names are excluded from notebook dependency discovery.

Structured diagnostic metadata is retained with the block result.

## Discoverability

The command palette includes U6 templates for:

- floating-point diagnostics;
- root comparison;
- interpolation;
- finite differences;
- quadrature;
- iterative linear systems;
- eigenvalue iteration;
- ODE convergence order;
- absolute stability.

`numhelp()` returns the compact U6 command list.

## Error semantics

Important U6 errors include:

```text
NUMERICAL_MATHEMATICS_ERROR
NUMERICAL_CONVERGENCE
UNSUPPORTED_NUMERICAL_METHOD
FINITE_REQUIRED
INVALID_STEP
INVALID_GRID
ORDER_UNDEFINED
DUPLICATE_NODE
NODE_ORDER
ZERO_DIAGONAL
SINGULAR_SYSTEM
MATRIX_SHAPE_ERROR
```

A convergence failure means the selected numerical method did not meet its contract under the supplied starting data/budget. It does not mean the mathematical problem has no solution.

## Certification boundary

U6 certification covers:

- IEEE-754 neighbor/ULP checks;
- absolute/relative error and cancellation diagnostics;
- scalar relative conditioning;
- Richardson extrapolation and observed orders;
- fixed-point and four-way root comparisons;
- barycentric/Newton/Hermite interpolation;
- natural cubic splines;
- first/second finite-difference formulas;
- midpoint/trapezoid/Simpson quadrature;
- composite Gauss–Legendre 2–5 point rules;
- adaptive Simpson bridge;
- Jacobi/Gauss–Seidel/CG;
- residual/backward-error diagnostics;
- power/inverse/Rayleigh eigen iteration;
- U4 optimization comparison;
- Euler/Heun/midpoint/RK4 fixed IVPs;
- observed ODE method order;
- explicit/implicit one-step stability functions.

U6 does **not** implement:

- arbitrary-precision floating-point arithmetic;
- interval arithmetic or rigorous rounding-error enclosures;
- automatic symbolic truncation-error proofs;
- arbitrary high-order finite-difference stencil generation;
- adaptive multidimensional quadrature beyond existing U2 domains;
- sparse matrix storage or Krylov methods such as GMRES/MINRES/BiCGSTAB;
- preconditioner construction;
- generalized eigenvalue pencils;
- Arnoldi/Lanczos large-scale eigensolvers;
- stiff BDF/Radau ODE integrators;
- implicit nonlinear ODE step solves;
- PDE discretization;
- automatic global convergence proofs for iterative methods.
