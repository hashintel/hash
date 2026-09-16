//! Random samples and statistical sample-size estimates.
//!
//! [`uniform_below`] draws bounded integers, while [`sample_indices_vec`] and [`sample_ids`] sample
//! without replacement. Uniformity assumes uniform generator words and follows rand's
//! range-sampling guarantees. Replaying a seeded draw requires the same generator, sampling
//! implementation and sequence of calls.
//!
//! [`keyed_rng`] derives a generator from `(seed, key, stream)` without shared mutable state.
//! [`acceptance_sample_size`] sizes an all-pass check against a defect-rate threshold.
//! [`mean_sample_size`] uses a normal approximation to size a mean estimate, with
//! [`normal_quantile`] supplying the quantile. The statistical models and floating-point limits are
//! documented on the sizing functions.

use core::num::NonZero;

use hashql_core::id::{Id, IdSlice};
use rand::{
    Rng, RngExt as _, SeedableRng as _,
    seq::index::{IndexVec, sample},
};
use rand_xoshiro::Xoshiro256PlusPlus;

pub(crate) use self::compat::Compat;
use crate::math::{DNonNegative, DPositive, OpenUnitFraction};

mod compat;
#[cfg(test)]
mod tests;

/// Draws an integer in `[0, bound)`.
///
/// The nonzero bound excludes an empty range. With uniform generator words, rand's range sampler
/// has a small mapping bias unless its `unbiased` feature is enabled. Rand bounds the affected
/// fraction of `u64` draws by 2⁻⁶⁴. This function inherits that sampling behavior.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// # use crate::math::nz;
///
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// use crate::random::uniform_below;
///
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let sides = nz!(6);
/// let roll = uniform_below(&mut rng, sides) + 1;
/// assert!((1..=6).contains(&roll));
/// ```
#[inline]
#[must_use]
pub(crate) fn uniform_below(mut rng: impl Rng, bound: NonZero<u64>) -> u64 {
    rng.random_range(0..bound.get())
}

/// Samples `count` distinct indices from `[0, population)` in shuffled order.
///
/// Sampling is without replacement and follows rand's range-sampling guarantees. Sparse requests
/// use memory proportional to `count`. For denser requests, the sampler may allocate an index for
/// every member of the population.
///
/// # Panics
///
/// This panics when `count` exceeds `population`.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// use crate::random::sample_indices_vec;
///
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let picked = sample_indices_vec(&mut rng, 1_000_000, 688);
/// assert_eq!(picked.len(), 688);
/// ```
#[inline]
#[must_use]
pub(crate) fn sample_indices_vec(mut rng: impl Rng, population: usize, count: usize) -> IndexVec {
    sample(&mut rng, population, count)
}

/// Samples `count` distinct typed positions in shuffled order.
///
/// This has the sampling behavior and memory cost of [`sample_indices_vec`], with the population
/// length and ID type supplied together. Both forms consume the identical generator stream for
/// equal lengths, counts and starting generator states. The returned iterator initially has exactly
/// `count` elements.
///
/// Every sampled position must be representable by `I`. [`IdSlice::from_raw`] preserves lengths
/// beyond the ID range and does not establish this condition.
///
/// # Panics
///
/// This panics when `count` exceeds the population's length. Iterating the result panics if a
/// sampled position is outside `I`'s range.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use hashql_core::id::{IdSlice, newtype};
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// use crate::random::sample_ids;
///
/// newtype!(struct SampleId(u32));
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let population = IdSlice::<SampleId, ()>::from_raw(&[(); 4096]);
/// let picked: Vec<SampleId> = sample_ids(&mut rng, population, 128).collect();
/// assert_eq!(picked.len(), 128);
/// ```
#[inline]
pub(crate) fn sample_ids<I: Id, T>(
    mut rng: impl Rng,
    population: &IdSlice<I, T>,
    count: usize,
) -> impl ExactSizeIterator<Item = I> {
    sample(&mut rng, population.len(), count)
        .into_iter()
        .map(I::from_usize)
}

/// The odd golden-ratio increment used by `SplitMix64`.
///
/// Its value approximates 2⁶⁴/φ, where φ = (1 + √5)/2. Oddness makes multiplication invertible
/// modulo 2⁶⁴.
const SPLITMIX64_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;

/// The first `SplitMix64` finalizer multiplier (D. Stafford's "mix 13" variant).
const SPLITMIX64_MIX_1: u64 = 0xBF58_476D_1CE4_E5B9;

