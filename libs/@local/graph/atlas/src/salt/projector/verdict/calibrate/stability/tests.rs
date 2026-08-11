#![expect(
    clippy::float_cmp,
    reason = "exactness assertions on constructed dyadic values are bit-precise contracts"
)]

use super::{StabilityBound, Support, evaluate};
use crate::{
    math::{DNonNegative, NonNegative, d_non_negative, d_positive, non_negative},
    salt::projector::verdict::calibrate::weighted_quantile,
};

/// `ln(2/δ)` at the recorded false-pass budget, from an independent evaluation.
const CONFIDENCE: f64 = 3.688_879_454_113_936_3;

/// A unit-weight population over the given `z` values.
fn balanced(values: &[f32]) -> Vec<(NonNegative, DNonNegative)> {
    values.iter().map(|&z| row(z, 1.0)).collect()
}

/// Types one raw `(z, weight)` row.
fn row(z: f32, weight: f64) -> (NonNegative, DNonNegative) {
    (
        NonNegative::new(z).expect("the fixture z is non-negative"),
        DNonNegative::new(weight).expect("the fixture weight is non-negative"),
    )
}

#[test]
fn quantile_matches_the_production_walk() {
    // Mixed dyadic weights, total exactly one, with atoms at the level boundaries.
    let population = [
        row(0.5, 0.25),
        row(1.0, 0.5),
        row(1.5, 0.125),
        row(2.0, 0.125),
    ];
    let support = Support::new(population);

    for numerator in 1..32_u32 {
        let level = f64::from(numerator) / 32.0;
        let walked = weighted_quantile(population, 1.0, level);
        assert_eq!(
            support.quantile(level).get().to_bits(),
            walked.get().to_bits(),
            "level {level}: binary-search crossing diverged from the production walk"
        );
    }
}

#[test]
fn quantile_ignores_zero_weight_rows_exactly_as_the_production_walk_does() {
    // A zero-weight row below the positive support and one inside it.
    let raw = [
        row(0.0, 0.0),
        row(0.5, 0.25),
        row(1.0, 0.5),
        row(1.25, 0.0),
        row(1.5, 0.125),
        row(2.0, 0.125),
    ];
    let support = Support::new(raw);

    for numerator in 1..32_u32 {
        let level = f64::from(numerator) / 32.0;
        let walked = weighted_quantile(raw, 1.0, level);
        assert_eq!(
            support.quantile(level).get().to_bits(),
            walked.get().to_bits(),
            "level {level}: the filtered support diverged from the production walk"
        );
    }

    // The convention pins the clamps. Level zero is the positive-mass minimum, not the
    // zero-weight row below it.
    assert_eq!(support.quantile(0.0), non_negative!(0.5));
    assert_eq!(support.quantile(1.0), non_negative!(2.0));
}

#[test]
fn zero_weight_rows_change_no_certificate_field() {
    let with_zero = [
        row(0.0, 0.0),
        row(1.0, 1.0),
        row(2.0, 1.0),
        row(3.0, 1.0),
        row(4.0, 1.0),
    ];
    let without = [row(1.0, 1.0), row(2.0, 1.0), row(3.0, 1.0), row(4.0, 1.0)];

    let masses = [d_non_negative!(4.0)];
    let evaluated_with = evaluate(with_zero, masses, 4, d_positive!(0.5));
    let evaluated_without = evaluate(without, masses, 4, d_positive!(0.5));

    assert_eq!(evaluated_with, evaluated_without);
}

#[test]
fn effective_support_of_balanced_dyadic_weights_is_the_count() {
    // Unit weights over a power-of-two count keep every share and square dyadic, so the
    // effective support is the count exactly.
    let support = Support::new(balanced(&[1.0; 64]));
    assert_eq!(support.effective(), d_positive!(64.0));
}

#[test]
fn effective_support_downweights_concentration() {
    // Weights (3, 1): shares (3/4, 1/4), squares sum 5/8, effective 8/5 - all dyadic-exact.
    let support = Support::new([row(1.0, 3.0), row(2.0, 1.0)]);
    assert_eq!(support.effective(), d_positive!(1.6));
}

#[test]
fn thin_reviews_fail_the_legibility_floor() {
    // The thin-reviews shape is one resolving verdict with three balanced pairs. The floor at
    // q = 0.25, δ = 0.05 is 29.51 effective pairs, so the run fails on the floor conjunct
    // before the gap is consulted.
    let certificate = evaluate(
        balanced(&[1.0, 1.0, 1.0]),
        [d_non_negative!(3.0)],
        3,
        d_positive!(0.5),
    );

    assert!((certificate.effective_support.get() - 3.0).abs() < 1e-12);
    assert!(certificate.epsilon_zero.get() > certificate.quantile.get());
    assert!(!certificate.pass);
    // With one resolving verdict the type-level support reads exactly one, maximally thin.
    assert_eq!(certificate.type_effective_support, d_positive!(1.0));
    // The direct predicate is authoritative, and the persisted fields replay it.
    assert_eq!(
        certificate.pass,
        certificate.epsilon_zero.get() <= certificate.quantile.get()
            && certificate.gap.get() <= certificate.tau.get()
    );
}

