# Calc v2.2.0

Calc v2.2.0 adds **Phase U3 — Differential Equations & Dynamical Systems** to the University Mathematics Workstation.

## Symbolic ODEs

- Added certified separable ODE relations.
- Added exact differential equations through the verified conservative-potential engine.
- Added integrating-factor solutions for first-order linear ODEs.
- Added Bernoulli transformations.
- Added all three characteristic-root families for homogeneous second-order constant-coefficient ODEs.
- Symbolic solution families are differentiated/substituted back into their defining equations before exposure where applicable.

## Initial-value problems

- Added adaptive Dormand–Prince RK45 integration for scalar ODEs and arbitrary finite systems.
- Added second-order IVPs through first-order state reduction, including damped/forced oscillator problems.
- Added deterministic fixed-step RK4 for coursework and numerical comparison.
- Added forward and backward integration.
- Added explicit step/evaluation budgets, rejected-step tracking, singularity detection, and convergence-failure semantics.

## Dynamical systems

- Added sampled trajectories and direction-field data.
- Added 2D phase-portrait field + trajectory data.
- Added equilibrium solving through existing certified system solvers.
- Added exact Jacobian linearization.
- Added node, spiral, saddle, repeated-node, center, and non-hyperbolic classification.
- Hyperbolic equilibria receive the appropriate local stability conclusion; zero-real-part cases remain explicitly nonlinear-inconclusive.

## Linear systems

- Added verified exact 2×2 matrix exponentials across real, complex, and repeated/Jordan spectral branches.
- Added exact 2D linear flows `exp(At)x0`.

## Laplace & series methods

- Added table-driven forward Laplace transforms.
- Added inverse transforms for certified rational degree-1/2 families.
- Added causal convolution evaluation.
- Added ODE Taylor-series IVPs through repeated total differentiation along the flow.

## Integration

- U3 commands are available in Calculate and Worksheet Math blocks.
- Added command-palette entries for linear ODEs, second-order ODEs, IVPs, forced oscillators, stability, phase portraits, Laplace transforms, and matrix exponentials.
- Added `odehelp()`.
- Added the U3 runtime to the offline PWA shell.
- Non-scalar U3 results no longer overwrite the calculator's scalar `ans` variable.

## Certification

v2.2.0 adds a dedicated U3 deterministic suite, Worksheet regression coverage, browser-level Calculate coverage, primary-CI enforcement, release-gate assertions, and the full Chromium / Firefox / WebKit / mobile Chromium production soak.

Unsupported symbolic families, stiff-solver problems, arbitrary higher-dimensional symbolic matrix exponentials, BVPs, DAEs, PDEs, and non-hyperbolic nonlinear stability proofs remain explicit unsupported cases.
