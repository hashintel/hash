use core::iter;
use std::collections::HashSet;

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{acceptance_sample_size, sample_indices, uniform_below};

fn rng(seed: u64) -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}

/// Probability that `count` independent uniform samples all pass when the
/// true defect fraction is `defect_rate`.
fn all_pass_probability(defect_rate: f64, count: usize) -> f64 {
    #[expect(
        clippy::cast_precision_loss,
        reason = "every sample size in the test grid is far below 2^53"
    )]
    (1.0 - defect_rate).powf(count as f64)
}

#[test]
fn uniform_below_stays_in_range() {
    let mut rng = rng(2);

    for bound in [2, 3, 7, 10, 1 << 33, u64::MAX] {
        for _ in 0..1_000 {
            assert!(uniform_below(&mut rng, bound) < bound);
        }
    }
}

#[test]
fn uniform_below_one_always_returns_zero() {
    let mut rng = rng(1);

    for _ in 0..256 {
        assert_eq!(uniform_below(&mut rng, 1), 0);
    }
}

#[test]
fn uniform_below_covers_every_residue_evenly() {
    const DRAWS: usize = 100_000;
    const RESIDUES: usize = 7;

    let mut rng = rng(7);
    let mut counts = [0_usize; RESIDUES];
    for _ in 0..DRAWS {
        let residue = usize::try_from(uniform_below(&mut rng, RESIDUES as u64))
            .expect("residue below 7 fits usize");
        counts[residue] += 1;
    }

    // Chi-square-lite: +-20% around the exact expectation is far wider
    // than the ~1% standard deviation of a binomial with these counts.
    let expected = DRAWS / RESIDUES;
    for (residue, &count) in counts.iter().enumerate() {
        assert!(
            count >= expected * 4 / 5 && count <= expected * 6 / 5,
            "residue {residue} appeared {count} times, expected about {expected}",
        );
    }
}

#[test]
fn uniform_below_is_deterministic_per_seed() {
    let mut first = rng(42);
    let mut second = rng(42);
    let mut other = rng(43);

    let replay: Vec<u64> = iter::repeat_with(|| uniform_below(&mut first, 1_000))
        .take(32)
        .collect();
    let expected: Vec<u64> = iter::repeat_with(|| uniform_below(&mut second, 1_000))
        .take(32)
        .collect();
    let diverged: Vec<u64> = iter::repeat_with(|| uniform_below(&mut other, 1_000))
        .take(32)
        .collect();

    assert_eq!(replay, expected, "same seed must replay the same sequence");
    assert_ne!(replay, diverged, "different seeds must diverge");
}

#[test]
#[should_panic(expected = "cannot sample below a zero bound")]
fn uniform_below_rejects_a_zero_bound() {
    let mut rng = rng(0);
    let _: u64 = uniform_below(&mut rng, 0);
}

#[test]
fn sample_indices_are_distinct_and_in_range() {
    let mut rng = rng(5);

    let sampled = sample_indices(&mut rng, 1_000, 64);

    assert_eq!(sampled.len(), 64);
    assert!(sampled.iter().all(|&index| index < 1_000));
    let unique: HashSet<usize> = sampled.iter().copied().collect();
    assert_eq!(unique.len(), 64, "sampled indices must be distinct");
}

#[test]
fn sample_indices_covering_the_population_is_a_permutation() {
    let mut rng = rng(3);
    let identity: Vec<usize> = (0..10).collect();

    for count in [10, 25] {
        let mut sampled = sample_indices(&mut rng, 10, count);
        assert_ne!(sampled, identity, "the permutation must be shuffled");
        sampled.sort_unstable();
        assert_eq!(sampled, identity);
    }
}

#[test]
fn sample_indices_with_zero_count_is_empty() {
    let mut rng = rng(4);

    assert!(sample_indices(&mut rng, 100, 0).is_empty());
    assert!(sample_indices(&mut rng, 0, 10).is_empty());
}

