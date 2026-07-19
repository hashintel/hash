//! Sampling utilities: unbiased bounded integers, subset sampling, and
//! statistical acceptance verification.
//!
//! Every sampler draws from a caller-provided [`Rng`], so any generator
//! works and seeded runs reproduce exactly:
//!
//! - [`uniform_below`] draws one unbiased integer below a bound.
//! - [`sample_indices`] draws distinct indices without replacement, in memory proportional to the
//!   sample rather than the population.
/// - [`acceptance_sample_size`] sizes a statistical spot check: how many uniformly sampled
///   items must all pass to certify a defect-rate bound at a confidence level.
/// - [`mean_sample_size`] sizes an aggregate spot check: how many uniformly sampled items
///   estimate a mean within a margin at a confidence level, given the per-item deviation.
/// - [`normal_quantile`] inverts the standard normal distribution, the kernel of
///   [`mean_sample_size`].
use core::num::NonZero;

use rand::{
    Rng, RngExt as _,
    seq::index::{IndexVec, sample, sample_array},
};

pub(crate) use self::compat::Compat;

mod compat;
#[cfg(test)]
mod tests;

/// Draws an unbiased uniform integer in `[0, bound)`.
///
/// Every value below the bound is exactly equally likely; the draw
/// consumes a small bounded expected number of generator words. The
/// non-zero bound makes the empty range unrepresentable, so the draw
/// always succeeds.
///
/// # Examples
///
/// ```
/// use core::num::NonZero;
///
/// use hash_graph_atlas::random::uniform_below;
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let sides = NonZero::new(6).expect("a die has sides");
/// let roll = uniform_below(&mut rng, sides) + 1;
/// assert!((1..=6).contains(&roll));
/// ```
#[inline]
#[must_use]
pub fn uniform_below(mut rng: impl Rng, bound: NonZero<u64>) -> u64 {
    rng.random_range(0..bound.get())
}

/// Samples `N` distinct indices from `[0, population)` uniformly at
/// random, without replacement, into a fixed-size array.
///
/// Every `N`-element subset of the population is equally likely, and the
/// returned order is itself uniformly random. Memory is proportional to
/// the sample, never to the population, and nothing is heap-allocated.
///
/// Returns [`None`] when the population holds fewer than `N` indices:
/// there is no `N`-element sample to draw.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::random::sample_indices;
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let picked = sample_indices::<3>(&mut rng, 1_000_000).expect("the population covers a sample");
/// assert!(picked.iter().all(|&index| index < 1_000_000));
/// assert_ne!(picked[0], picked[1]);
/// ```
#[inline]
#[must_use]
pub fn sample_indices<const N: usize>(mut rng: impl Rng, population: usize) -> Option<[usize; N]> {
    sample_array::<_, N>(&mut rng, population)
}

/// Samples `count` distinct indices from `[0, population)` uniformly at
/// random, without replacement, for sample sizes chosen at runtime.
///
/// Every `count`-element subset of the population is equally likely, and
/// the returned order is itself uniformly random. Memory is proportional
/// to the sample. Prefer [`sample_indices`] when the sample size is a
/// compile-time constant; it skips the heap entirely.
///
/// # Panics
///
/// Panics when `count` exceeds `population`: there is no `count`-element
/// sample to draw, and an oversized request is a caller bug rather than
/// a runtime condition.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::random::sample_indices_vec;
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let picked = sample_indices_vec(&mut rng, 1_000_000, 688);
/// assert_eq!(picked.len(), 688);
/// ```
#[inline]
#[must_use]
pub fn sample_indices_vec(mut rng: impl Rng, population: usize, count: usize) -> IndexVec {
    sample(&mut rng, population, count)
}