#[test]
fn healthy_balanced_pairs_pass_and_the_suite_can_show_it() {
    // Sixty-four balanced pairs at one point: ε₀ = √(ln40/128) ≈ 0.1698 clears the floor and
    // the gap is zero everywhere, so the certificate passes - the instrument provably can.
    let certificate = evaluate(
        balanced(&[1.0; 64]),
        [d_non_negative!(64.0)],
        64,
        d_positive!(0.5),
    );

    assert_eq!(certificate.effective_support, d_positive!(64.0));
    assert_eq!(
        certificate.epsilon_zero,
        d_positive!(0.169_762_689_467_577_44)
    );
    assert_eq!(certificate.gap, d_non_negative!(0.0));
    assert!(certificate.pass);

    // The gap never exceeds τ on (0, q], so the sup is the domain endpoint and attained, and
    // n* is the legibility floor itself.
    assert_eq!(
        certificate.bound,
        StabilityBound::Finite {
            support: d_positive!(29.511_035_632_911_49),
            attained: true,
        }
    );
    // Comparator equivalence at an attained bound: PASS ⟺ n_eff ≥ n*.
    assert!(certificate.effective_support >= d_positive!(29.511_035_632_911_49));
}

#[test]
fn the_eight_point_shape_persists_an_unattained_bound() {
    // The unit-weight shape (0, 1, ..., 1) with τ = 0.5 makes G vanish on (0, 1/8) and jump to
    // one at ε = 1/8. The safe set is the open interval, its sup is not attained, and
    // n* = ln40 · 32.
    let mut values = [1.0_f32; 8];
    values[0] = 0.0;
    let certificate = evaluate(
        balanced(&values),
        [d_non_negative!(8.0)],
        8,
        d_positive!(0.5),
    );

    assert_eq!(
        certificate.bound,
        StabilityBound::Finite {
            support: d_positive!(118.044_142_531_645_96),
            attained: false,
        }
    );
    // The decision came from the direct predicate: ε₀ ≈ 0.48 fails the floor.
    assert_eq!(certificate.effective_support, d_positive!(8.0));
    assert_eq!(
        certificate.epsilon_zero,
        d_positive!(0.480_161_395_659_960_35)
    );
    assert!(!certificate.pass);
    // Comparator equivalence at an unattained bound: PASS ⟺ n_eff > n*.
    assert_eq!(
        certificate.pass,
        certificate.effective_support > d_positive!(118.044_142_531_645_96)
    );
}

#[test]
fn an_atom_boundary_at_the_level_is_unattainable() {
    // The unit-weight shape (0, 10, 10, 10) puts the first prefix fraction exactly at q, so
    // the interval width is ten for every ε in the domain - a cliff wider than τ that no mass
    // stabilizes.
    let certificate = evaluate(
        balanced(&[0.0, 10.0, 10.0, 10.0]),
        [d_non_negative!(4.0)],
        4,
        d_positive!(0.5),
    );

    assert_eq!(certificate.bound, StabilityBound::Unattainable);
    assert!(!certificate.pass);
    // Past the floor the lower endpoint clamps at the positive-mass minimum, so the persisted
    // gap reads the population's full width.
    assert_eq!(certificate.gap, d_non_negative!(10.0));
}

#[test]
fn the_gap_at_epsilon_zero_uses_the_clamped_lower_endpoint() {
    // The unit-weight shape (1, 2, 3, 4) gives ε₀ ≈ 0.679, past q, so the lower level clamps
    // at the minimum and the upper level 0.929 walks to the maximum. The gap is exactly three.
    let certificate = evaluate(
        balanced(&[1.0, 2.0, 3.0, 4.0]),
        [d_non_negative!(4.0)],
        4,
        d_positive!(0.5),
    );

    assert_eq!(certificate.effective_support, d_positive!(4.0));
    assert_eq!(
        certificate.epsilon_zero,
        d_positive!(0.679_050_757_870_309_8)
    );
    assert_eq!(certificate.gap, d_non_negative!(3.0));
    assert!(!certificate.pass);
}

#[test]
fn the_certificate_records_its_regime() {
    let certificate = evaluate(
        balanced(&[1.0; 4]),
        [d_non_negative!(2.0), d_non_negative!(2.0)],
        4,
        d_positive!(0.25),
    );

    assert_eq!(certificate.quantile.get(), 0.25);
    assert_eq!(certificate.delta.get(), 0.05);
    assert_eq!(certificate.kappa, d_positive!(1.0));
    assert_eq!(certificate.temperature, d_positive!(0.25));
    assert_eq!(certificate.tau, d_positive!(0.25));
    assert_eq!(certificate.pairs, 4);
    assert_eq!(certificate.mass, d_non_negative!(4.0));
    // The echoed tolerance can never disagree with the fields it derives from.
    assert_eq!(
        certificate.tau.get(),
        certificate.kappa.get() * certificate.temperature.get()
    );
    // ln(2/δ) enters ε₀ and n*, and the recorded fields let a reader recompute both.
    assert_eq!(
        certificate.epsilon_zero.get(),
        (CONFIDENCE / (2.0 * certificate.effective_support.get())).sqrt()
    );
}

#[test]
fn type_effective_support_ignores_zero_mass_types() {
    // Masses (3, 1, 0) total four with squares ten, so the support is 1.6 and the zero-mass
    // type is not a type for the concentration reading.
    let certificate = evaluate(
        balanced(&[1.0; 4]),
        [
            d_non_negative!(3.0),
            d_non_negative!(1.0),
            DNonNegative::ZERO,
        ],
        4,
        d_positive!(0.5),
    );
    assert_eq!(certificate.type_effective_support, d_positive!(1.6));

    // Balanced masses (2, 2) read exactly two.
    let certificate = evaluate(
        balanced(&[1.0; 4]),
        [d_non_negative!(2.0), d_non_negative!(2.0)],
        4,
        d_positive!(0.5),
    );
    assert_eq!(certificate.type_effective_support, d_positive!(2.0));
}
