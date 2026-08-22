//! Sampling utilities.
//!
//! Unbiased bounded integers, subset sampling, and statistical acceptance verification.
//!
//! Every sampler draws from a caller-provided [`Rng`], so any generator works and seeded runs
//! reproduce exactly:
//!
//! - [`uniform_below`] draws one unbiased integer below a bound.
//! - [`sample_indices_vec`] draws distinct indices without replacement, in memory proportional to
//!   the sample rather than the population.
//! - [`sample_ids`] draws distinct ids of an id-indexed population, typing the draw by the
//!   population it came from.
//! - [`keyed_rng`] builds an independent generator per `(seed, key, stream)`, which is what keeps
//!   parallel draws deterministic.
//! - [`acceptance_sample_size`] reports how many uniformly sampled items must all pass to certify a
//!   defect-rate bound at a confidence level.
//! - [`mean_sample_size`] reports how many uniformly sampled items estimate a mean within a margin
//!   at a confidence level for a given per-item deviation.
//! - [`normal_quantile`] inverts the standard normal distribution and supplies the `z` factor that
//!   [`mean_sample_size`] uses.
//!
//! The module is crate-internal. Its examples carry `ignore` and spell each call as an in-crate
//! caller writes it, and the module's tests assert every property the examples show.

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

/// Draws an unbiased uniform integer in `[0, bound)`.
///
/// Every value below the bound is exactly equally likely; the draw consumes a small bounded
/// expected number of generator words. The non-zero bound makes the empty range unrepresentable, so
/// the draw always succeeds.
///
/// # Examples
///
/// ```ignore
/// use core::num::NonZero;
///
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
pub(crate) fn uniform_below(mut rng: impl Rng, bound: NonZero<u64>) -> u64 {
    rng.random_range(0..bound.get())
}

/// Samples `count` distinct indices from `[0, population)` uniformly at random.
///
/// The sample draws without replacement, so every `count`-element subset of the population is
/// equally likely, and the returned order is itself uniformly random. Memory scales with the sample
/// size rather than the population.
///
/// # Panics
///
/// This panics when `count` exceeds `population`. No `count`-element sample exists to draw, and an
/// oversized request is a caller bug rather than a runtime condition.
///
/// # Examples
///
/// ```ignore
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
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

/// Samples `count` distinct ids of an id-indexed population uniformly at random.
///
/// The typed form of [`sample_indices_vec`]: the id domain comes from the population itself, so a
/// draw cannot pair one population's length with another population's id type. The sample draws
/// without replacement, the yielded order is itself uniformly random, and both forms consume the
/// identical generator stream, so a seeded draw is unchanged by adopting the typed form. Every
/// yielded id is a position of the population, below its length by the draw and within the id's
/// representation by the slice's own construction. The iterator reports its exact length, which
/// is `count`.
///
/// # Panics
///
/// This panics when `count` exceeds the population's length. No `count`-element sample exists to
/// draw, and an oversized request is a caller bug rather than a runtime condition.
///
/// # Examples
///
/// ```ignore
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let population = IdSlice::<RowId, ()>::from_raw(&[(); 1_000_000]);
/// let picked: Vec<RowId> = sample_ids(&mut rng, population, 688).collect();
/// assert_eq!(picked.len(), 688);
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

/// The golden-ratio increment of `SplitMix64`: `2^64 / phi`, odd and therefore coprime to the word,
/// so consecutive keys land maximally spread before mixing.
const SPLITMIX64_GAMMA: u64 = 0x9E37_79B9_7F4A_7C15;

/// The first `SplitMix64` finalizer multiplier (D. Stafford's "mix 13" variant).
const SPLITMIX64_MIX_1: u64 = 0xBF58_476D_1CE4_E5B9;

/// The second `SplitMix64` finalizer multiplier (D. Stafford's "mix 13" variant).
const SPLITMIX64_MIX_2: u64 = 0x94D0_49BB_1331_11EB;

/// Builds a generator keyed by a seed and two stream indexes.
///
/// The key mixes through the `SplitMix64` finalizer. The golden-ratio increment spreads `key`
/// across the word, and the two multiply-xorshift rounds avalanche every input bit into the output,
/// so generators with adjacent keys are statistically independent. Parallel work draws one
/// generator per `(seed, key, stream)` instead of sharing a sequence, and a seeded run reproduces
/// exactly at any thread count.
///
/// # Examples
///
/// ```ignore
/// use rand::RngExt as _;
///
/// let mut draws = keyed_rng(42, 7, 0);
/// let mut replay = keyed_rng(42, 7, 0);
/// assert_eq!(draws.random::<u64>(), replay.random::<u64>());
///
/// let mut sibling = keyed_rng(42, 8, 0);
/// assert_ne!(draws.random::<u64>(), sibling.random::<u64>());
/// ```
#[must_use]
pub(crate) fn keyed_rng(seed: u64, key: u64, stream: u64) -> impl Rng {
    let mut mixed = seed ^ key.wrapping_mul(SPLITMIX64_GAMMA);
    mixed ^= stream.wrapping_mul(SPLITMIX64_MIX_1);
    mixed = (mixed ^ (mixed >> 30)).wrapping_mul(SPLITMIX64_MIX_1);
    mixed = (mixed ^ (mixed >> 27)).wrapping_mul(SPLITMIX64_MIX_2);
    Xoshiro256PlusPlus::seed_from_u64(mixed ^ (mixed >> 31))
}

