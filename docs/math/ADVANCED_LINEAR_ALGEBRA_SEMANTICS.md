# Advanced Linear Algebra Semantics — Calc v2.4 / Phase U5

Phase U5 extends Calc's University Mathematics Workstation with higher-level canonical-form, spectral, matrix-function, inner-product, SVD-application, and conditioning workflows.

The implementation follows the same certification rule as U1–U4:

> Exact structure is exposed only when Calc can construct and verify it exactly. Numerical decompositions are exposed only after residual/orthogonality/definiteness checks. Unsupported cases fail explicitly instead of being presented as universal algorithms.

The U5 runtime lives in `advanced-linear-algebra.js` and is available from:

- **Calculate** commands;
- **Worksheet** Math blocks;
- selected **Worksheet Matrix** operations;
- the interactive **Matrix** workspace.

## Evaluation order

Math input is routed through:

1. `CalcAdvancedLinearAlgebra.runCommand`
2. `CalcOptimization.runCommand`
3. `CalcODE.runCommand`
4. `CalcMultivariable.runCommand`
5. `CalcCAS.runCommand`
6. `CalcCalculus.runCommand`
7. `CalcAlgebra.runCommand`
8. unit/quantity evaluation
9. core scalar evaluation

U5 is additive. Existing Linear Algebra V2 remains the low-level Matrix/Vector kernel.

## Matrix syntax for U5 commands

Rows are separated with `|` and entries with commas.

Example:

```text
spectral(2,1|1,2)
```

represents

```text
[[2,1],
 [1,2]]
```

Multiple matrices or extra parameters use semicolon separators.

## Jordan chains and Jordan form V2

### jordanv2

Syntax:

```text
jordanv2(matrix)
```

U5 extends the old Jordan implementation beyond the previous non-diagonal 2×2 boundary.

The certified U5 algorithm currently requires:

- an exact square matrix;
- dimension at most 6;
- every eigenvalue to be certified by Calc's exact eigenvalue solver.

For each eigenvalue (lambda), Calc computes the nullities

```text
dim ker(A-λI)^k
```

and derives the Jordan block-size profile from the growth of these generalized eigenspaces.

It then constructs generalized eigenvector chains

```text
(A-λI)v_1 = 0
(A-λI)v_2 = v_1
...
(A-λI)v_k = v_{k-1}
```

and assembles (P) and (J).

Before exposure Calc verifies

```text
A P = P J
```

and verifies that the chain vectors form a full basis.

Examples:

```text
jordanv2(2,1,0|0,2,1|0,0,2)
jordanchains(2,1,0|0,2,1|0,0,2)
```

U5 handles multiple blocks for one eigenvalue and exact complex eigenvalues when the base eigenvalue solver certifies them.

It does not claim a Jordan form when exact eigenvalue certification is incomplete.

## Real Schur decomposition

Syntax:

```text
schur(matrix)
```

U5 computes a **real Schur decomposition**

```text
A Q = Q T
```

where:

- (Q) is orthogonal;
- (T) is real quasi-upper-triangular;
- real eigenvalues appear in 1×1 blocks;
- conjugate complex pairs may remain in real 2×2 blocks.

The numerical algorithm uses:

1. Householder reduction to upper Hessenberg form;
2. shifted QR similarity iterations;
3. deflation of numerically negligible subdiagonal entries.

A result is exposed only if Calc certifies:

- quasi-upper-triangular structure;
- a small normalized (AQ-QT) residual;
- a small (Q^TQ-I) residual.

Failure to meet the iteration/residual contract returns `SCHUR_CONVERGENCE`.

The U5 Schur implementation is real-valued. A general complex Schur iteration is not implemented.

## Spectral theorem

Syntax:

```text
spectral(real symmetric matrix)
```

For real symmetric matrices, U5 uses Calc's Jacobi symmetric eigensolver to construct

```text
A Q = Q D
Q^T Q = I
```

with real diagonal (D).

U5 also constructs the one-dimensional spectral projectors

```text
P_i = q_i q_i^T
```

and certifies the decomposition residual and orthogonality.

This workflow is explicitly the **real symmetric spectral theorem**. General normal complex matrices are not yet handled by the spectral-decomposition command.

## Spectral matrix functions

Syntax:

```text
matrixfunc(A; exp)
matrixfunc(A; sqrt)
matrixfunc(A; log)
matrixfunc(A; sin)
matrixfunc(A; cos)
matrixfunc(A; abs)
matrixfunc(A; sign)
matrixfunc(A; invsqrt)
matrixfunc(A; pow; p)
```

