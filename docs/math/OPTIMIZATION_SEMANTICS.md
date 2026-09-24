# Optimization & Mathematical Programming Semantics — Calc v2.3 / Phase U4

Phase U4 extends Calc's University Mathematics Workstation with certified convexity analysis, local nonlinear optimization, bound-constrained optimization, KKT verification, exact linear programming, and convex quadratic programming.

The implementation follows the same conservative rule used by U1–U3:

> Calc distinguishes a proven global optimum, a certified local optimum, a first-order stationary candidate, and an unsupported problem. It does not silently promote numerical convergence into a stronger mathematical claim.

The U4 runtime lives in `optimization.js` and is available from both **Calculate** and **Worksheet** Math blocks.

## Evaluation order

Math input is routed through:

1. `CalcOptimization.runCommand`
2. `CalcODE.runCommand`
3. `CalcMultivariable.runCommand`
4. `CalcCAS.runCommand`
5. `CalcCalculus.runCommand`
6. `CalcAlgebra.runCommand`
7. quantity/unit evaluation
8. core scalar evaluation

U4 is additive. U1–U3 semantics remain unchanged.

## Convexity and Hessian curvature

Syntax:

```text
convexity(f; x,y,...)
convexity(f; x,y,...; x0,y0,...)
```

### Global certificate

Without a point, U4 currently requires a **constant Hessian**, which covers quadratic and affine objectives.

The symmetric Hessian is diagonalized numerically with Calc's certified symmetric Jacobi eigensolver and classified as:

- positive definite → strictly convex;
- positive semidefinite → convex;
- negative definite → strictly concave;
- negative semidefinite → concave;
- zero Hessian → affine/flat, both convex and concave;
- mixed signs → indefinite.

Example:

```text
convexity(x^2+2*y^2; x,y)
→ global quadratic certificate: strictly convex
```

### Pointwise curvature

With an explicit point, Calc evaluates the Hessian only at that point.

Example:

```text
convexity(x^4+y^2; x,y; 0,0)
→ pointwise curvature: positive semidefinite Hessian at point
```

A Hessian at a single point is **not** presented as proof that the function is convex in a neighborhood or globally.

For nonconstant Hessians, global convexity analysis is intentionally unsupported unless a stronger proof system is implemented in a future phase.

## Bounded one-dimensional optimization

Syntax:

```text
goldenmin(f; x; a,b)
goldenmax(f; x; a,b)
```

U4 uses golden-section interval reduction.

The supplied interval must be finite with (b>a).

The command reports the best point found in the shrinking interval. Golden-section search is a numerical interval method; Calc does **not** infer that a multimodal function has been globally optimized merely because the interval search converged.

## Unconstrained nonlinear optimization

Syntax:

```text
optmin(f; x,y,...; initial; method)
optmax(f; x,y,...; initial; method)
```

Supported methods:

```text
bfgs
newton
gradient
```

### BFGS

The default method is BFGS with:

- inverse-Hessian approximation;
- descent-direction validation;
- automatic reset to steepest descent if the BFGS direction loses descent;
- Armijo backtracking;
- curvature-condition checks before updating the inverse Hessian approximation.

### Newton

Newton optimization uses the exact symbolic Hessian evaluated numerically at each iterate.

If the Hessian solve is singular or the raw Newton step is not a descent direction, U4 falls back to steepest descent for that iteration.

### Gradient descent

The gradient method uses steepest descent with Armijo backtracking.

### Convergence semantics

A small gradient is only a first-order condition.

Once a solver reaches first-order convergence, U4 also inspects the Hessian of the **transformed minimization objective**.

For minimization:

- positive definite Hessian → strict local minimum certificate;
- positive semidefinite Hessian → stationary candidate; second-order test may be inconclusive;
- negative-curvature direction → `WRONG_STATIONARY_POINT`.

For maximization, the same check is applied after minimizing (-f).

Example:

```text
optmin((1-x)^2+100*(y-x^2)^2; x,y; -1.2,1; bfgs)
```

A saddle such as

```text
optmin(x^2-y^2; x,y; 0,0; newton)
```

is rejected even though its gradient is exactly zero.

When the Hessian is constant and positive definite, U4 can additionally identify the result as a global strict optimum of the quadratic objective.

## Bound-constrained optimization

Syntax:

```text
boxmin(f; x,y,...; lower bounds; upper bounds; initial)
boxmax(f; x,y,...; lower bounds; upper bounds; initial)
```

U4 uses projected-gradient descent on a rectangular box.

Every trial step is projected into the feasible box.

Convergence uses the projected-gradient mapping

```text
P_[l,u](x - grad f(x)) - x
```

rather than the unconstrained gradient alone.

Example:

```text
boxmin((x-3)^2+(y+1)^2; x,y; 0,-2; 2,2; 1,0)
→ x = 2, y = -1
```

This is a first-order KKT candidate for the box constraints. U4 does not automatically claim global optimality for arbitrary nonconvex box objectives.

## KKT verification

Syntax:

```text
kktcheck(
  f;
  variables;
  equality residuals or -;
  inequality residuals or -;
  point;
  equality multipliers or -;
  inequality multipliers or -
)
```

Equality residuals are interpreted as

```text
g_i(x) = 0
```

and inequality residuals as

```text
h_j(x) <= 0.
```

For minimization, the Lagrangian is

```text
L = f + Σ lambda_i g_i + Σ mu_j h_j
```

with `mu_j >= 0`.

U4 independently checks:

- stationarity;
- equality feasibility;
- inequality feasibility;
- dual feasibility;
- complementary slackness.

Example:

```text
kktcheck(
  x^2+y^2;
  x,y;
  x+y-1;
  -x,-y;
  0.5,0.5;
  -1;
  0,0
)
```

