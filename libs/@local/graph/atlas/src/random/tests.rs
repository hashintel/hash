use core::num::NonZero;

use proptest::{arbitrary::any, prop_assert, property_test};
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    Compat, acceptance_sample_size, mean_sample_size, normal_quantile, sample_indices,
    sample_indices_vec, uniform_below,
};

fn rng(seed: u64) -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}

#[test]
fn compat_ref_casts_view_the_rng_in_place() {
    use rand_core::Rng as _;
    use rand_core_06::RngCore as _;

    let mut wrapped = rng(7);
    let mut reference = rng(7);

    assert!(core::ptr::eq(
        core::ptr::from_ref(Compat::from_ref(&wrapped)).cast::<Xoshiro256PlusPlus>(),
        &raw const wrapped,
    ));
    assert_eq!(
        Compat::from_mut(&mut wrapped).next_u64(),
        reference.next_u64()
    );
}

#[test]
fn uniform_below_one_is_always_zero() {
    let mut rng = rng(7);
    let bound = NonZero::new(1).expect("one is not zero");

    for _ in 0..64 {
        assert_eq!(uniform_below(&mut rng, bound), 0);
    }
}

#[test]
fn uniform_below_covers_every_residue_evenly() {
    let mut rng = rng(42);
    let bound = NonZero::new(7).expect("seven is not zero");

    let mut counts = [0_u32; 7];
    let draws = 70_000;
    for _ in 0..draws {
        let value = uniform_below(&mut rng, bound);
        counts[usize::try_from(value).expect("a value below seven fits usize")] += 1;
    }

    // Expected 10_000 per residue; ±10% is ~26 standard deviations, so a
    // failure indicates bias rather than bad luck with the fixed seed.
    for (residue, &count) in counts.iter().enumerate() {
        assert!(
            (9_000..=11_000).contains(&count),
            "residue {residue} drawn {count} times",
        );
    }
}

#[test]
fn uniform_below_is_deterministic_per_seed() {
    let bound = NonZero::new(1_000_003).expect("a prime is not zero");

    // One generator per sequence, advanced across draws: the comparison
    // covers the whole stream, not a repeated first draw.
    let mut first_rng = rng(9);
    let mut second_rng = rng(9);
    let first: Vec<u64> = core::iter::repeat_with(|| uniform_below(&mut first_rng, bound))
        .take(32)
        .collect();
    let second: Vec<u64> = core::iter::repeat_with(|| uniform_below(&mut second_rng, bound))
        .take(32)
        .collect();

    assert_eq!(first, second);
    // The stream must actually vary; a constant stream would make the
    // equality above vacuous.
    assert!(
        first
            .array_windows::<2>()
            .any(|[left, right]| left != right)
    );
}

#[test]
fn sample_indices_returns_distinct_in_range_indices() {
    let mut rng = rng(1);

    let picked = sample_indices::<16>(&mut rng, 1_000).expect("the population covers the sample");

    let mut seen = picked;
    seen.sort_unstable();
    for [left, right] in seen.array_windows::<2>() {
        assert!(left < right, "indices must be distinct");
    }
    assert!(picked.iter().all(|&index| index < 1_000));
}

#[test]
fn sample_indices_rejects_undersized_populations() {
    let mut rng = rng(2);

    assert!(sample_indices::<4>(&mut rng, 3).is_none());
    assert!(sample_indices::<4>(&mut rng, 4).is_some());
    assert_eq!(sample_indices::<0>(&mut rng, 0), Some([]));
}

#[test]
fn sample_indices_hits_every_index_over_repetitions() {
    let mut rng = rng(3);

    // Sampling 2 of 5 across 400 draws must pick every index. The expected
    // count per index is 160 and the chance of an index staying below 100 is
    // negligible.
    let mut counts = [0_u32; 5];
    for _ in 0..400 {
        let picked = sample_indices::<2>(&mut rng, 5).expect("the population covers the sample");
        for index in picked {
            counts[index] += 1;
        }
    }

    for (index, &count) in counts.iter().enumerate() {
        assert!(count > 100, "index {index} picked {count} times");
    }
}

