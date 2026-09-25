# Calc v2.4.0

Calc v2.4.0 adds **Phase U5 — Advanced Linear Algebra** to the University Mathematics Workstation.

## Canonical forms

- Added Jordan V2 for exact matrices up to size 6 when all eigenvalues are certified by the exact solver.
- Added generalized-eigenvector chain construction from nullity growth of `(A-λI)^k`.
- Added multiple-block Jordan reconstruction and exact `AP=PJ` verification.
- Added exact complex-eigenvalue Jordan workflows.
- Added real Schur decomposition using Householder Hessenberg reduction plus shifted QR iteration.
- Schur results require orthogonality, reconstruction, and quasi-upper-triangular certification.

## Spectral theorem & matrix functions

- Added real-symmetric spectral decompositions with orthonormal eigenvectors and spectral projectors.
- Added spectral matrix functions: `exp`, `sqrt`, `log`, `sin`, `cos`, `abs`, `sign`, `invsqrt`, and real powers.
- Added explicit domain checks for square roots, logarithms, inverse square roots, and fractional powers.
- Added function-specific verification such as `sqrt(A)^2≈A` and whitening by `A^(-1/2)`.

## Inner-product spaces & forms

- Added Gram matrices with conjugate-transpose semantics.
- Added complex modified Gram–Schmidt with `Q*Q≈I` and `QR≈A` certification.
- Added orthogonal/Hermitian projectors onto column spaces.
- Added real bilinear, complex sesquilinear, and quadratic/Hermitian form evaluation.
- Added inertia, signature, definiteness classification, and Sylvester congruence canonical forms.

## SVD applications & numerical stability

- Added truncated-SVD low-rank approximation with Eckart–Young error reporting.
- Added pseudoinverse diagnostics checking all four Moore–Penrose equations.
- Added least-squares V2 with minimum-norm and normal-equation diagnostics.
- Added 2-norm condition reports from singular values.

## Basis and similarity workflows

- Added verified similarity transforms `P^-1 A P`.
- Added basis-transition matrices from column-basis matrices with reconstruction checks.

## Integration

- U5 commands are available in Calculate and Worksheet Math blocks.
- Added Matrix-workspace buttons for Jordan V2, Schur, Spectral, Inertia, Projector, and Condition.
- Worksheet Matrix blocks can use the same advanced operations.
- Added command-palette entries and `u5help()`.
- Added the U5 runtime to the offline PWA shell.

## Certification

v2.4.0 adds a dedicated U5 deterministic suite, advanced Matrix-block regression coverage, browser-level Calculate + Matrix-workspace coverage, primary-CI enforcement, release-gate assertions, and the full Chromium / Firefox / WebKit / mobile Chromium production soak.

U5 deliberately does not claim universal symbolic Jordan forms, general complex Schur iteration, arbitrary nonsymmetric matrix functions, symbolic SVD, generalized eigenvalue pencils, rational canonical forms, or Smith normal form.
