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

use std::collections::HashMap;

use rand::Rng;

#[cfg(test)]
mod tests;

/// Draws an unbiased uniform integer in `[0, bound)`.
///
/// Rejection sampling over the zone `[0, N)`, where `N` is the largest
/// multiple of `bound` that fits in `u64`: draws inside the zone cover
/// every residue class the same number of times, so reducing them modulo
/// `bound` is exactly uniform, and draws outside the zone are rejected.
/// The zone always covers at least half of the `u64` range, so fewer than
/// two draws are consumed on average.
///
/// # Panics
///
/// Panics when `bound` is zero: an empty range cannot be sampled, and a
/// zero bound is a caller bug rather than a runtime condition.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::random::uniform_below;
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let roll = uniform_below(&mut rng, 6) + 1;
/// assert!((1..=6).contains(&roll));
/// ```
#[inline]
#[must_use]
pub fn uniform_below(rng: &mut impl Rng, bound: u64) -> u64 {
    assert_ne!(bound, 0, "cannot sample below a zero bound");

    let zone = u64::MAX - u64::MAX % bound;
    loop {
        let draw = rng.next_u64();
        if draw < zone {
            return draw % bound;
        }
    }
}

/// Samples `count` distinct indices from `[0, population)` uniformly at
/// random, without replacement.
///
/// Every `count`-element subset of the population is equally likely, and
/// the returned order is itself uniformly random. When
/// `count >= population` the result is a uniform random permutation of
/// the whole range (empty when the population is empty).
///
/// The partial Fisher-Yates shuffle records displaced entries in a sparse
/// replacement map instead of materializing the population, so memory is
/// proportional to `count`, never to `population`.
///
/// # Examples
///
/// ```
/// use hash_graph_atlas::random::sample_indices;
/// use rand::SeedableRng as _;
/// use rand_xoshiro::Xoshiro256PlusPlus;
///
/// let mut rng = Xoshiro256PlusPlus::seed_from_u64(42);
/// let picked = sample_indices(&mut rng, 1_000_000, 3);
/// assert_eq!(picked.len(), 3);
/// assert!(picked.iter().all(|&index| index < 1_000_000));
/// ```
#[must_use]
pub fn sample_indices(rng: &mut impl Rng, population: usize, count: usize) -> Vec<usize> {
    let count = count.min(population);
    let mut replacements = HashMap::with_capacity(count);
    let mut sampled = Vec::with_capacity(count);
    for draw in 0..count {
        let remaining = population - draw;
        let selected = index_below(rng, remaining);
        // The virtual array holds `index` at `selected` unless an earlier
        // draw parked a displaced entry there; either way the slot is
        // refilled from the shrinking tail, as in a Fisher-Yates swap.
        let index = replacements.remove(&selected).unwrap_or(selected);
        let last = replacements
            .remove(&(remaining - 1))
            .unwrap_or(remaining - 1);
        if selected != remaining - 1 {
            replacements.insert(selected, last);
        }
        sampled.push(index);
    }
    sampled
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

/// Draws a uniform index below `bound`, round-tripping through the `u64`
/// sampler.
fn index_below(rng: &mut impl Rng, bound: usize) -> usize {
    let bound = u64::try_from(bound).expect("usize should fit u64");
    usize::try_from(uniform_below(rng, bound)).expect("a sample below a usize bound fits usize")
}