/// Computes the sample size certifying a defect-rate bound.
///
/// The number of uniformly sampled items to check so that an all-pass result certifies the bound at
/// a confidence level.
///
/// Checking this many uniformly sampled items and finding all of them valid establishes, with
/// probability at least `confidence`, that the true fraction of invalid items is below
/// `defect_rate`.
///
/// If the true defect fraction were at least `defect_rate`, the probability that `n` independent
/// uniform samples all pass would be at most `(1 - defect_rate)^n`; requiring that this is at most
/// `1 - confidence` gives the smallest sufficient count, `n = ceil(ln(1 - confidence) / ln(1 -
/// defect_rate))`. Sampling without replacement from a finite population only lowers the all-pass
/// probability, so the bound stays valid and conservative there too.
///
/// # Examples
///
/// ```ignore
/// // Verifying 688 uniformly sampled embeddings out of one million (for
/// // example, that each is L2-normalized) and finding all of them valid
/// // gives 99.9% confidence that fewer than 1% of the full set fails
/// // that check.
/// let defect_rate = OpenUnitFraction::new(0.01).expect("one percent is interior");
/// let confidence = OpenUnitFraction::new(0.999).expect("the confidence is interior");
/// assert_eq!(acceptance_sample_size(defect_rate, confidence), 688);
/// ```
#[must_use]
pub(crate) fn acceptance_sample_size(
    defect_rate: OpenUnitFraction,
    confidence: OpenUnitFraction,
) -> usize {
    // Both logarithms are strictly negative, so the ratio is positive and
    // finite; `ceil` yields the smallest count whose all-pass probability
    // drops to `1 - confidence` or below, up to f64 rounding at exact
    // power boundaries.
    let samples = (confidence.ln_complement() / defect_rate.ln_complement()).ceil();

    #[expect(
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss,
        reason = "the ratio of two negative logarithms is strictly positive and finite, and the \
                  saturating float-to-integer conversion is the narrowing itself"
    )]
    let samples = samples as usize;

    samples
}

/// Computes the sample size estimating the population mean within `margin`.
///
/// The number of uniformly sampled items whose mean reaches the one-sided confidence level, given
/// the per-item standard deviation.
///
/// The estimate's standard error is `deviation / √n`, so `n = ceil((z · deviation / margin)^2)`
/// with `z` the standard normal quantile of `confidence` keeps the probability of a sampling error
/// beyond `margin` (in one direction) at most `1 - confidence`, by the central limit theorem. This
/// sizes aggregate-mean criteria. [`acceptance_sample_size`] sizes an all-pass criterion instead.
/// An acceptance budget guarantees nothing about a mean's error, so neither sizing rule substitutes
/// for the other.
///
/// The deviation is the caller's to supply: bounded-per-item means admit the distribution-free
/// bound (half the range), and a pilot sample's measured deviation sizes the final sample without
/// baking a population constant into configuration (Stein's two-stage procedure).
///
/// Every parameter carries its domain in the type, so every call has a defined sample size. A
/// ratio too large for `f64` saturates to [`usize::MAX`], which no corpus reaches.
///
/// # Examples
///
/// ```ignore
/// // Estimating a mean within one percentage point at 99% one-sided
/// // confidence, with a measured per-item deviation of 0.32.
/// let deviation = DNonNegative::new(0.32).expect("the deviation is non-negative");
/// let margin = DPositive::new(0.01).expect("the margin is positive");
/// let confidence = OpenUnitFraction::new(0.99).expect("the confidence is interior");
/// assert_eq!(mean_sample_size(deviation, margin, confidence), 5542);
///
/// // A deviation of zero needs no sample at all.
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

/// Inverts the standard normal cumulative distribution.
///
/// Returns the value `z` with `Phi(z) = probability`: the boundary a standard normal variable stays
/// below with exactly the given probability. Computed by Acklam's rational approximation, whose
/// relative error stays below `1.15e-9` over the normal range of the open interval and below
/// `1.8e-9` on subnormal probabilities - beyond any sampling design's sensitivity.
///
/// The probability carries the open unit interval in its type, and every interior probability
/// has a finite quantile.
///
/// # Examples
///
/// ```ignore
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
fn horner<const N: usize>(coefficients: [f64; N], x: f64) -> f64 {
    coefficients
        .into_iter()
        .reduce(|acc, coefficient| acc.mul_add(x, coefficient))
        .unwrap_or(0.0)
}
