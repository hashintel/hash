use alloc::collections::BTreeSet;
use core::num::NonZero;

use hashql_core::id::{Id as _, IdSlice};
use proptest::{arbitrary::any, prop_assert, property_test};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    acceptance_sample_size, keyed_rng, mean_sample_size, normal_quantile, sample_ids,
    sample_indices_vec, uniform_below,
};
use crate::math::{OpenUnitFraction, d_non_negative, d_positive, open_unit_fraction};

/// Creates a reproducible generator for a test case.
fn rng(seed: u64) -> Xoshiro256PlusPlus {
    Xoshiro256PlusPlus::seed_from_u64(seed)
}

#[test]
fn uniform_below_bound_one() {
    let mut rng = rng(7);
    let bound = NonZero::new(1).expect("one is not zero");

    for _ in 0..64 {
        assert_eq!(uniform_below(&mut rng, bound), 0);
    }
}

#[test]
fn uniform_below_residue_balance() {
    let mut rng = rng(42);
    let bound = NonZero::new(7).expect("seven is not zero");

    let mut counts = [0_u32; 7];
    let draws = 70_000;
    for _ in 0..draws {
        let value = uniform_below(&mut rng, bound);
        counts[usize::try_from(value).expect("a value below seven fits usize")] += 1;
    }

    // Modeling each draw as independent and uniform over the seven residues, the expected
    // count per residue is 10_000, with standard deviation about 92.6 (√(70_000 · 1/7 · 6/7)). The
    // ±10% margin is about 10.8 standard deviations under that model.
    for (residue, &count) in counts.iter().enumerate() {
        assert!(
            (9_000..=11_000).contains(&count),
            "residue {residue} drawn {count} times",
        );
    }
}

#[test]
fn uniform_below_seed_determinism() {
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
    assert!(
        first
            .array_windows::<2>()
            .any(|[left, right]| left != right)
    );
}

#[test]
fn acceptance_sample_size_hand_checked() {
    // ln(0.05) / ln(0.99) = 298.07..., which sits in the rule-of-three
    // neighbourhood.
    assert_eq!(
        acceptance_sample_size(open_unit_fraction!(0.01), open_unit_fraction!(0.95)),
        299
    );
    // ln(0.001)/ln(0.99) ≈ 687.32, rounded up to 688.
    assert_eq!(
        acceptance_sample_size(open_unit_fraction!(0.01), open_unit_fraction!(0.999)),
        688
    );
    assert_eq!(
        acceptance_sample_size(open_unit_fraction!(0.001), open_unit_fraction!(0.999_999)),
        13_809
    );
}

// The real-arithmetic budget satisfies (1 − p)ⁿ ≤ 1 − c < (1 − p)ⁿ⁻¹. These sampled parameter
// ranges keep counts representable by i32 and away from extreme underflow or saturation. The
// probability comparison allows an absolute tolerance of 10⁻¹².
#[property_test]
fn acceptance_sample_size_sufficient_minimal(
    #[strategy = 1e-6_f64..0.5] defect_rate: f64,
    #[strategy = 0.5_f64..(1.0 - 1e-9)] confidence: f64,
) {
    let samples = acceptance_sample_size(
        OpenUnitFraction::new(defect_rate).expect("the strategy stays interior"),
        OpenUnitFraction::new(confidence).expect("the strategy stays interior"),
    );
    let all_pass = |count: usize| {
        (1.0 - defect_rate).powi(i32::try_from(count).expect("sample sizes fit i32"))
    };

    prop_assert!(all_pass(samples) <= 1.0 - confidence + 1e-12);
    if samples > 0 {
        prop_assert!(all_pass(samples - 1) > 1.0 - confidence - 1e-12);
    }
}

#[property_test]
fn acceptance_sample_size_monotone(
    #[strategy = 1e-5_f64..0.4] defect_rate: f64,
    #[strategy = 0.5_f64..0.999] confidence: f64,
) {
    let interior = |value: f64| OpenUnitFraction::new(value).expect("the strategy stays interior");
    let base = acceptance_sample_size(interior(defect_rate), interior(confidence));
    let stricter_confidence =
        acceptance_sample_size(interior(defect_rate), interior(confidence + 5e-4));
    let looser_defect = acceptance_sample_size(interior(defect_rate * 1.5), interior(confidence));

    prop_assert!(stricter_confidence >= base);
    prop_assert!(looser_defect <= base);
}

#[property_test]
fn uniform_below_in_range(#[strategy = any::<u64>()] seed: u64, #[strategy = 1_u64..] bound: u64) {
    let bound = NonZero::new(bound).expect("the strategy starts at one");
    let value = uniform_below(&mut Xoshiro256PlusPlus::seed_from_u64(seed), bound);

    prop_assert!(value < bound.get());
}

#[test]
fn normal_quantile_tabulated() {
    // common tabulated quantiles, including the upper tail at 0.99
    for (probability, expected) in [
        (0.5, 0.0),
        (0.75, 0.674_489_750_196_082),
        (0.9, 1.281_551_565_544_6),
        (0.95, 1.644_853_626_951_472),
        (0.975, 1.959_963_984_540_054),
        (0.99, 2.326_347_874_040_841),
    ] {
        let quantile =
            normal_quantile(OpenUnitFraction::new(probability).expect("the case is interior"));
        assert!(
            (quantile - expected).abs() < 1e-8,
            "quantile({probability}) = {quantile}, expected {expected}",
        );
    }

    // additional tail values (the lower-tail approximation switches at 0.02425)
    for (probability, expected) in [
        (0.999, 3.090_232_306_167_813),
        (0.000_1, -3.719_016_485_455_68),
        (0.02, -2.053_748_910_631_823),
    ] {
        let quantile =
            normal_quantile(OpenUnitFraction::new(probability).expect("the case is interior"));
        assert!(
            (quantile - expected).abs() < 1e-8,
            "quantile({probability}) = {quantile}, expected {expected}",
        );
    }
}