#[test]
fn sample_indices_vec_matches_the_array_contract() {
    let mut rng = rng(4);

    let picked = sample_indices_vec(&mut rng, 100_000, 688);
    assert_eq!(picked.len(), 688);

    let mut seen: Vec<usize> = picked.into_iter().collect();
    seen.sort_unstable();
    seen.dedup();
    assert_eq!(seen.len(), 688, "indices must be distinct");
    assert!(seen.iter().all(|&index| index < 100_000));
}

#[test]
fn acceptance_sample_size_matches_hand_checked_values() {
    // ln(0.05) / ln(0.99) = 298.07..., which sits in the rule-of-three
    // neighbourhood.
    assert_eq!(acceptance_sample_size(0.01, 0.95), Some(299));
    // The doc example uses one-in-a-hundred defects at 99.9% confidence.
    assert_eq!(acceptance_sample_size(0.01, 0.999), Some(688));
    assert_eq!(acceptance_sample_size(0.001, 0.999_999), Some(13_809));
}

#[test]
fn acceptance_sample_size_rejects_degenerate_parameters() {
    for value in [0.0, 1.0, -0.5, 1.5, f64::NAN, f64::INFINITY] {
        assert_eq!(acceptance_sample_size(value, 0.95), None, "defect {value}");
        assert_eq!(
            acceptance_sample_size(0.01, value),
            None,
            "confidence {value}"
        );
    }
}

/// The returned count is sufficient and minimal.
///
/// `n` all-pass samples push the false-acceptance probability to the target or below, and `n -
/// 1` samples do not. This is the function's entire contract, certified over the whole
/// in-domain parameter space.
#[property_test]
fn acceptance_sample_size_is_sufficient_and_minimal(
    #[strategy = 1e-6_f64..0.5] defect_rate: f64,
    #[strategy = 0.5_f64..(1.0 - 1e-9)] confidence: f64,
) {
    let samples = acceptance_sample_size(defect_rate, confidence)
        .expect("parameters lie in the open unit interval");
    let all_pass = |count: usize| {
        (1.0 - defect_rate).powi(i32::try_from(count).expect("sample sizes fit i32"))
    };

    prop_assert!(all_pass(samples) <= 1.0 - confidence + 1e-12);
    if samples > 0 {
        prop_assert!(all_pass(samples - 1) > 1.0 - confidence - 1e-12);
    }
}

/// Stricter requirements never shrink the sample.
#[property_test]
fn acceptance_sample_size_is_monotone(
    #[strategy = 1e-5_f64..0.4] defect_rate: f64,
    #[strategy = 0.5_f64..0.999] confidence: f64,
) {
    let base = acceptance_sample_size(defect_rate, confidence)
        .expect("parameters lie in the open unit interval");
    let stricter_confidence = acceptance_sample_size(defect_rate, confidence + 5e-4)
        .expect("parameters lie in the open unit interval");
    let looser_defect = acceptance_sample_size(defect_rate * 1.5, confidence)
        .expect("parameters lie in the open unit interval");

    prop_assert!(stricter_confidence >= base);
    prop_assert!(looser_defect <= base);
}

/// Draws respect any bound, including awkward ones near overflow.
#[property_test]
fn uniform_below_stays_in_range(
    #[strategy = any::<u64>()] seed: u64,
    #[strategy = 1_u64..] bound: u64,
) {
    let bound = NonZero::new(bound).expect("the strategy starts at one");
    let value = uniform_below(&mut Xoshiro256PlusPlus::seed_from_u64(seed), bound);

    prop_assert!(value < bound.get());
}

/// Samples are always distinct, in range, and exactly `N` long for any covering population.
#[property_test]
fn sample_indices_is_a_valid_subset(
    #[strategy = any::<u64>()] seed: u64,
    #[strategy = 8_usize..10_000] population: usize,
) {
    let picked = sample_indices::<8>(&mut Xoshiro256PlusPlus::seed_from_u64(seed), population)
        .expect("the population covers the sample");

    let mut seen = picked;
    seen.sort_unstable();
    for [left, right] in seen.array_windows::<2>() {
        prop_assert!(left < right);
    }
    prop_assert!(picked.iter().all(|&index| index < population));
}

