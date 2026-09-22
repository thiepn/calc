# Implementation Phase 6 — Probability, Statistics & Data V2

Status: **implemented**

## Delivered

### Dataset architecture

Added:

- Dataset
- DataColumn
- explicit Missing sentinel
- stable row IDs
- complete-case selection
- row-safe sorting
- JSON round-trip
- CSV/TSV/semicolon/whitespace parsing
- quoted fields/newlines
- German decimal-comma handling

### Descriptive statistics

Implemented:

- Kahan sum
- Welford mean/variance
- exact Rational mean when possible
- sample/population variance/SD
- R7 median/quantiles
- quartiles/IQR
- weighted mean
- FrequencyTable semantics

### Correlation

Implemented:

- sample covariance
- Pearson
- Spearman with average tie ranks
- covariance matrices
- correlation matrices
- pairwise missing-row provenance

Matrices reuse the Phase 5 Matrix object.

### Probability/distributions

Added typed:

- Probability
- Event
- RandomVariable
- Distribution

Certified families:

- Bernoulli
- Binomial
- Geometric
- Negative Binomial
- Hypergeometric
- Poisson
- Uniform
- Normal
- Exponential
- Gamma
- Beta
- Chi-square
- Student t
- F

Added special functions and direct stable upper-tail calculations.

### Seeded sampling

Added deterministic xorshift32 RNG and distribution sampling.

Equal seeds reproduce equal samples.

### Inference

Added typed:

- ConfidenceInterval
- HypothesisTest

Certified:

- mean t interval
- Wilson proportion interval
- one-sample t
- Welch two-sample t
- paired t
- one-proportion z
- chi-square GOF
- chi-square independence

### Regression

Added RegressionModel using Phase 5 SVD least squares.

Includes:

- multiple predictors
- polynomial regression
- coefficient inference
- residuals/fitted values
- R² / adjusted R²
- residual SE
- rank
- condition number
- rank-deficiency warnings
- row provenance

### Visualization models

Added:

- histogram
- box plot
- scatter
- distribution plot

Models share the same quantile/missing-data semantics as statistical calculations.

### Data workspace V2

Migrated the production Data workspace from ad-hoc arrays to typed Dataset.

Added UI for:

- descriptive summaries
- Pearson/Spearman
- SVD regression
- histogram
- box plot
- mean CI
- one-sample t
- Normal/Binomial/Poisson/t/Chi-square/Gamma/Beta distribution calculations

Tiny nonzero p-values display scientifically.

### Large-data worker

Added `statistics-worker.js` and `StatisticsWorkerClient`.

Large Data summaries and regression can execute off the main thread.

A revision token prevents stale worker summary results from overwriting a newer Dataset.

### PWA

`statistics.js` and `statistics-worker.js` are cached in the offline shell.

## Certification

The Phase 6 suite covers:

- Dataset rows/columns
- explicit missingness
- row identity through sorting
- complete-case filtering
- quoted CSV
- embedded newlines
- German decimal comma
- Dataset serialization
- stable mean/variance
- R7 quantiles
- exact Rational mean
- weighted/frequency semantics
- Pearson/Spearman
- covariance/correlation matrices
- Gamma/Beta/erf special functions
- Probability/Event
- every certified distribution family
- direct extreme-tail functions
- discrete quantile definition
- seeded sample reproducibility
- mean CI
- one-sample/Welch/paired t
- Wilson interval
- one-proportion z
- chi-square GOF/independence
- SVD regression
- rank-deficient regression
- polynomial regression
- histogram normalization
- boxplot quantile consistency
- scatter row identity
- distribution models
- CDF monotonicity/bounds
- continuous quantile round trips

## Phase boundary

Implementation Phase 7 should rebuild Graph around canonical plot models and consume these statistical visualization models directly.

Graph must not recompute regression, histogram bins, quartiles or distribution probabilities.