#[test]
fn sample_indices_hits_every_index_evenly() {
    const ROUNDS: usize = 50_000;

    let mut rng = rng(11);
    let mut counts = [0_usize; 5];
    for _ in 0..ROUNDS {
        for index in sample_indices(&mut rng, 5, 2) {
            counts[index] += 1;
        }
    }

    // Each index is picked with probability 2/5 per round; +-20% around
    // the expectation is a generous, non-flaky band for a fixed seed.
    let expected = ROUNDS * 2 / 5;
    for (index, &count) in counts.iter().enumerate() {
        assert!(
            count >= expected * 4 / 5 && count <= expected * 6 / 5,
            "index {index} appeared {count} times, expected about {expected}",
        );
    }
}

#[test]
fn sample_indices_is_deterministic_per_seed() {
    let mut first = rng(21);
    let mut second = rng(21);

    assert_eq!(
        sample_indices(&mut first, 500, 50),
        sample_indices(&mut second, 500, 50),
        "same seed must replay the same sample",
    );
}

#[test]
fn acceptance_sample_size_matches_hand_checked_values() {
    // The "rule of three" neighborhood: ln(0.05) / ln(0.99) = 298.07 -> 299.
    assert_eq!(acceptance_sample_size(0.01, 0.95), Some(299));
    // ln(1e-6) / ln(0.999) = 13808.6 -> 13809.
    assert_eq!(acceptance_sample_size(0.001, 0.999_999), Some(13_809));
    // The doc example: 1% defects certified at 99.9% confidence.
    assert_eq!(acceptance_sample_size(0.01, 0.999), Some(688));
}

#[test]
fn acceptance_sample_size_grows_with_stricter_requirements() {
    // Both grids are ordered from lax to strict.
    let confidences = [0.5, 0.8, 0.9, 0.95, 0.99, 0.999, 0.999_999];
    let defect_rates = [0.5, 0.25, 0.1, 0.05, 0.01, 0.005, 0.001];

    for defect_rate in defect_rates {
        let mut previous = 0;
        for confidence in confidences {
            let size = acceptance_sample_size(defect_rate, confidence)
                .expect("grid parameters are in range");
            assert!(
                size >= previous,
                "raising confidence to {confidence} at defect rate {defect_rate} shrank the \
                 sample from {previous} to {size}",
            );
            previous = size;
        }
    }

    for confidence in confidences {
        let mut previous = 0;
        for defect_rate in defect_rates {
            let size = acceptance_sample_size(defect_rate, confidence)
                .expect("grid parameters are in range");
            assert!(
                size >= previous,
                "tightening defect rate to {defect_rate} at confidence {confidence} shrank the \
                 sample from {previous} to {size}",
            );
            previous = size;
        }
    }
}

#[test]
fn acceptance_sample_size_rejects_parameters_outside_the_open_interval() {
    for invalid in [
        0.0,
        1.0,
        -0.5,
        1.5,
        f64::NAN,
        f64::INFINITY,
        f64::NEG_INFINITY,
    ] {
        assert_eq!(acceptance_sample_size(invalid, 0.95), None);
        assert_eq!(acceptance_sample_size(0.01, invalid), None);
    }
}

#[test]
fn acceptance_sample_size_is_the_minimal_count_meeting_the_bound() {
    let defect_rates = [0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5];
    let confidences = [0.5, 0.8, 0.9, 0.95, 0.99, 0.999, 0.999_999];

    for defect_rate in defect_rates {
        for confidence in confidences {
            let size = acceptance_sample_size(defect_rate, confidence)
                .expect("grid parameters are in range");
            let failure_budget = 1.0 - confidence;

            // The contract: `size` all-pass samples are unlikely enough
            // under a defect fraction of `defect_rate`...
            assert!(
                all_pass_probability(defect_rate, size) <= failure_budget,
                "{size} samples do not certify defect rate {defect_rate} at confidence \
                 {confidence}",
            );
            // ...and no smaller count is (minimality; `size` is at least
            // 1, so the exponent never underflows).
            assert!(
                all_pass_probability(defect_rate, size - 1) > failure_budget,
                "{size} samples are not minimal for defect rate {defect_rate} at confidence \
                 {confidence}",
            );
        }
    }
}