KKT satisfaction is a condition certificate. It is not, by itself, a global-optimum certificate for a nonconvex problem.

For a convex differentiable problem satisfying the usual constraint qualifications, the user may combine KKT satisfaction with the convexity structure in the standard way.

## Linear programming

Syntax:

```text
lpmax(c1,c2,...; row1|row2|...; b1,b2,...)
lpmin(c1,c2,...; row1|row2|...; b1,b2,...)
```

The certified standard form is:

```text
maximize/minimize c^T x
subject to A x <= b
           x >= 0
```

### Exact arithmetic

The simplex tableau uses Calc's exact Rational arithmetic whenever the inputs are exact.

### Feasible-start boundary

U4 currently requires

```text
b >= 0
```

componentwise, so the origin is a known primal feasible starting point.

A general Phase-I artificial-variable procedure is not implemented in U4.

Negative-RHS standard-form problems therefore return `UNSUPPORTED_OPTIMIZATION` rather than being transformed heuristically.

### Pivoting and termination

The primal simplex uses Bland-style entering and tie-breaking rules to reduce cycling risk.

U4 distinguishes:

- finite optimum;
- exact unbounded improving direction;
- iteration-budget failure.

### Primal–dual certificate

For `lpmax`, the final tableau is checked against the dual

```text
minimize b^T y
subject to A^T y >= c
           y >= 0.
```

Before exposing the result, Calc verifies:

- primal feasibility;
- primal nonnegativity;
- nonnegative reduced costs at the final tableau;
- dual nonnegativity;
- dual feasibility;
- equality of primal and dual objective values.

Example:

```text
lpmax(3,2; 1,1|1,0|0,1; 4,2,3)
→ x = [2, 2]; objective = 10
```

For `lpmin`, U4 certifies the transformed maximization problem for (-c) and then restores the original objective sign.

## Convex quadratic programming

Syntax:

```text
quadprog(f; variables; equality residuals or -; inequality residuals or -)
```

U4 currently supports:

- quadratic objectives with constant Hessian;
- convex objectives only;
- linear equality constraints;
- linear inequality residuals (h(x)<=0);
- at most 10 inequality constraints.

### Active-set enumeration

For each candidate active inequality set, U4 constructs the exact KKT linear system:

```text
grad f + A_eq^T lambda + A_active^T mu = 0
g(x) = 0
h_active(x) = 0
```

The system is solved through Calc's exact symbolic linear-system kernel.

Candidates are accepted only when they satisfy:

- equality feasibility;
- all inequality constraints;
- nonnegative active inequality multipliers;
- a complete KKT re-check.

Because the objective is convex and the constraints are affine, a certified KKT point is a global optimum of the supported QP.

Example:

```text
quadprog(x^2+y^2; x,y; x+y-1; -x,-y)
→ x = 0.5, y = 0.5
```

For a strictly convex quadratic objective, the primal optimum is unique.

### Degeneracy boundary

The exact active-set solver currently requires a unique KKT linear-system solution for a candidate active set.

Highly degenerate QPs with nonunique multipliers or redundant active constraints may therefore return `INFEASIBLE_PROBLEM` / unsupported-style failure even when a mathematical solution exists.

The error text explicitly avoids claiming mathematical infeasibility when the certified active-set solver cannot resolve degeneracy.

## Worksheet integration

All U4 commands are available in Worksheet Math blocks.

Command names are excluded from notebook dependency-name discovery.

Optimization results that expose a scalar objective can become scalar `ans`; structured certificate objects remain metadata/serialized result state rather than being injected as scalar variables.

## Discoverability

The command palette includes U4 entry points for:

- convexity;
- nonlinear local optimization;
- box-constrained optimization;
- KKT verification;
- linear programming;
- quadratic programming.

`opthelp()` returns the compact U4 command list.

## Error semantics

Important U4 errors include:

```text
OPTIMIZATION_ERROR
UNSUPPORTED_OPTIMIZATION
OPTIMIZATION_CONVERGENCE
UNBOUNDED_PROBLEM
INFEASIBLE_PROBLEM
WRONG_STATIONARY_POINT
LP_CERTIFICATE_FAILED
SINGULAR_SYSTEM
NON_FINITE_OBJECTIVE
```

An unsupported result means that the certified U4 implementation does not cover the requested formulation. It does not mean the mathematical optimization problem has no solution.

## Certification boundary

U4 is covered by:

- `tests/optimization.js`;
- U1–U3 regression suites;
- Worksheet integration tests;
- browser-level Calculate regression coverage;
- primary CI;
- static release gates;
- Chromium / Firefox / WebKit / mobile Chromium production soak.

Certification includes:

- global constant-Hessian convexity/concavity;
- pointwise Hessian curvature;
- affine zero-Hessian classification;
- golden-section minimization/maximization;
- BFGS on Rosenbrock;
- Newton optimization;
- gradient descent;
- saddle rejection;
- projected box optimization;
- KKT residual verification;
- exact rational simplex pivots;
- primal–dual LP certificates;
- unbounded LP detection;
- convex equality- and inequality-constrained QPs;
- active inequality multipliers;
- QP KKT re-verification;
- nonconvex QP rejection.

U4 does **not** implement:

- a universal global nonlinear optimizer;
- interval branch-and-bound;
- mixed-integer or integer programming;
- general Phase-I/Phase-II simplex with arbitrary initial infeasibility;
- interior-point LP/QP/NLP methods;
- general nonlinear equality/inequality constrained optimization;
- sequential quadratic programming;
- trust-region methods;
- automatic constraint-qualification proofs;
- symbolic convexity proofs for arbitrary nonconstant Hessians;
- semidefinite programming;
- second-order cone programming;
- stochastic optimization;
- automatic differentiation beyond the existing symbolic derivative engine.
