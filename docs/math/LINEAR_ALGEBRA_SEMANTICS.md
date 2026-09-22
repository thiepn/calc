# Linear Algebra V2 Semantics

This document defines the certified linear-algebra behavior introduced in Implementation Phase 5.

## Architecture

Linear algebra lives in `linear-algebra.js` and consumes the Phase 1 scalar kernel plus the Phase 2 symbolic layer.

Primary objects:

- `Matrix`
- `Vector`
- `Basis`
- `LinearTransformation`

The Matrix workspace now uses these objects directly instead of the older nested-array helper functions in `math.js`.

## Scalar domains

A Matrix/Vector records the strongest scalar domain required by its entries:

```text
Integer
→ Rational
→ Real
→ Complex
→ Symbolic
```

Exact Rational/Complex operations stay exact whenever the underlying operation supports exact arithmetic.

Numerical decomposition routines require finite real numeric entries unless otherwise documented.

Symbolic matrices are supported for structural operations such as trace, determinant, RREF and rank when pivots are structurally decidable.

## Canonical Matrix

`Matrix` provides:

- immutable shape;
- row/column access;
- addition/subtraction;
- scalar multiplication;
- matrix multiplication;
- matrix-vector multiplication;
- integer powers;
- transpose;
- conjugate transpose;
- trace;
- determinant;
- inverse;
- RREF;
- rank/nullity;
- serialization.

No UI component computes matrix mathematics independently.

## Vector

`Vector` provides:

- addition/subtraction;
- scalar multiplication;
- Hermitian inner product;
- Euclidean norm;
- normalization;
- distance;
- angle;
- 3D cross product;
- outer product.

The complex inner-product convention is:

```text
<u,v> = sum(conj(u_i) * v_i)
```

## Determinant

Exact/symbolic determinant uses elimination rather than cofactor expansion.

Numerical pivot choice uses magnitude.

Symbolic pivot choice selects the first structurally nonzero candidate instead of treating non-numeric expressions as zero.

## RREF and provenance

RREF returns:

- canonical reduced matrix;
- pivot-column indices;
- row-operation provenance.

Recorded operation types include:

- row swap;
- row scaling;
- row addition.

Exact Rational matrices retain exact pivots and entries.

## Rank and nullity

Exact/symbolic rank uses RREF.

Numerical rank is derived from the certified SVD threshold.

Nullity follows:

```text
nullity(A) = number of columns - rank(A)
```

## Subspaces and bases

Certified helpers include:

- null space;
- column space;
- row space;
- orthogonal complement;
- span membership;
- basis coordinates;
- change of basis.

The column-space basis uses pivot columns from the **original matrix**, not columns from RREF.

`Basis` explicitly stores the ambient dimension and can test independence.

## Linear systems

`solveLinearSystem(A,b)` classifies systems as:

- `unique`
- `infinite`
- `inconsistent`

For a consistent system it returns:

- a particular solution;
- null-space basis;
- free-variable indices;
- rank metadata.

This expresses the general solution structurally as:

```text
x = particular + Null(A)
```

rather than inventing arbitrary values for free variables.

## Projections

Projection onto a basis uses a numerically orthonormalized basis.

`projectionMatrix(basis)` returns:

```text
P = Q Q*
```

and is certified against:

```text
P^2 ≈ P
P* ≈ P
```

for supported numeric inputs.

## Gram-Schmidt

Phase 5 exposes modified Gram-Schmidt for numerical vectors.

The production QR decomposition does **not** use classical Gram-Schmidt.

Householder QR is the certified production decomposition.

## LU

Numerical LU uses partial pivoting:

```text
P A = L U
```

Results include a reconstruction residual.

A zero/unsafe pivot raises `SINGULAR_MATRIX`.

## QR

Production QR uses Householder reflections.

The result records:

- Q;
- R;
- reconstruction residual;
- orthogonality residual.

Certification requires:

```text
Q R ≈ A
Q^T Q ≈ I
```

for the supported real path.

## Cholesky

Cholesky is certified for real symmetric positive-definite matrices.

It returns:

```text
A = L L^T
```

Invalid symmetry/positive-definiteness returns `NOT_POSITIVE_DEFINITE`.

## Symmetric eigendecomposition

General numerical eigenanalysis is intentionally restricted to real symmetric matrices in Phase 5.

The certified numerical solver uses Jacobi rotations and returns:

- sorted eigenvalues;
- orthonormal eigenvector matrix;
- reconstruction/eigen residual;
- iteration count.

General non-symmetric floating-point eigenanalysis is not claimed yet.

## Characteristic polynomial

Exact characteristic polynomials use a Faddeev-LeVerrier style recurrence over the exact scalar path.

For exact Rational matrices the result is a Phase 2 `Polynomial`.

Cayley-Hamilton is independently checked through matrix substitution.

## Exact eigenanalysis

Exact matrices use the characteristic polynomial plus the certified Phase 2 equation solver.

For each supported eigenvalue Calc records:

- eigenvalue expression;
- scalar value where evaluable;
- eigenspace;
- algebraic multiplicity where exactly derivable;
- geometric multiplicity.

Exact diagonalizability is determined from the total dimension of certified eigenspaces.

## Diagonalization

For certified exact eigenbases:

```text
A P = P D
```

For real symmetric numerical matrices, diagonalization uses the orthogonal eigenvector matrix returned by the Jacobi solver.

Every result carries a reconstruction residual.

## Minimal polynomial

The exact minimal polynomial is found by searching the first exact linear dependence among:

```text
I, A, A^2, ...
```

after vectorizing matrix powers.

The resulting polynomial is normalized to monic form.

This path currently requires an exact square matrix.

## Jordan form

Jordan form is deliberately restricted.

Certified cases:

- diagonalizable exact matrices, where Jordan form is simply the diagonal form;
- non-diagonalizable exact 2x2 matrices with a single size-2 Jordan block.

The non-diagonal 2x2 path explicitly constructs a generalized eigenvector satisfying:

```text
(A - lambda I) v2 = v1
```

and verifies:

```text
A P = P J
```

General numerical Jordan form is **not implemented**.

General larger non-diagonal exact Jordan structures remain unsupported.

## SVD

Phase 5 SVD is certified for finite real matrices.

Implementation:

1. form `A^T A`;
2. solve its symmetric eigendecomposition;
3. singular values are square roots of nonnegative eigenvalues;
4. nonzero right singular vectors form V;
5. left singular vectors are computed as `A v_i / sigma_i`.

The implementation returns a thin SVD over singular values above the rank threshold.

Certification requires:

```text
A ≈ U S V^T
```

with an explicit reconstruction residual.

## Pseudoinverse

The Moore-Penrose pseudoinverse uses the SVD:

```text
A+ = V S+ U^T
```

Certification checks the identities:

```text
A A+ A ≈ A
A+ A A+ ≈ A+
```

and reports both residuals.

## Least squares

Least-squares solving uses the SVD pseudoinverse, not the normal-equation inverse.

Returned metadata includes:

- solution;
- residual vector;
- residual norm;
- rank;
- method.

This is the linear-algebra backend intended for later Statistics regression work.

## Condition number

The 2-norm condition estimate is:

```text
sigma_max / sigma_min
```

from the certified SVD.

Rank-deficient matrices return infinite condition number.

## Structural predicates

Implemented predicates include:

- symmetric;
- Hermitian;
- orthogonal;
- unitary;
- positive definite.

Complex Hermitian structure uses conjugate transpose semantics.

General complex numerical decompositions beyond exact operations are not claimed.

## Linear transformations

`LinearTransformation` wraps a Matrix and provides:

- application;
- kernel;
- image;
- rank;
- nullity;
- injectivity;
- surjectivity;
- composition.

## Matrix workspace

The production Matrix workspace now exposes:

- determinant;
- trace;
- RREF;
- inverse;
- transpose;
- rank/nullity;
- null/column/row spaces;
- LU;
- QR;
- Cholesky;
- SVD;
- pseudoinverse;
- eigenanalysis;
- diagonalization;
- characteristic polynomial;
- minimal polynomial;
- Jordan form.

The result panel renders decomposition matrices and residual diagnostics.

## Matrix input

Matrix cells continue to use the shared scalar parser.

Supported cell values include:

- integers;
- exact fractions;
- finite decimal/scientific values;
- complex values;
- supported symbolic expressions.

The grid supports:

- keyboard arrow navigation;
- Enter-to-next-row behavior;
- multi-cell TSV paste;
- multi-cell CSV paste.

## Serialization

Matrix/Vector serialization tags each scalar as either:

- numeric Phase 1 value;
- Phase 2 symbolic expression.

Exact Rational/Complex values therefore survive JSON round-trips without precision loss.

## Numerical tolerances

Phase 5 centralizes:

- absolute tolerance;
- relative tolerance;
- rank tolerance;
- iteration cap

in `DEFAULT_NUMERICAL`.

Numerical rank/decomposition decisions do not use literal equality to zero.

## Typed errors

Phase 5 adds stable error categories including:

- `LINEAR_ALGEBRA_ERROR`
- `MATRIX_SHAPE_ERROR`
- `SINGULAR_MATRIX`
- `NUMERICAL_STABILITY_ERROR`
- `UNSUPPORTED_LINEAR_ALGEBRA`
- `NOT_POSITIVE_DEFINITE`

## Deliberate Phase 5 limitations

Not yet certified:

- general floating non-symmetric eigendecomposition;
- general complex numerical SVD/QR/LU;
- arbitrary-size exact Jordan decomposition;
- numerical Jordan form;
- full canonical generalized-eigenvector chains for larger blocks;
- sparse-matrix storage/algorithms;
- iterative large-scale Krylov eigensolvers;
- symbolic SVD/QR/decompositions.

Unsupported cases return explicit errors instead of silently switching to unstable algorithms.