/// The quantile matches tabulated standard normal values.
///
/// The tabulated cases cover both rational-approximation regions.
#[test]
fn normal_quantile_matches_tabulated_values() {
    // Central region.
    for (probability, expected) in [
        (0.5, 0.0),
        (0.75, 0.674_489_750_196_082),
        (0.9, 1.281_551_565_544_6),
        (0.95, 1.644_853_626_951_472),
        (0.975, 1.959_963_984_540_054),
        (0.99, 2.326_347_874_040_841),
    ] {
        let quantile = normal_quantile(probability).expect("the probability is in domain");
        assert!(
            (quantile - expected).abs() < 1e-8,
            "quantile({probability}) = {quantile}, expected {expected}",
        );
    }

    // Tail regions (the approximation switches at 0.02425).
    for (probability, expected) in [
        (0.999, 3.090_232_306_167_813),
        (0.000_1, -3.719_016_485_455_68),
        (0.02, -2.053_748_910_631_823),
    ] {
        let quantile = normal_quantile(probability).expect("the probability is in domain");
        assert!(
            (quantile - expected).abs() < 1e-8,
            "quantile({probability}) = {quantile}, expected {expected}",
        );
    }
}

/// The quantile is antisymmetric about the median.
#[test]
fn normal_quantile_is_antisymmetric() {
    for probability in [0.001, 0.02425, 0.1, 0.3, 0.49] {
        let lower = normal_quantile(probability).expect("in domain");
        let upper = normal_quantile(1.0 - probability).expect("in domain");
        assert!(
            (lower + upper).abs() < 1e-8,
            "quantile({probability}) = {lower} does not mirror {upper}",
        );
    }
}

/// Endpoints and out-of-domain probabilities have no quantile.
#[test]
fn normal_quantile_rejects_out_of_domain_probabilities() {
    assert_eq!(normal_quantile(0.0), None);
    assert_eq!(normal_quantile(1.0), None);
    assert_eq!(normal_quantile(-0.5), None);
    assert_eq!(normal_quantile(1.5), None);
    assert_eq!(normal_quantile(f64::NAN), None);
}

/// The mean sample size follows the closed form and its monotonicity laws.
///
/// Tighter margins and higher confidence grow the sample, smaller deviations shrink it.
#[test]
fn mean_sample_size_follows_the_closed_form() {
    // ceil((2.326348 · 0.32 / 0.012)^2) = ceil(3848.4) hand-checked.
    assert_eq!(mean_sample_size(0.32, 0.012, 0.99), Some(3849));
    // A deviation of zero needs no sample.
    assert_eq!(mean_sample_size(0.0, 0.01, 0.99), Some(0));

    let base = mean_sample_size(0.32, 0.012, 0.99).expect("in domain");
    let tighter_margin = mean_sample_size(0.32, 0.006, 0.99).expect("in domain");
    let higher_confidence = mean_sample_size(0.32, 0.012, 0.999).expect("in domain");
    let smaller_deviation = mean_sample_size(0.16, 0.012, 0.99).expect("in domain");
    assert!(tighter_margin > base);
    assert!(higher_confidence > base);
    assert!(smaller_deviation < base);

    // Halving the margin exactly quadruples the requirement before
    // rounding, so allow one count of ceiling slack.
    assert!(tighter_margin >= base * 4 - 4 && tighter_margin <= base * 4 + 4);
}

/// Degenerate margins, confidences, and deviations have no sample size.
#[test]
fn mean_sample_size_rejects_out_of_domain_parameters() {
    assert_eq!(mean_sample_size(0.32, 0.0, 0.99), None);
    assert_eq!(mean_sample_size(0.32, -0.01, 0.99), None);
    assert_eq!(mean_sample_size(0.32, f64::INFINITY, 0.99), None);
    assert_eq!(mean_sample_size(0.32, 0.01, 0.0), None);
    assert_eq!(mean_sample_size(0.32, 0.01, 1.0), None);
    assert_eq!(mean_sample_size(-0.1, 0.01, 0.99), None);
    assert_eq!(mean_sample_size(f64::NAN, 0.01, 0.99), None);
}
