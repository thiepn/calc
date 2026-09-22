# Probability, Statistics & Data V2 Semantics

This document defines the certified statistical behavior introduced in Implementation Phase 6.

## Architecture

Statistics lives in `statistics.js` and consumes:

- Phase 1 exact/numeric scalar semantics from `math.js`;
- Phase 5 Matrix/Vector/decomposition semantics from `linear-algebra.js`.

The Data workspace now consumes typed `Dataset` objects rather than reparsing pasted text independently for each operation.

Primary objects:

- `Dataset`
- `DataColumn`
- `Probability`
- `Event`
- `FrequencyTable`
- `RandomVariable`
- `Distribution`
- `ConfidenceInterval`
- `HypothesisTest`
- `RegressionModel`

## Missing values and row identity

Missingness is represented explicitly by the `Missing` sentinel.

The following are treated as missing on import:

- empty fields;
- NA;
- N/A;
- null;
- missing.

Missing observations are never silently converted to zero.

Every Dataset has stable row IDs.

Sorting and row selection reorder every column through the same row-index mapping, so observations cannot become unpaired.

## Complete-case rules

Single-column summaries use every present numeric value in that column.

Paired operations such as covariance/correlation/scatter use pairwise-complete rows for the selected columns.

Regression uses complete cases across the response and every requested predictor.

Results report excluded row counts where relevant.

## Delimited import

The parser supports:

- CSV;
- TSV;
- semicolon-delimited data;
- whitespace-separated data;
- quoted fields;
- quoted delimiters;
- quoted embedded newlines;
- UTF-8 BOM removal.

Header presence is inferred unless specified.

Semicolon-delimited data defaults to decimal-comma numeric parsing, supporting forms such as:

```text
x;y
1,5;2,75
3,0;4,25
```

## Column typing

Current DataColumn types:

- numeric;
- categorical;
- boolean;
- unknown.

Column metadata can also carry a unit and semantic role for later integrations.

## Descriptive statistics

Floating summaries use stable accumulation:

- Kahan summation;
- Welford one-pass mean/variance accumulation.

Returned summaries include:

- n;
- missing count;
- sum;
- mean;
- exact Rational mean when every present input is Rational;
- median;
- min/max;
- Q1/Q3;
- IQR;
- sample/population variance;
- sample/population standard deviation.

The default displayed SD/variance convention is sample.

Population variants remain separately available.

## Quantiles

Phase 6 freezes the quantile convention as R type 7 (R7):

```text
h = (n - 1) p
Q(p) = x[floor(h)] + frac(h) * (x[ceil(h)] - x[floor(h)])
```

This same convention is used by:

- quantile();
- median();
- Data summaries;
- box plots;
- IQR/outlier rules.

## Weights and frequency data

`weightedMean(values, weights)` requires:

- matching lengths;
- non-negative weights;
- positive total weight.

`FrequencyTable` requires non-negative integer frequencies.

Its expanded sample has the same descriptive-statistics meaning as explicitly repeated observations.

## Covariance and correlation

Sample covariance divides by n - 1 unless population mode is explicitly requested.

Pearson correlation is undefined for a constant column and raises an explicit error.

Spearman correlation uses average ranks for tied observations.

Covariance/correlation matrices return canonical Phase 5 `Matrix` objects.

## Probability objects

`Probability` enforces:

```text
0 <= p <= 1
```

`Event` associates a name with a Probability and provides a complement event.

`RandomVariable` wraps a certified Distribution and exposes typed probability queries.

## Special functions

The distribution layer includes internal implementations for:

- log Gamma / Gamma;
- regularized lower and upper incomplete Gamma;
- Beta;
- regularized incomplete Beta;
- erf / erfc;
- Normal quantile.

Upper-tail paths use direct survival-function formulas where subtraction would lose precision.

## Supported distributions

Certified distributions:

- Bernoulli;
- Binomial;
- Geometric;
- Negative Binomial;
- Hypergeometric;
- Poisson;
- Uniform;
- Normal;
- Exponential;
- Gamma;
- Beta;
- Chi-square;
- Student t;
- F.

## Distribution parameterization

### Geometric

The random variable is the number of failures before the first success:

```text
support = 0,1,2,...
mean = (1-p)/p
```

### Negative Binomial

The random variable is failures before r successes.

### Gamma

Parameters are:

```text
shape, scale
```

not shape/rate.

### Exponential

The parameter is rate.

These choices are stored in the distribution parameter metadata.

## Discrete quantiles

Discrete quantiles use:

```text
inf { x : F(x) >= p }
```

and are certified against that definition.

## Stable survival functions

Direct SF paths are implemented for important tail-sensitive families, including:

- Normal via erfc;
- Binomial via incomplete Beta;
- Poisson via incomplete Gamma;
- Negative Binomial via incomplete Beta;
- Gamma / Chi-square via upper incomplete Gamma;
- Beta via complementary incomplete Beta;
- Student t via incomplete Beta;
- F via complementary incomplete Beta;
- Exponential analytically.