#[test]
fn normal_quantile_antisymmetry() {
    for probability in [0.001, 0.02425, 0.1, 0.3, 0.49] {
        let interior = |value: f64| OpenUnitFraction::new(value).expect("the case stays interior");
        let lower = normal_quantile(interior(probability));
        let upper = normal_quantile(interior(1.0 - probability));
        assert!(
            (lower + upper).abs() < 1e-8,
            "quantile({probability}) = {lower} does not mirror {upper}",
        );
    }
}

#[test]
fn mean_sample_size_closed_form() {
    // ⌈(2.326348 · 0.32 / 0.012)²⌉ = ⌈3848.46…⌉ = 3849.
    assert_eq!(
        mean_sample_size(
            d_non_negative!(0.32),
            d_positive!(0.012),
            open_unit_fraction!(0.99)
        ),
        3849
    );
    assert_eq!(
        mean_sample_size(
            d_non_negative!(0.32),
            d_positive!(0.01),
            open_unit_fraction!(0.99)
        ),
        5542
    );
    // zero deviation gives a zero budget in the sizing formula
    assert_eq!(
        mean_sample_size(
            d_non_negative!(0.0),
            d_positive!(0.01),
            open_unit_fraction!(0.99)
        ),
        0
    );

    let base = mean_sample_size(
        d_non_negative!(0.32),
        d_positive!(0.012),
        open_unit_fraction!(0.99),
    );
    let tighter_margin = mean_sample_size(
        d_non_negative!(0.32),
        d_positive!(0.006),
        open_unit_fraction!(0.99),
    );
    let higher_confidence = mean_sample_size(
        d_non_negative!(0.32),
        d_positive!(0.012),
        open_unit_fraction!(0.999),
    );
    let smaller_deviation = mean_sample_size(
        d_non_negative!(0.16),
        d_positive!(0.012),
        open_unit_fraction!(0.99),
    );
    assert!(tighter_margin > base);
    assert!(higher_confidence > base);
    assert!(smaller_deviation < base);

    // Halving the margin quadruples the real-arithmetic budget before ceiling. The integer budgets
    // allow four counts of slack for rounding.
    assert!(tighter_margin >= base * 4 - 4 && tighter_margin <= base * 4 + 4);
}

#[test]
fn sample_indices_vec_without_replacement() {
    let population = 1_000_000;
    let count = 688;

    let picked = sample_indices_vec(rng(42), population, count);

    assert_eq!(picked.len(), count);

    let distinct: BTreeSet<usize> = picked.iter().collect();
    assert_eq!(distinct.len(), count);
    assert!(distinct.iter().all(|&index| index < population));
}

hashql_core::id::newtype! {
    /// A position within the test population.
    ///
    struct SampleId(u32)
}

#[test]
fn sample_ids_without_replacement() {
    let population = IdSlice::<SampleId, ()>::from_raw(&[(); 4096]);
    let count = 128;

    let picked: Vec<SampleId> = sample_ids(rng(42), population, count).collect();

    assert_eq!(picked.len(), count);

    let distinct: BTreeSet<SampleId> = picked.iter().copied().collect();
    assert_eq!(distinct.len(), count);
    assert!(distinct.iter().all(|id| id.as_usize() < population.len()));
}

#[test]
fn sample_ids_stream_parity() {
    let population = IdSlice::<SampleId, ()>::from_raw(&[(); 4096]);
    let count = 128;

    let typed: Vec<usize> = sample_ids(rng(42), population, count)
        .map(SampleId::as_usize)
        .collect();
    let raw: Vec<usize> = sample_indices_vec(rng(42), population.len(), count)
        .iter()
        .collect();

    assert_eq!(typed, raw);
}

#[test]
fn keyed_rng_replay() {
    let mut first = keyed_rng(42, 7, 0);
    let mut second = keyed_rng(42, 7, 0);

    let draws: Vec<u64> = core::iter::repeat_with(|| first.random::<u64>())
        .take(32)
        .collect();
    let replay: Vec<u64> = core::iter::repeat_with(|| second.random::<u64>())
        .take(32)
        .collect();

    assert_eq!(draws, replay);
    assert!(
        draws
            .array_windows::<2>()
            .any(|[left, right]| left != right)
    );
}

#[test]
fn keyed_rng_stream_separation() {
    /// Draws the first 32 values of the generator keyed by `(seed, key, index)`.
    fn stream(seed: u64, key: u64, index: u64) -> Vec<u64> {
        let mut rng = keyed_rng(seed, key, index);
        core::iter::repeat_with(|| rng.random::<u64>())
            .take(32)
            .collect()
    }

    let base = stream(42, 7, 0);

    assert_ne!(base, stream(43, 7, 0));
    assert_ne!(base, stream(42, 8, 0));
    assert_ne!(base, stream(42, 7, 1));
}
