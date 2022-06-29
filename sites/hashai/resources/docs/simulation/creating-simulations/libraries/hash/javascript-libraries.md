---
title: Statistics
slug: simulation/creating-simulations/libraries/hash/javascript-libraries
objectId: 5343334f-4494-48e8-846a-ac22a38b9ea5
description: Statistics packages and libraries support in HASH
---

# Statistics

HASH currently provides access to the [jStat](http://jstat.github.io/distributions.html) library for accessing statistics classes and functions. You can access the library in behaviors through `hstd.stats` and hCore's autocomplete function will help you out with suggestions and tooltips. The statistics library is only available in JavaScript files.

Currently only the functions and classes listed below are "fully supported". Others are available and will work, though we've left them undocumented as the interface/names might change.

**[jStat Vectors](http://jstat.github.io/vector.html)**

These functions operate on arrays \(or arrays of arrays\) to calculate typical statistical measures.

<!-- prettier-ignore -->
```javascript
sum(array)
sumsqrd(array)
sumsqerr(array)
sumrow(arrayOfArrays)
product(array)
min(array)
max(array)
mean(array)
meansqerr(array)
geomean(array)
median(array)
cumsum(array)
cumprod(array)
diff(array)
rank(array)
mode(array)
range(array)
variance(array)
pooledvariance(arrayOfArrays)
deviation(array)
stdev(array)
pooledstdev(arrayOfArrays)
meandev(array)
meddev(array)
skewness(array)
kurtosis(array)
coeffvar(array)
quartiles(array)
quantiles(arrayOfArrays)
percentile(array, k, exclusive)
percentileOfScore(array)
histogram(array, bins)
covariance(array1, array2)
corrcoeff(array1, array2)
```

**[jStat Distributions](http://jstat.github.io/distributions.html)**

All of the classes below have methods to calculate typical properties relating to the named distribution. Check the jStat documentation, or hCore's built-in autocomplete and tooltips for more information.

<!-- prettier-ignore -->
```javascript
beta
centralF
cauchy
chisquare
exponential
gamma
invgamma
kumaraswamy
lognormal
normal
pareto
studentt
tukey
weibull
uniform
binomial
negbin
hypgeom
poisson
triangular
arcsine
```

For an example that uses these statistics functions, see the example on the [Designing with Distributions](/docs/simulation/concepts/designing-with-distributions) page.