Extreme Normal tails therefore do not become zero merely because CDF rounded to one.

## Random sampling

`SeededRNG` uses a deterministic xorshift32 state.

The same seed produces the same sample sequence.

Distribution sampling uses this RNG when provided.

This reproducibility contract is versioned by the RNG type stored in state metadata.

## Confidence intervals

Implemented typed ConfidenceInterval results include:

- estimate;
- lower/upper endpoints;
- confidence level;
- method;
- method-specific metadata.

Certified intervals:

- one-sample mean t interval;
- Wilson score interval for a proportion.

## Hypothesis tests

Typed HypothesisTest results contain:

- null hypothesis;
- alternative;
- test statistic;
- reference distribution;
- degrees of freedom where relevant;
- Probability p-value;
- estimate;
- method;
- sample metadata.

Certified tests include:

- one-sample t;
- Welch two-sample t;
- paired t;
- one-proportion z;
- chi-square goodness of fit;
- chi-square independence.

Welch is the default independent two-mean procedure; pooled variance is not silently assumed.

## Paired tests

Paired t-tests first perform pairwise-complete row filtering.

Differences are formed only after pairing.

Excluded rows and final pair count are reported.

## Chi-square warnings

Chi-square results report a warning when expected counts are below five.

The test is still computed; the warning is not treated as an automatic mathematical invalidation.

Fisher exact testing is not claimed in Phase 6.

## P-value presentation

P-values remain numeric Probability objects.

The Data workspace formats sufficiently small nonzero p-values in scientific notation instead of displaying a rounded false zero.

## Regression

Regression uses the Phase 5 SVD least-squares backend.

Primary path:

```text
Dataset
→ complete-case design matrix
→ Matrix / Vector
→ SVD pseudoinverse least squares
→ RegressionModel
```

The implementation does not use the normal-equation inverse as its primary solver.

## Regression model

RegressionModel records:

- response;
- predictor names;
- intercept policy;
- coefficient names/values;
- standard errors;
- t statistics;
- p-values;
- n;
- rank;
- residual df;
- R²;
- adjusted R²;
- residual standard error;
- SSE;
- fitted values;
- residuals;
- original row IDs;
- excluded row count;
- condition number;
- warnings;
- coefficient-unit metadata;
- method.

Rank-deficient designs are solved through the SVD pseudoinverse and explicitly warned.

## Regression inference

When residual df is positive, coefficient covariance is derived from the SVD pseudoinverse:

```text
Cov(beta) = sigma² X+ (X+)^T
```

Coefficient standard errors, t statistics and two-sided t p-values are derived from that covariance.

## Polynomial regression

Polynomial regression constructs explicit predictor columns:

```text
x, x², ..., x^d
```

then routes through the exact same SVD regression backend.

Degree is currently bounded to 12.

## Visualization models

Statistics produces data models; the UI renders those models.

Certified models:

- histogram;
- box plot;
- scatter;
- distribution curve/PMF.

Histogram counts sum to n.

Histogram densities integrate to one over the represented bins.

Box plots use the same R7 quartiles as descriptive summaries.

Scatter points retain Dataset row IDs.

## Histogram rule

If bin count is not supplied, the model prefers the Freedman-Diaconis width when IQR > 0.

It falls back to a square-root-style count for degenerate IQR.

## Box-plot outliers

Fences use:

```text
Q1 - 1.5 IQR
Q3 + 1.5 IQR
```

using the same R7 quartiles.

## Data workspace

The Data workspace now exposes:

- typed Dataset import;
- descriptive summary table;
- missing counts;
- Pearson correlation;
- Spearman correlation;
- SVD simple regression;
- histogram model;
- box-plot model;
- mean confidence interval;
- one-sample t test;
- distribution PMF/PDF/CDF/SF;
- distribution quantiles.

Large descriptive summaries and large regression calls can route through the statistics worker.

## Worker architecture

`statistics-worker.js` imports the canonical engines and supports:

- Dataset summaries;
- SVD regression;
- histogram model creation;
- correlation matrices.

The worker does not duplicate statistical algorithms.

Worker messages use structured clone directly, preserving values such as Infinity that JSON coercion would otherwise turn into null.

## Typed errors

Phase 6 adds:

- `STATISTICS_ERROR`
- `DATASET_ERROR`
- `DISTRIBUTION_ERROR`
- `INFERENCE_ERROR`
- `REGRESSION_ERROR`

Existing typed errors from Phase 5 remain visible for decomposition failures.

## Deliberate Phase 6 limitations

Not yet certified:

- exact Fisher test;
- ANOVA framework;
- generalized linear models;
- logistic regression;
- survival analysis;
- nonparametric hypothesis-test catalog beyond Spearman;
- mixed models;
- Bayesian inference;
- robust regression;
- automatic multiple-testing corrections;
- arbitrary custom quantile conventions;
- streaming datasets larger than browser memory;
- distributed computation.

These remain explicit boundaries rather than hidden approximations.