/// Computes the number of uniformly sampled items to check so that an
/// all-pass result certifies a defect-rate bound at a confidence level.
///
/// Checking this many uniformly sampled items and finding all of them
/// valid establishes, with probability at least `confidence`, that the
/// true fraction of invalid items is below `defect_rate`.
///
/// If the true defect fraction were at least `defect_rate`, the
/// probability that `n` independent uniform samples all pass would be at
/// most `(1 - defect_rate)^n`; requiring that this is at most
/// `1 - confidence` gives the smallest sufficient count,
/// `n = ceil(ln(1 - confidence) / ln(1 - defect_rate))`. Sampling without
/// replacement from a finite population only lowers the all-pass
/// probability, so the bound stays valid and conservative there too.
///
/// Returns [`None`] unless `defect_rate` and `confidence` are both
/// strictly between 0 and 1; parameters outside that open interval carry
/// no statistical meaning.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::random::acceptance_sample_size;
///
/// // Verifying 688 uniformly sampled embeddings out of one million (for
/// // example, that each is L2-normalized) and finding all of them valid
/// // gives 99.9% confidence that fewer than 1% of the full set are
/// // malformed.
/// assert_eq!(acceptance_sample_size(0.01, 0.999), Some(688));
///
/// // Out-of-range parameters have no meaningful sample size.
/// assert_eq!(acceptance_sample_size(0.0, 0.999), None);
/// assert_eq!(acceptance_sample_size(0.01, 1.0), None);
/// ```
#[must_use]
pub fn acceptance_sample_size(defect_rate: f64, confidence: f64) -> Option<usize> {
    let in_open_unit_interval = |value: f64| value > 0.0 && value < 1.0;
    if !in_open_unit_interval(defect_rate) || !in_open_unit_interval(confidence) {
        return None;
    }

    // `ln_1p(-x)` is `ln(1 - x)` without forming the rounded difference.
    // Both logarithms are strictly negative, so the ratio is positive and
    // finite; `ceil` yields the smallest count whose all-pass probability
    // drops to `1 - confidence` or below.
    let samples = ((-confidence).ln_1p() / (-defect_rate).ln_1p()).ceil();

    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the ratio of two negative logarithms is strictly positive and finite, and the \
                  saturating float-to-integer conversion is the narrowing itself"
    )]
    let samples = samples as usize;

    Some(samples)
}

/// Computes the number of uniformly sampled items whose mean estimates
/// the population mean within `margin` at a one-sided confidence level,
/// given the per-item standard deviation.
///
/// The estimate's standard error is `deviation / sqrt(n)`, so
/// `n = ceil((z * deviation / margin)^2)` with `z` the standard normal
/// quantile of `confidence` keeps the probability of a sampling error
/// beyond `margin` (in one direction) at most `1 - confidence`, by the
/// central limit theorem. This sizes aggregate-mean criteria; an
/// all-pass criterion is sized by [`acceptance_sample_size`] instead,
/// and the two are not interchangeable - an acceptance budget carries
/// no guarantee about a mean's error.
///
/// The deviation is the caller's to supply: bounded-per-item means
/// admit the distribution-free bound (half the range), and a pilot
/// sample's measured deviation sizes the final sample without baking a
/// population constant into configuration (Stein's two-stage
/// procedure).
///
/// Returns [`None`] unless `margin` is strictly positive, `confidence`
/// is strictly between 0 and 1, and `deviation` is finite and
/// non-negative; parameters outside those domains carry no statistical
/// meaning.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::random::mean_sample_size;
///
/// // Estimating a mean within one percentage point at 99% one-sided
/// // confidence, with a measured per-item deviation of 0.32.
/// assert_eq!(mean_sample_size(0.32, 0.01, 0.99), Some(5542));
///
/// // A deviation of zero needs no sample at all.
/// assert_eq!(mean_sample_size(0.0, 0.01, 0.99), Some(0));
///
/// // Out-of-domain parameters have no meaningful sample size.
/// assert_eq!(mean_sample_size(0.32, 0.0, 0.99), None);
/// assert_eq!(mean_sample_size(0.32, 0.01, 1.0), None);
/// ```
#[must_use]
pub fn mean_sample_size(deviation: f64, margin: f64, confidence: f64) -> Option<usize> {
    if !deviation.is_finite() || deviation < 0.0 || !margin.is_finite() || margin <= 0.0 {
        return None;
    }

    let z = normal_quantile(confidence)?;
    let samples = (z * deviation / margin).powi(2).ceil();

    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the squared ratio is non-negative and finite, and the saturating \
                  float-to-integer conversion is the narrowing itself"
    )]
    let samples = samples as usize;

    Some(samples)
}