/// The second `SplitMix64` finalizer multiplier (D. Stafford's "mix 13" variant).
const SPLITMIX64_MIX_2: u64 = 0x94D0_49BB_1331_11EB;

/// Builds a reproducible non-cryptographic generator from a seed and stream indexes.
///
/// Equal `(seed, key, stream)` inputs initialize equal generator states. Giving each work item
/// stable inputs and its own generator makes its draws independent of scheduling, provided its
/// sequence of calls is unchanged. This does not make subsequent floating-point reductions
/// independent of execution order.
///
/// Odd multiplication and right-xorshift mixing permute 64-bit words. Varying one coordinate while
/// holding the others fixed changes the mixed seed. When more than one coordinate varies, this
/// 64-bit derivation can produce the same seed. It guarantees neither distinct nor statistically
/// independent streams.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use rand::RngExt as _;
///
/// use crate::random::keyed_rng;
///
/// let mut draws = keyed_rng(42, 7, 0);
/// let mut replay = keyed_rng(42, 7, 0);
/// assert_eq!(draws.random::<u64>(), replay.random::<u64>());
/// ```
#[must_use]
pub(crate) fn keyed_rng(seed: u64, key: u64, stream: u64) -> impl Rng {
    let mut mixed = seed ^ key.wrapping_mul(SPLITMIX64_GAMMA);
    mixed ^= stream.wrapping_mul(SPLITMIX64_MIX_1);
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(SPLITMIX64_MIX_1);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(SPLITMIX64_MIX_2);
    Xoshiro256PlusPlus::seed_from_u64(mixed ^ (mixed >> 31))
}

/// Estimates the sample size for an all-pass defect-rate check.
///
/// Let p = `defect_rate` and c = `confidence`, both in (0, 1). Under independent uniform sampling,
/// a population with defect fraction at least p passes all n checks with probability at most (1 −
/// p)ⁿ. Requiring (1 − p)ⁿ ≤ 1 − c gives the real-arithmetic budget n = ⌈ln(1 − c)/ln(1 − p)⌉.
/// Therefore accepting only after all n checks pass bounds the probability of accepting a
/// population at or above the threshold by 1 − c. This is a repeated-sampling error bound, not a
/// posterior probability about the population after observing the sample.
///
/// For a fixed finite population, uniform sampling without replacement only lowers the all-pass
/// probability. The same budget is conservative when n fits the population. When n exceeds the
/// population, checking it in full directly settles an all-pass criterion.
///
/// # Warning
///
/// The returned budget uses floating-point logarithms, division and ceiling, followed by a
/// saturating conversion to [`usize`]. Rounding near an integer boundary can change the minimal
/// sufficient count. Extreme ratios can underflow to zero or saturate to [`usize::MAX`]. The
/// returned integer alone is not a certified upper bound on the real-arithmetic budget.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::{math::OpenUnitFraction, random::acceptance_sample_size};
///
/// // If at least 1% of a population is defective, 688 independent uniform
/// // draws all pass with probability at most 0.99⁶⁸⁸ < 0.001.
/// let defect_rate = OpenUnitFraction::new(0.01).expect("one percent is interior");
/// let confidence = OpenUnitFraction::new(0.999).expect("the confidence is interior");
/// assert_eq!(acceptance_sample_size(defect_rate, confidence), 688);
/// ```
#[must_use]
pub(crate) fn acceptance_sample_size(
    defect_rate: OpenUnitFraction,
    confidence: OpenUnitFraction,
) -> usize {
    // ln_1p preserves a small fraction's correction when `1.0 - fraction` would round to one. The
    // negative logarithms have a positive real ratio, but the f64 division can underflow or
    // overflow.
    let samples = (confidence.ln_complement() / defect_rate.ln_complement()).ceil();

    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "deliberately saturate the rounded floating-point budget to the usize range"
    )]
    let samples = samples as usize;

    samples
}

