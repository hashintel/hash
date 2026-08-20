//! Certificates for the target objective's batch term.
//!
//! Dyadic fixtures produce exactly representable readings, so estimands, forces, and the
//! scale pull assert exact contracts, and the finite-difference certificates bound their
//! quotients around them.

#![expect(
    clippy::float_cmp,
    reason = "the dyadic fixtures produce exactly representable readings, so the asserted \
              constants are exact contracts"
)]

use hashql_core::id::{Id as _, IdSlice};

use super::{
    CappedDrawLaw, ContrastEnergy, GradientField, Penalty, TargetEstimator, TargetUnit,
    fan_scale_pull, released_weight,
};
use crate::{
    identity::NodeRowId,
    math::{
        DNonNegative, DPositive, DVec2, FinitePointField, NonNegative, Positive,
        PositiveUnitFraction, UnitFraction, Vec2, nz,
    },
    salt::projector::gauge::{DuplicateClassId, GaugeAnchors},
};

fn unit(
    source: u64,
    target: u64,
    ruler: f32,
    weight: f64,
    inclusion: f64,
) -> TargetUnit<NodeRowId> {
    TargetUnit {
        source: NodeRowId::new(source),
        target: NodeRowId::new(target),
        ruler: Positive::new(ruler).expect("fixture rulers are positive"),
        weight: DNonNegative::new(weight).expect("fixture weights are non-negative"),
        inclusion: PositiveUnitFraction::new(inclusion)
            .expect("fixture inclusion probabilities lie inside (0, 1]"),
    }
}

fn estimator(
    scale: f32,
    margin: f32,
    population: f64,
    activation: f32,
    penalty: Penalty,
) -> TargetEstimator {
    TargetEstimator::new(
        ContrastEnergy::new(
            Positive::new(scale).expect("fixture scales are positive"),
            NonNegative::new(margin).expect("fixture margins are non-negative"),
        ),
        penalty,
        DPositive::new(population).expect("fixture population weights are positive"),
        NonNegative::new(activation).expect("fixture activations are non-negative"),
    )
}

fn fields(rows: usize) -> (GradientField<NodeRowId>, GradientField<NodeRowId>) {
    (GradientField::new(rows), GradientField::new(rows))
}

