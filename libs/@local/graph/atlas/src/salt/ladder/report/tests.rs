//! Unit tests of the report's aggregation core.
//!
//! The compile path needs a published generation and stays with the integration suites; the
//! aggregates, the displacement summaries, the argmax rule, and the certificate bound are pure and
//! verify here on hand-derived values.

use hashql_core::id::{Id as _, IdSlice};

use super::{EdgeTerm, argmax, certify, contract, displace};
use crate::{
    identity::NodeRowId,
    math::{FinitePointField, Vec2, d_finite, d_non_negative},
};

/// Wraps fixture points every test states as finite literals.
fn field(points: &[Vec2]) -> &FinitePointField<NodeRowId> {
    FinitePointField::new_unchecked(IdSlice::from_raw(points))
}

/// The engaged pair of mass 3 contracts by 2 and the pair of mass 1 expands by 3.
///
/// Hand-derived: the weighted sum is `3 · 2 + 1 · (-3) = 3` over mass 4, and the unweighted sum
/// is `-1` over 2 instances.
#[test]
fn contraction_weighs_the_trainer_mass() {
    let baseline = [
        Vec2::new(0.0, 0.0),
        Vec2::new(4.0, 0.0),
        Vec2::new(0.0, 3.0),
    ];
    let frame = [
        Vec2::new(0.0, 0.0),
        Vec2::new(2.0, 0.0),
        Vec2::new(0.0, 6.0),
    ];
    let terms = [
        EdgeTerm {
            source: NodeRowId::from_usize(0),
            target: NodeRowId::from_usize(1),
            mass: d_non_negative!(3.0),
        },
        EdgeTerm {
            source: NodeRowId::from_usize(0),
            target: NodeRowId::from_usize(2),
            mass: d_non_negative!(1.0),
        },
    ];

    let reading = contract(field(&baseline), field(&frame), terms);

    assert_eq!(reading.edge_count, 2);
    assert!((f64::from(reading.total_mass) - 4.0).abs() < 1e-12);
    assert!(
        (f64::from(reading.mass_weighted_mean) - 0.75).abs() < 1e-12,
        "3/4 expected, read {}",
        reading.mass_weighted_mean,
    );
    assert!(
        (f64::from(reading.unweighted_mean) - (-0.5)).abs() < 1e-12,
        "-1/2 expected, read {}",
        reading.unweighted_mean,
    );
    assert!((f64::from(reading.contracted_fraction) - 0.5).abs() < 1e-12);
}

/// An unchanged distance is not a contraction: ties stay out of the contracted count.
#[test]
fn contraction_ties_do_not_count() {
    let baseline = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 0.0)];
    let frame = [Vec2::new(2.0, 5.0), Vec2::new(3.0, 5.0)];
    let terms = [EdgeTerm {
        source: NodeRowId::from_usize(0),
        target: NodeRowId::from_usize(1),
        mass: d_non_negative!(7.0),
    }];

    let reading = contract(field(&baseline), field(&frame), terms);

    assert_eq!(reading.edge_count, 1);
    assert!(f64::from(reading.contracted_fraction).abs() < 1e-12);
    assert!(f64::from(reading.mass_weighted_mean).abs() < 1e-12);
    assert!(f64::from(reading.unweighted_mean).abs() < 1e-12);
}

/// An empty population reads as zeros, never as a division artifact.
#[test]
fn contraction_of_nothing_is_zero() {
    let baseline = [Vec2::new(0.0, 0.0)];
    let frame = [Vec2::new(1.0, 1.0)];

    let reading = contract(
        field(&baseline),
        field(&frame),
        core::iter::empty::<EdgeTerm>(),
    );

    assert_eq!(reading.edge_count, 0);
    assert!(f64::from(reading.total_mass).abs() < 1e-12);
    assert!(f64::from(reading.mass_weighted_mean).abs() < 1e-12);
    assert!(f64::from(reading.unweighted_mean).abs() < 1e-12);
    assert!(f64::from(reading.contracted_fraction).abs() < 1e-12);
}

/// The participant mask splits the displacement populations exactly.
///
/// Hand-derived: rows move by 0, 1, and 5; participants are rows 0 and 2, so the engaged side
/// reads mean 2.5 and RMS `sqrt(12.5)`, and the other side reads exactly 1 everywhere.
#[test]
fn displacement_splits_on_the_participant_mask() {
    let baseline = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 1.0),
        Vec2::new(2.0, 2.0),
    ];
    let frame = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 2.0),
        Vec2::new(5.0, 6.0),
    ];
    let participant = [true, false, true];

    let engaged = displace(field(&baseline), field(&frame), &participant, true);
    assert_eq!(engaged.rows, 2);
    assert!((f64::from(engaged.mean) - 2.5).abs() < 1e-12);
    assert!((f64::from(engaged.rms) - 12.5_f64.sqrt()).abs() < 1e-12);
    assert!((f64::from(engaged.max) - 5.0).abs() < 1e-12);

    let bystanders = displace(field(&baseline), field(&frame), &participant, false);
    assert_eq!(bystanders.rows, 1);
    assert!((f64::from(bystanders.mean) - 1.0).abs() < 1e-12);
    assert!((f64::from(bystanders.rms) - 1.0).abs() < 1e-12);
    assert!((f64::from(bystanders.max) - 1.0).abs() < 1e-12);
}

/// Ties keep the first index, an empty series reads the baseline, and an all-negative series
/// names the baseline as well: index zero states that no step beats doing nothing.
#[test]
fn argmax_keeps_the_first_and_defaults_to_the_baseline() {
    assert_eq!(
        argmax([
            d_finite!(1.0),
            d_finite!(3.0),
            d_finite!(3.0),
            d_finite!(2.0)
        ]),
        1
    );
    assert_eq!(argmax([]), 0);
    assert_eq!(argmax([d_finite!(-1.0), d_finite!(-5.0)]), 0);
}

/// A residual under the bound certifies and reports its measured values.
///
/// The expected residual derives from the same `f32` arithmetic the measurement performs: the
/// nominal `5e-4` shift quantizes at `1.0`'s grid before the exact nearby-value subtraction.
#[test]
fn certificate_reports_the_measured_residual() {
    let shifted = 1.0_f32 + 5.0e-4;
    let rebuilt = [Vec2::new(0.0, 0.0), Vec2::new(1.0, 1.0)];
    let published = [Vec2::new(0.0, 0.0), Vec2::new(1.0, shifted)];
    let expected = f64::from(shifted - 1.0_f32);

    let certificate = certify(field(&rebuilt), field(&published));

    assert!((f64::from(certificate.max_absolute_error) - expected).abs() < 1e-15);
    assert!((f64::from(certificate.mean_absolute_error) - expected / 4.0).abs() < 1e-15);
    assert!((f64::from(certificate.max_point_distance) - expected).abs() < 1e-12);
}

/// A residual at the bound refuses: the frames would describe a lookalike.
#[test]
#[should_panic(expected = "does not reproduce the published coordinate column")]
fn certificate_refuses_at_the_bound() {
    let rebuilt = [Vec2::new(0.0, 0.0)];
    let published = [Vec2::new(2.0e-3, 0.0)];

    let _certificate = certify(field(&rebuilt), field(&published));
}