/// Estimates a mean's sample size using a one-sided normal approximation.
///
/// Let σ = `deviation` ≥ 0 be the per-item standard deviation, m = `margin` > 0 the tolerated
/// error, and c = `confidence` ∈ (1/2, 1). For n independent, identically distributed observations,
/// the sample mean has standard error σ/√n. With z = Φ⁻¹(c), the normal model requires zσ/√n ≤ m,
/// giving n = ⌈(zσ/m)²⌉. Here Φ is the standard normal cumulative distribution. This model is exact
/// for normal observations with known σ and approximate when justified by the central limit
/// theorem.
///
/// A finite-variance assumption alone gives no finite-sample accuracy guarantee for the normal
/// approximation. For observations in [a, b], σ ≤ (b − a)/2 provides a distribution-free bound on
/// the deviation, but does not turn this sizing rule into a distribution-free confidence guarantee.
/// A pilot estimate of σ adds estimation uncertainty that this formula does not account for. Use
/// [`acceptance_sample_size`] for an all-pass criterion rather than a mean's error.
///
/// # Warning
///
/// [`normal_quantile`] and the budget arithmetic are approximate. Intermediate multiplication can
/// overflow even when the real ratio fits, and tiny ratios or their squares can underflow to zero.
/// The final conversion saturates to [`usize::MAX`]. The function returns zero for zero deviation
/// or confidence 1/2. A zero budget does not provide an observed mean. Confidence below 1/2 is
/// accepted by the type, but squaring the negative quantile does not implement the one-sided sizing
/// derivation above.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::{math::{DNonNegative, DPositive, OpenUnitFraction}, random::mean_sample_size};
///
/// // Planning a mean estimate within one percentage point at approximate
/// // 99% one-sided confidence, using a deviation estimate of 0.32.
/// let deviation = DNonNegative::new(0.32).expect("the deviation is non-negative");
/// let margin = DPositive::new(0.01).expect("the margin is positive");
/// let confidence = OpenUnitFraction::new(0.99).expect("the confidence is interior");
/// assert_eq!(mean_sample_size(deviation, margin, confidence), 5542);
///
/// // The formula returns zero when the supplied deviation is zero.
/// assert_eq!(mean_sample_size(DNonNegative::ZERO, margin, confidence), 0);
/// ```
#[must_use]
pub(crate) fn mean_sample_size(
    deviation: DNonNegative,
    margin: DPositive,
    confidence: OpenUnitFraction,
) -> usize {
    let z = normal_quantile(confidence);
    let samples = (z * deviation / margin).powi(2).ceil();

    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the squared ratio is non-negative, and the saturating float-to-integer \
                  conversion is the narrowing itself"
    )]
    let samples = samples as usize;

    samples
}

/// Approximates a standard normal quantile.
///
/// For p = `probability` ∈ (0, 1), the target is the finite z satisfying Φ(z) = p, where Φ is the
/// standard normal cumulative distribution. Acklam's rational approximation uses a central
/// polynomial ratio and a tail ratio after the transformation q = √(−2 ln p), with symmetry for the
/// upper tail. The returned value approximates z without a subsequent refinement step.
///
/// The upper-tail calculation uses [`f64::ln_1p`] to evaluate ln(1 − p). At the median p = 1/2, the
/// result is zero. Floating-point evaluation and the rational approximation do not guarantee exact
/// inversion or correct rounding.
///
/// # Example
///
/// This in-crate example is ignored because the module is private.
///
/// ```ignore
/// use crate::{math::OpenUnitFraction, random::normal_quantile};
///
/// let median = normal_quantile(OpenUnitFraction::new(0.5).expect("the median is interior"));
/// assert!(median.abs() < 1e-9);
///
/// let upper = normal_quantile(OpenUnitFraction::new(0.975).expect("the tail is interior"));
/// assert!((upper - 1.959_964).abs() < 1e-5);
/// ```
#[expect(
    clippy::min_ident_chars,
    reason = "A through D are the canonical names of Acklam's coefficient rows"
)]
#[must_use]
pub(crate) fn normal_quantile(probability: OpenUnitFraction) -> f64 {
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

    let probability = probability.get();
    if probability < LOW {
        let q = (-2.0 * probability.ln()).sqrt();
        horner(C, q) / horner(D, q).mul_add(q, 1.0)
    } else if probability > 1.0 - LOW {
        let q = (-2.0 * (-probability).ln_1p()).sqrt();
        -horner(C, q) / horner(D, q).mul_add(q, 1.0)
    } else {
        let q = probability - 0.5;
        let r = q * q;
        horner(A, r) * q / horner(B, r).mul_add(r, 1.0)
    }
}

/// Evaluates a polynomial by Horner's rule, leading coefficient first.
///
/// An empty coefficient array represents the zero polynomial.
fn horner<const N: usize>(coefficients: [f64; N], x: f64) -> f64 {
    coefficients
        .into_iter()
        .reduce(|acc, coefficient| acc.mul_add(x, coefficient))
        .unwrap_or(0.0)
}