/// A two-unit fixture whose coordinates, units, and `W = 4`, `s = 2`, `m = 0.25` constants
/// land every reading and every gradient entry on exactly representable values.
fn dyadic_fixture() -> ([Vec2; 4], [Vec2; 4], [TargetUnit<NodeRowId>; 2]) {
    let canonical = [
        Vec2::new(0.0, 0.0),
        Vec2::new(2.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(2.0, 1.0),
    ];
    let zero = [
        Vec2::new(0.0, 0.0),
        Vec2::new(0.0, 4.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(2.0, 0.0),
    ];
    let units = [unit(0, 1, 0.5, 0.5, 0.25), unit(2, 3, 1.0, 1.0, 0.5)];

    (canonical, zero, units)
}

#[test]
fn the_reading_and_the_fields_are_exact_on_a_dyadic_batch() {
    let (canonical, zero, units) = dyadic_fixture();
    let (mut canonical_field, mut zero_field) = fields(4);

    let reading = estimator(2.0, 0.25, 4.0, 1.0, Penalty::Identity)
        .evaluate(
            FinitePointField::new_unchecked(IdSlice::from_raw(&canonical)),
            FinitePointField::new_unchecked(IdSlice::from_raw(&zero)),
            &units,
            &mut canonical_field,
            &mut zero_field,
        )
        .expect("the dyadic fixture reading is finite");

    // Unit one: v = (2·2 − 4)/0.5 + 0.25 = 0.25 at mass 0.5/(4·0.25) = 0.5.
    // Unit two: v = (2·2 − 1)/1 + 0.25 = 3.25 at mass 1/(4·0.5) = 0.5.
    assert_eq!(reading.estimand, 0.125 + 1.625);
    // Pull: 0.5·(2/0.5) + 0.5·(2/1) = 3.
    assert_eq!(reading.scale_pull, 3.0);

    let canonical_entries = canonical_field.as_slice();
    assert_eq!(canonical_entries[NodeRowId::new(0)], DVec2::new(-2.0, 0.0));
    assert_eq!(canonical_entries[NodeRowId::new(1)], DVec2::new(2.0, 0.0));
    assert_eq!(canonical_entries[NodeRowId::new(2)], DVec2::new(-1.0, 0.0));
    assert_eq!(canonical_entries[NodeRowId::new(3)], DVec2::new(1.0, 0.0));

    let zero_entries = zero_field.as_slice();
    assert_eq!(zero_entries[NodeRowId::new(0)], DVec2::new(0.0, 1.0));
    assert_eq!(zero_entries[NodeRowId::new(1)], DVec2::new(0.0, -1.0));
    assert_eq!(zero_entries[NodeRowId::new(2)], DVec2::new(0.5, 0.0));
    assert_eq!(zero_entries[NodeRowId::new(3)], DVec2::new(-0.5, 0.0));
}

#[test]
fn the_activation_scales_every_force_and_never_the_reading() {
    let (canonical, zero, units) = dyadic_fixture();
    let canonical = FinitePointField::new_unchecked(IdSlice::from_raw(&canonical));
    let zero = FinitePointField::new_unchecked(IdSlice::from_raw(&zero));

    let mut readings = Vec::new();
    let mut gradients = Vec::new();
    for activation in [1.0, 0.0, 2.0] {
        let (mut canonical_field, mut zero_field) = fields(4);
        readings.push(
            estimator(2.0, 0.25, 4.0, activation, Penalty::Identity)
                .evaluate(
                    canonical,
                    zero,
                    &units,
                    &mut canonical_field,
                    &mut zero_field,
                )
                .expect("the dyadic fixture reading is finite"),
        );
        gradients.push((canonical_field, zero_field));
    }

    // The reading is the estimand at every activation.
    assert_eq!(readings[1].estimand, readings[0].estimand);
    assert_eq!(readings[2].estimand, readings[0].estimand);

    // Zero activation runs the same fold and lands exactly zero force everywhere.
    assert_eq!(readings[1].scale_pull, 0.0);
    for row in 0..4 {
        let row = NodeRowId::new(row);
        assert_eq!(gradients[1].0.as_slice()[row], DVec2::ZERO);
        assert_eq!(gradients[1].1.as_slice()[row], DVec2::ZERO);
    }

    // A doubled activation exactly doubles every force on the dyadic fixture.
    assert_eq!(readings[2].scale_pull, 2.0 * readings[0].scale_pull);
    for row in 0..4 {
        let row = NodeRowId::new(row);
        assert_eq!(
            gradients[2].0.as_slice()[row],
            gradients[0].0.as_slice()[row] * 2.0
        );
        assert_eq!(
            gradients[2].1.as_slice()[row],
            gradients[0].1.as_slice()[row] * 2.0
        );
    }
}

#[test]
fn the_full_inclusion_divisor_is_unbiased_where_the_group_factor_is_not() {
    // Relation type A holds {a1, a2} and type B holds {b1}, with one type drawn per batch
    // under cap one.
    let law = CappedDrawLaw::new(nz!(1), nz!(2), nz!(1));
    let inside_a = law.inclusion(nz!(2));
    let inside_b = law.inclusion(nz!(1));
    assert_eq!(inside_a.get(), 0.25);
    assert_eq!(inside_b.get(), 0.5);

    let canonical = [
        Vec2::new(0.0, 0.0),
        Vec2::new(1.0, 0.0),
        Vec2::new(0.0, 2.0),
        Vec2::new(0.0, 8.0),
    ];
    let zero = [
        Vec2::new(0.0, 0.0),
        Vec2::new(3.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(0.0, 3.0),
    ];
    // v(a1) = 1 − 3 = −2, v(a2) = 6 − 2 = 4, v(b1) = 2 − 1 = 1 at unit rulers.
    let population = [
        unit(0, 1, 1.0, 0.5, inside_a.get()),
        unit(2, 3, 1.0, 0.5, inside_a.get()),
        unit(0, 2, 1.0, 1.0, inside_b.get()),
    ];
    let estimator = estimator(1.0, 0.0, 2.0, 1.0, Penalty::Identity);
    let canonical = FinitePointField::new_unchecked(IdSlice::from_raw(&canonical));
    let zero = FinitePointField::new_unchecked(IdSlice::from_raw(&zero));
    let (mut canonical_field, mut zero_field) = fields(4);

    // The declared mean, read through the same fold with every inclusion at one.
    let everyone: Vec<_> = population
        .iter()
        .map(|&member| TargetUnit {
            inclusion: PositiveUnitFraction::ONE,
            ..member
        })
        .collect();
    let declared = estimator
        .evaluate(
            canonical,
            zero,
            &everyone,
            &mut canonical_field,
            &mut zero_field,
        )
        .expect("the declared-mean fixture reading is finite")
        .estimand;
    assert_eq!(declared, 1.0);

    // The draw law admits three batches: {a1} and {a2} at probability 1/4 each, {b1} at 1/2.
    let mut expectation = 0.0_f64;
    for (probability, member) in [(0.25_f64, 0_usize), (0.25, 1), (0.5, 2)] {
        canonical_field.reset();
        zero_field.reset();
        let drawn = estimator
            .evaluate(
                canonical,
                zero,
                &population[member..=member],
                &mut canonical_field,
                &mut zero_field,
            )
            .expect("the drawn fixture reading is finite");
        expectation = probability.mul_add(f64::from(drawn.estimand), expectation);
    }
    assert_eq!(expectation, f64::from(declared));

    // The released group-factor scaling G/g corrects type selection alone. Its expectation
    // is the per-type clipped objective, half of A's mass gone, and not the declared mean.
    let masses = [0.5 * -2.0, 0.5 * 4.0, 1.0 * 1.0];
    let group_factor = 2.0;
    let mut clipped_expectation = 0.0_f64;
    for (probability, member) in [(0.25, 0), (0.25, 1), (0.5, 2)] {
        clipped_expectation += probability * group_factor * masses[member] / 2.0;
    }
    assert_eq!(clipped_expectation, 0.75);
    assert_ne!(clipped_expectation, f64::from(declared));
}

#[test]
fn a_coincident_side_counts_its_value_and_folds_no_pull() {
    // Canonical coincidence: the value reads, the canonical field and the pull stay zero.
    let canonical = [Vec2::new(1.0, 1.0), Vec2::new(1.0, 1.0)];
    let zero = [Vec2::new(0.0, 0.0), Vec2::new(0.0, 2.0)];
    let (mut canonical_field, mut zero_field) = fields(2);
    let reading = estimator(2.0, 0.25, 1.0, 1.0, Penalty::Identity)
        .evaluate(
            FinitePointField::new_unchecked(IdSlice::from_raw(&canonical)),
            FinitePointField::new_unchecked(IdSlice::from_raw(&zero)),
            &[unit(0, 1, 1.0, 1.0, 1.0)],
            &mut canonical_field,
            &mut zero_field,
        )
        .expect("the coincident fixture reading is finite");
    assert_eq!(reading.estimand, -1.75);
    assert_eq!(reading.scale_pull, 0.0);
    assert_eq!(canonical_field.as_slice()[NodeRowId::new(0)], DVec2::ZERO);
    assert_eq!(canonical_field.as_slice()[NodeRowId::new(1)], DVec2::ZERO);
    assert_eq!(
        zero_field.as_slice()[NodeRowId::new(0)],
        DVec2::new(0.0, 1.0)
    );
    assert_eq!(
        zero_field.as_slice()[NodeRowId::new(1)],
        DVec2::new(0.0, -1.0)
    );

    // Zero coincidence: the mirror case, with the pull live through the canonical distance.
    let canonical = [Vec2::new(0.0, 0.0), Vec2::new(2.0, 0.0)];
    let zero = [Vec2::new(5.0, 5.0), Vec2::new(5.0, 5.0)];
    let (mut canonical_field, mut zero_field) = fields(2);
    let reading = estimator(2.0, 0.25, 1.0, 1.0, Penalty::Identity)
        .evaluate(
            FinitePointField::new_unchecked(IdSlice::from_raw(&canonical)),
            FinitePointField::new_unchecked(IdSlice::from_raw(&zero)),
            &[unit(0, 1, 1.0, 1.0, 1.0)],
            &mut canonical_field,
            &mut zero_field,
        )
        .expect("the coincident fixture reading is finite");
    assert_eq!(reading.estimand, 4.25);
    assert_eq!(reading.scale_pull, 2.0);
    assert_eq!(zero_field.as_slice()[NodeRowId::new(0)], DVec2::ZERO);
    assert_eq!(zero_field.as_slice()[NodeRowId::new(1)], DVec2::ZERO);
    assert_eq!(
        canonical_field.as_slice()[NodeRowId::new(0)],
        DVec2::new(-2.0, 0.0)
    );
    assert_eq!(
        canonical_field.as_slice()[NodeRowId::new(1)],
        DVec2::new(2.0, 0.0)
    );
}

#[test]
fn overflowed_violation_diverges() {
    // A minimum-positive ruler overflows the violation to +∞ in working precision while every
    // input is individually admitted. The fold carries the poison to the finish, and the
    // refusal returns as the diverged raw instead of unwinding.
    let canonical = [Vec2::new(0.0, 0.0), Vec2::new(4.0, 0.0)];
    let zero = [Vec2::new(0.0, 0.0), Vec2::new(0.0, 0.0)];
    let (mut canonical_field, mut zero_field) = fields(2);

    let diverged = estimator(2.0, 0.0, 4.0, 1.0, Penalty::Identity)
        .evaluate(
            FinitePointField::new_unchecked(IdSlice::from_raw(&canonical)),
            FinitePointField::new_unchecked(IdSlice::from_raw(&zero)),
            &[unit(0, 1, f32::MIN_POSITIVE, 1.0, 0.5)],
            &mut canonical_field,
            &mut zero_field,
        )
        .expect_err("an overflowed violation cannot finish into a reading");

    assert!(diverged.raw.is_infinite());
}

#[test]
fn the_draw_law_prices_inclusion_as_the_exact_product() {
    let law = CappedDrawLaw::new(nz!(1), nz!(4), nz!(2));
    assert_eq!(law.inclusion(nz!(8)).get(), 0.0625);

    // A type no larger than the cap contributes all its edges when selected.
    let law = CappedDrawLaw::new(nz!(3), nz!(4), nz!(8));
    assert_eq!(law.inclusion(nz!(5)).get(), 0.75);

    // Every type drawn and every edge kept prices certainty.
    let law = CappedDrawLaw::new(nz!(2), nz!(2), nz!(3));
    assert_eq!(law.inclusion(nz!(3)).get(), 1.0);
}

#[test]
fn the_released_weight_is_the_retained_factor_census() {
    let confidence = UnitFraction::new(0.5).expect("one half lies inside [0, 1]");
    let normalization = PositiveUnitFraction::new(0.25).expect("one quarter lies inside (0, 1]");
    let strength = NonNegative::new(3.0).expect("three is non-negative");
    assert_eq!(
        released_weight(confidence, normalization, strength).get(),
        0.375
    );

    // Zero confidence folds in as a zero-force unit.
    let scored_zero = UnitFraction::new(0.0).expect("zero lies inside [0, 1]");
    assert_eq!(
        released_weight(scored_zero, normalization, strength).get(),
        0.0
    );

    // The strength multiplier is exactly one while the strength head is off.
    let head_off = NonNegative::new(1.0).expect("one is non-negative");
    assert_eq!(
        released_weight(confidence, normalization, head_off).get(),
        0.125
    );
}

/// Widens fixture coordinates for the f64 mirrors.
fn widen(points: &[Vec2]) -> Vec<(f64, f64)> {
    points
        .iter()
        .map(|point| (f64::from(point.x()), f64::from(point.y())))
        .collect()
}

/// An f64 mirror of the estimand at a fixed alignment scale, for finite differences.
#[expect(
    clippy::suboptimal_flops,
    reason = "the mirror states the estimand's defining expression verbatim"
)]
fn mirror_estimand(
    canonical: &[(f64, f64)],
    zero: &[(f64, f64)],
    units: &[(usize, usize, f64, f64, f64)],
    scale: f64,
    margin: f64,
    population_weight: f64,
    penalty: impl Fn(f64) -> f64,
) -> f64 {
    let distance = |points: &[(f64, f64)], lhs: usize, rhs: usize| {
        let (dx, dy) = (points[lhs].0 - points[rhs].0, points[lhs].1 - points[rhs].1);
        dx.hypot(dy)
    };

    let mut total = 0.0;
    for &(source, target, ruler, weight, inclusion) in units {
        let violation =
            (scale * distance(canonical, source, target) - distance(zero, source, target)) / ruler
                + margin;
        total += weight / (population_weight * inclusion) * penalty(violation);
    }

    total
}

#[test]
fn field_partials_match_finite_differences_at_a_fixed_scale() {
    let canonical = [
        Vec2::new(0.3, -0.2),
        Vec2::new(2.1, 0.7),
        Vec2::new(-1.4, 1.9),
        Vec2::new(0.9, -2.3),
    ];
    let zero = [
        Vec2::new(0.1, 0.4),
        Vec2::new(1.7, -0.6),
        Vec2::new(-0.8, 2.2),
        Vec2::new(1.3, -1.1),
    ];
    let units = [
        unit(0, 1, 0.7, 0.5, 0.25),
        unit(1, 2, 1.3, 0.75, 0.5),
        unit(2, 3, 0.4, 0.25, 1.0),
    ];
    let specs = [
        (0_usize, 1_usize, 0.7, 0.5, 0.25),
        (1, 2, 1.3, 0.75, 0.5),
        (2, 3, 0.4, 0.25, 1.0),
    ];
    // The quadratic hinge is smooth wherever the fixture evaluates and dead below zero.
    let mirror_hinge = |violation: f64| {
        if violation > 0.0 {
            violation * violation
        } else {
            0.0
        }
    };

    let (mut canonical_field, mut zero_field) = fields(4);
    estimator(1.25, 0.1, 2.0, 1.0, Penalty::QuadraticHinge)
        .evaluate(
            FinitePointField::new_unchecked(IdSlice::from_raw(&canonical)),
            FinitePointField::new_unchecked(IdSlice::from_raw(&zero)),
            &units,
            &mut canonical_field,
            &mut zero_field,
        )
        .expect("the hinge fixture reading is finite");

    let canonical_mirror = widen(&canonical);
    let zero_mirror = widen(&zero);
    let total = |canonical_points: &[(f64, f64)], zero_points: &[(f64, f64)]| {
        mirror_estimand(
            canonical_points,
            zero_points,
            &specs,
            1.25,
            0.1,
            2.0,
            mirror_hinge,
        )
    };

    let step = 1e-4;
    for row in 0..4 {
        for component in 0..2 {
            for side in 0..2 {
                let points = if side == 0 {
                    &canonical_mirror
                } else {
                    &zero_mirror
                };
                let mut plus = points.clone();
                let mut minus = points.clone();
                if component == 0 {
                    plus[row].0 += step;
                    minus[row].0 -= step;
                } else {
                    plus[row].1 += step;
                    minus[row].1 -= step;
                }
                let reference = if side == 0 {
                    (total(&plus, &zero_mirror) - total(&minus, &zero_mirror)) / (2.0 * step)
                } else {
                    (total(&canonical_mirror, &plus) - total(&canonical_mirror, &minus))
                        / (2.0 * step)
                };

                let field = if side == 0 {
                    &canonical_field
                } else {
                    &zero_field
                };
                let entry = field.as_slice()[NodeRowId::from_usize(row)];
                let evaluated = if component == 0 { entry.x() } else { entry.y() };
                assert!(
                    (evaluated - reference).abs() < 1e-5,
                    "row {row} side {side} component {component}: {evaluated} vs {reference}"
                );
            }
        }
    }
}

/// An f64 mirror of the closed-form alignment scale, for the live-refit certificate.
#[expect(
    clippy::suboptimal_flops,
    reason = "the mirror states the closed form's defining sums verbatim"
)]
fn mirror_scale(source: &[(f64, f64)], target: &[(f64, f64)]) -> f64 {
    #[expect(
        clippy::cast_precision_loss,
        reason = "fixture counts are tiny integers, exactly representable"
    )]
    let count = source.len() as f64;
    let centre = |points: &[(f64, f64)]| {
        let (mut x, mut y) = (0.0, 0.0);
        for &(px, py) in points {
            x += px;
            y += py;
        }
        (x / count, y / count)
    };
    let (source_x, source_y) = centre(source);
    let (target_x, target_y) = centre(target);

    let (mut dot, mut perp, mut variance) = (0.0_f64, 0.0_f64, 0.0_f64);
    for (&(sx, sy), &(tx, ty)) in source.iter().zip(target) {
        let (ux, uy) = (sx - source_x, sy - source_y);
        let (vx, vy) = (tx - target_x, ty - target_y);
        dot += ux * vx + uy * vy;
        perp += ux * vy - uy * vx;
        variance += ux * ux + uy * uy;
    }

    dot.hypot(perp) / variance
}