U5 applies functional calculus to real symmetric matrices:

```text
A = Q D Q^T
f(A) = Q f(D) Q^T
```

Supported functions are:

- exponential;
- sine;
- cosine;
- absolute value;
- sign;
- positive-semidefinite square root;
- positive-definite logarithm;
- positive-definite inverse square root;
- real powers with the expected real-spectrum domain restrictions.

Examples:

```text
matrixfunc(4,0|0,9; sqrt)
matrixfunc(2,1|1,2; exp)
matrixfunc(4,0|0,9; pow; 0.5)
```

Domain checks are explicit:

- `sqrt` requires no materially negative eigenvalue;
- `log` and `invsqrt` require strictly positive eigenvalues;
- fractional real powers of negative eigenvalues are rejected.

Certification includes symmetry, commutator checks, and function-specific identities where useful:

```text
sqrt(A)^2 ≈ A
A^(-1/2) A A^(-1/2) ≈ I
```

U5 does not implement a universal matrix-function algorithm for arbitrary nonsymmetric matrices.

## Gram matrices and complex inner-product spaces

### Gram matrix

Syntax:

```text
gram(matrix)
```

Treating the matrix columns as vectors, U5 returns

```text
G = A* A
```

where (*) is the conjugate transpose.

This works with exact-capable complex entries supported by the Calc kernel.

### Complex modified Gram–Schmidt

Syntax:

```text
orthonormalize(matrix)
```

U5 performs modified Gram–Schmidt using the complex inner product

```text
<u,v> = u* v
```

and returns an orthonormal basis for the column space.

Dependent columns are omitted from (Q).

Before exposure Calc checks:

```text
Q* Q ≈ I
Q R ≈ A
```

This U5 path fixes the real-only limitation of the older numerical Gram–Schmidt helper for advanced complex-space workflows.

## Orthogonal projections

Syntax:

```text
projector(matrix)
project(matrix; vector)
```

The matrix columns define a subspace.

U5 orthonormalizes the column space and constructs

```text
P = Q Q*
```

It certifies:

```text
P^2 ≈ P
P* ≈ P
```

The projector therefore remains valid for dependent spanning columns and complex inner-product spaces.

## Bilinear, sesquilinear, and quadratic forms

### Real bilinear form

```text
bilinear(A; u; v)
```

computes

```text
u^T A v
```

and currently requires real vectors/results.

### Complex sesquilinear form

```text
sesquilinear(A; u; v)
```

computes

```text
u* A v
```

### Quadratic/Hermitian form value

```text
quadratic(A; x)
```

uses

```text
x* A x
```

so for real inputs this is the ordinary quadratic form and for complex inputs it follows the standard Hermitian-space convention.

The value command itself does not require (A) to be symmetric/Hermitian; definiteness and inertia commands do.

## Inertia, signature, and Sylvester canonical form

### Inertia

Syntax:

```text
inertia(real symmetric matrix)
```

Using the real symmetric spectral theorem, U5 counts:

```text
positive eigenvalues
negative eigenvalues
zero eigenvalues
```

and returns:

- inertia ((n_+,n_-,n_0));
- rank (n_++n_-);
- signature (n_+-n_-);
- definiteness classification.

### Congruence canonical form

Syntax:

```text
congruence(real symmetric matrix)
```

U5 constructs a nonsingular scaling (S) such that numerically

```text
S^T A S = diag(+1,...,+1,-1,...,-1,0,...,0).
```

This is the Sylvester-law-of-inertia sign canonical form.

Calc verifies the congruence reconstruction residual before exposure.

## Truncated SVD and Eckart–Young applications

Syntax:

```text
lowrank(A; k)
```

U5 forms the truncated SVD approximation

```text
A_k = U_k Σ_k V_k^T
```

and reports:

- retained rank;
- singular values;
- predicted Frobenius error;
- predicted spectral-norm error.

The Frobenius error is cross-checked against the actual residual.

Example:

```text
lowrank(3,0|0,2|0,0; 1)
```

This is the certified finite-dimensional Eckart–Young workflow.

## Moore–Penrose pseudoinverse diagnostics

Syntax:

```text
pinvdiag(A)
```

U5 uses the existing SVD pseudoinverse and explicitly checks all four Penrose identities:

```text
A A+ A = A
A+ A A+ = A+
(A A+ )^T = A A+
(A+ A)^T = A+ A
```

It also reports:

- numerical rank;
- singular values;
- 2-norm condition number.

Rank-deficient matrices correctly report infinite condition number.

## Least squares V2

Syntax:

```text
lstsqv2(A; b)
```

The solution is the SVD-backed minimum-norm least-squares solution.

U5 reports and checks:

- (||Ax-b||);
- the normal-equation residual (||A^T(Ax-b)||);
- orthogonality of the solution to the null space when a nontrivial null space exists;
- numerical rank.

This distinguishes "a least-squares solution" from the Moore–Penrose minimum-norm solution.

## Conditioning report

Syntax:

```text
condreport(A)
```

U5 reports:

- numerical rank;
- singular values;
- 2-norm condition number;
- reciprocal condition number;
- SVD rank threshold;
- qualitative conditioning band.

The qualitative labels are diagnostic, not mathematical discontinuities.

Rank-deficient matrices report infinite 2-norm condition number.

## Similarity and change of basis

### Similarity transform

Syntax:

```text
similarity(A; P)
```

computes

```text
B = P^(-1) A P
```

and verifies

```text
A P = P B.
```

### Basis transition

Syntax:

```text
basischange(B_from; B_to)
```

where each matrix stores basis vectors as columns.

The returned matrix (C) satisfies

```text
B_to C = B_from.
```

Both column sets must be actual bases.

## Matrix workspace integration

U5 adds first-class Matrix-workspace operations:

- Jordan V2;
- Schur;
- Spectral;
- Inertia;
- Projector;
- Condition.

The original Linear Algebra V2 buttons remain unchanged.

Worksheet Matrix blocks can use the same advanced operation names.

## Discoverability

The command palette contains U5 entries for:

- Jordan V2;
- real Schur decomposition;
- spectral theorem;
- spectral matrix functions;
- inertia/signature;
- truncated SVD;
- conditioning.

`u5help()` returns the compact U5 command list.

## Error semantics

Important U5 errors include:

```text
ADVANCED_LINEAR_ALGEBRA_ERROR
UNSUPPORTED_ADVANCED_LINEAR_ALGEBRA
SCHUR_CONVERGENCE
JORDAN_CERTIFICATE_FAILED
SPECTRAL_CERTIFICATE_FAILED
MATRIX_FUNCTION_DOMAIN
MATRIX_FUNCTION_CERTIFICATE_FAILED
ORTHONORMALIZATION_CERTIFICATE_FAILED
PROJECTOR_CERTIFICATE_FAILED
CONGRUENCE_CERTIFICATE_FAILED
LOW_RANK_CERTIFICATE_FAILED
SIMILARITY_CERTIFICATE_FAILED
BASIS_CHANGE_CERTIFICATE_FAILED
```

An unsupported result means the certified U5 implementation does not cover that form. It does not mean the mathematical object does not exist.

## Certification boundary

U5 is covered by:

- `tests/advanced-linear-algebra.js`;
- existing Linear Algebra V2 certification;
- U1–U4 regression suites;
- Worksheet Math and Matrix-block integration;
- browser-level Calculate and Matrix-workspace regression coverage;
- primary CI;
- static release gates;
- Chromium / Firefox / WebKit / mobile Chromium production soak.

Certification includes:

- exact 3×3–5×5 nontrivial Jordan-chain examples;
- multiple Jordan blocks for one eigenvalue;
- exact complex eigenvalue Jordan decomposition;
- dense real Schur examples;
- real 2×2 Schur blocks for complex-conjugate eigenvalues;
- spectral projectors;
- square root/logarithm/inverse-square-root matrix functions;
- complex Gram matrices and orthonormalization;
- projector idempotence/Hermitian checks;
- bilinear/sesquilinear/quadratic forms;
- inertia/signature and congruence canonical form;
- truncated SVD error identities;
- all four Moore–Penrose equations;
- minimum-norm least squares;
- condition-number diagnostics;
- similarity and basis-transition verification.

U5 does **not** implement:

- a universal symbolic Jordan algorithm when the base exact eigenvalue solver cannot certify every eigenvalue;
- Jordan matrices above the current exact size bound;
- general complex Schur iteration;
- spectral theorem workflows for arbitrary complex normal matrices;
- arbitrary nonsymmetric matrix functions;
- matrix logarithm branch selection for general matrices;
- symbolic SVD;
- generalized eigenvalue pencils (Av=λBv);
- rational canonical form / Frobenius companion canonical form;
- Smith normal form;
- tensor products or multilinear tensor algebra;
- infinite-dimensional functional analysis.
