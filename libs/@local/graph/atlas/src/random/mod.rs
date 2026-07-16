//! Sampling utilities: unbiased bounded integers, subset sampling, and
//! statistical acceptance verification.
//!
//! Every sampler draws from a caller-provided [`Rng`], so any generator
//! works and seeded runs reproduce exactly:
//!
//! - [`uniform_below`] draws one unbiased integer below a bound.
//! - [`sample_indices`] draws distinct indices without replacement, in memory proportional to the
//!   sample rather than the population.
//! - [`acceptance_sample_size`] sizes a statistical spot check: how many uniformly sampled items
//!   must all pass to certify a defect-rate bound at a confidence level.

use core::num::NonZero;

use rand::{
    Rng, RngExt as _,
    seq::index::{IndexVec, sample, sample_array},
};

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