#[test]
fn the_scale_channel_completes_the_derivative_through_a_live_refit() {
    // Rows zero through three anchor the gauge, rows four and five only bear units.
    let canonical = [
        Vec2::new(0.0, 0.0),
        Vec2::new(4.0, 0.0),
        Vec2::new(1.0, 3.0),
        Vec2::new(-2.0, 5.0),
        Vec2::new(2.0, -1.0),
        Vec2::new(-1.0, -2.0),
    ];
    let zero = [
        Vec2::new(0.5, 0.25),
        Vec2::new(3.0, 1.0),
        Vec2::new(1.5, 3.5),
        Vec2::new(-1.0, 4.0),
        Vec2::new(1.0, -1.0),
        Vec2::new(0.0, -3.0),
    ];
    let units = [unit(1, 4, 0.8, 0.5, 0.5), unit(4, 5, 1.1, 1.0, 0.25)];
    let specs = [(1_usize, 4_usize, 0.8, 0.5, 0.5), (4, 5, 1.1, 1.0, 0.25)];

    let gauge = GaugeAnchors::freeze(
        Box::new([0, 1, 2, 3].map(NodeRowId::new)),
        Box::new([0, 1, 2, 3].map(DuplicateClassId::new)),
        FinitePointField::new_unchecked(IdSlice::from_raw(&zero)),
        None,
        None,
    )
    .expect("the generic fixture is a valid gauge");
    let fit = gauge
        .fit(
            FinitePointField::new_unchecked(IdSlice::from_raw(&canonical)),
            FinitePointField::new_unchecked(IdSlice::from_raw(&zero)),
            None,
        )
        .expect("the generic fixture fits");

    let (mut canonical_field, mut zero_field) = fields(6);
    let reading = estimator(fit.scale().get(), 0.1, 2.0, 1.0, Penalty::Identity)
        .evaluate(
            FinitePointField::new_unchecked(IdSlice::from_raw(&canonical)),
            FinitePointField::new_unchecked(IdSlice::from_raw(&zero)),
            &units,
            &mut canonical_field,
            &mut zero_field,
        )
        .expect("the live-refit fixture reading is finite");
    fan_scale_pull(
        reading.scale_pull,
        &fit,
        gauge.rows(),
        &mut canonical_field,
        &mut zero_field,
    );

    let canonical_mirror = widen(&canonical);
    let zero_mirror = widen(&zero);

    // The whole estimator with the refit inside: the scale is the anchors' closed form.
    let total = |canonical_points: &[(f64, f64)], zero_points: &[(f64, f64)]| {
        let scale = mirror_scale(&canonical_points[..4], &zero_points[..4]);
        mirror_estimand(
            canonical_points,
            zero_points,
            &specs,
            scale,
            0.1,
            2.0,
            |violation| violation,
        )
    };

    let step = 1e-5;
    // Row one moves the fit and bears a unit. Rows two and three move the fit alone, and
    // row four bears units alone. Every channel combination meets its finite difference.
    for (row, side) in [(1_usize, 0_usize), (2, 0), (3, 1), (4, 0)] {
        for component in 0..2 {
            let points = if side == 0 {
                &canonical_mirror
            } else {
                &zero_mirror
            };
            let mut plus = points.clone();
            let mut minus = points.clone();
            if component == 0 {
                plus[row].0 += step;
                minus[row].0 -= step;
            } else {
                plus[row].1 += step;
                minus[row].1 -= step;
            }
            let reference = if side == 0 {
                (total(&plus, &zero_mirror) - total(&minus, &zero_mirror)) / (2.0 * step)
            } else {
                (total(&canonical_mirror, &plus) - total(&canonical_mirror, &minus)) / (2.0 * step)
            };

            let field = if side == 0 {
                &canonical_field
            } else {
                &zero_field
            };
            let entry = field.as_slice()[NodeRowId::from_usize(row)];
            let evaluated = if component == 0 { entry.x() } else { entry.y() };
            assert!(
                (evaluated - reference).abs() < 1e-5,
                "row {row} side {side} component {component}: {evaluated} vs {reference}"
            );
        }
    }
}