/// Inverts the standard normal cumulative distribution.
///
/// Returns the value `z` with `Phi(z) = probability`: the boundary a
/// standard normal variable stays below with exactly the given
/// probability. Computed by Acklam's rational approximation, whose
/// relative error stays below `1.15e-9` over the open unit interval -
/// beyond any sampling design's sensitivity.
///
/// Returns [`None`] unless `probability` is strictly between 0 and 1;
/// the endpoints have no finite quantile.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::random::normal_quantile;
///
/// let median = normal_quantile(0.5).expect("the median is in domain");
/// assert!(median.abs() < 1e-9);
///
/// let upper = normal_quantile(0.975).expect("the upper tail is in domain");
/// assert!((upper - 1.959_964).abs() < 1e-5);
///
/// assert_eq!(normal_quantile(0.0), None);
/// assert_eq!(normal_quantile(1.0), None);
/// ```
#[expect(
    clippy::min_ident_chars,
    reason = "A through D are the canonical names of Acklam's coefficient rows"
)]
#[must_use]
pub fn normal_quantile(probability: f64) -> Option<f64> {
    // Acklam's coefficients: one rational approximation for the central
    // region and one for each tail, meeting at 0.02425.
    const A: [f64; 6] = [
        -3.969_683_028_665_376e1,
        2.209_460_984_245_205e2,
        -2.759_285_104_469_687e2,
        1.383_577_518_672_69e2,
        -3.066_479_806_614_716e1,
        2.506_628_277_459_239,
    ];
    const B: [f64; 5] = [
        -5.447_609_879_822_406e1,
        1.615_858_368_580_409e2,
        -1.556_989_798_598_866e2,
        6.680_131_188_771_972e1,
        -1.328_068_155_288_572e1,
    ];
    const C: [f64; 6] = [
        -7.784_894_002_430_293e-3,
        -3.223_964_580_411_365e-1,
        -2.400_758_277_161_838,
        -2.549_732_539_343_734,
        4.374_664_141_464_968,
        2.938_163_982_698_783,
    ];
    const D: [f64; 4] = [
        7.784_695_709_041_462e-3,
        3.224_671_290_700_398e-1,
        2.445_134_137_142_996,
        3.754_408_661_907_416,
    ];
    const LOW: f64 = 0.02425;

    let in_open_unit_interval = probability > 0.0 && probability < 1.0;
    if !in_open_unit_interval {
        return None;
    }

    let quantile = if probability < LOW {
        let q = (-2.0 * probability.ln()).sqrt();
        horner(C, q) / horner(D, q).mul_add(q, 1.0)
    } else if probability > 1.0 - LOW {
        let q = (-2.0 * (-probability).ln_1p()).sqrt();
        -horner(C, q) / horner(D, q).mul_add(q, 1.0)
    } else {
        let q = probability - 0.5;
        let r = q * q;
        horner(A, r) * q / horner(B, r).mul_add(r, 1.0)
    };

    Some(quantile)
}

/// Evaluates a polynomial by Horner's rule, leading coefficient first.
fn horner<const N: usize>(coefficients: [f64; N], x: f64) -> f64 {
    coefficients
        .into_iter()
        .reduce(|acc, coefficient| acc.mul_add(x, coefficient))
        .unwrap_or(0.0)
}
