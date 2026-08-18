//! Certificates for the gauge alignment.
//!
//! A square constellation under scale 2 and a right-angle rotation, translated by integers,
//! lands every fit coefficient and both adjoint fields on exactly representable values, and the
//! Euler sums with them, so the recovery fixture asserts exact contracts. The finite-difference
//! certificate uses a generic constellation and an f64 mirror of the closed form.

#![expect(
    clippy::float_cmp,
    reason = "the exact fixtures produce exactly representable readings, so the asserted \
              constants are exact contracts"
)]

use hashql_core::id::{Id as _, IdSlice};

use super::{DuplicateClassId, GaugeAnchors, GaugeOrdinal, GaugeRefusal, SpreadFloor};
use crate::{
    identity::NodeRowId,
    math::{DNonNegative, DPositive, FinitePointField, Positive, Vec2},
};

/// Views a finite coordinate array as a proven-finite whole-corpus field.
fn frame(points: &[Vec2]) -> &FinitePointField<NodeRowId> {
    FinitePointField::new_unchecked(IdSlice::from_raw(points))
}

fn class(id: u32) -> DuplicateClassId {
    DuplicateClassId::new(id)
}

fn positive(value: f32) -> Positive {
    Positive::new(value).expect("test value is positive")
}

/// A gauge over corpus rows 1, 2, 4, 5 with distinct duplicate classes, frozen against
/// `snapshot`.
fn square_gauge(snapshot: &[Vec2]) -> GaugeAnchors<NodeRowId> {
    GaugeAnchors::freeze(
        Box::new([1, 2, 4, 5].map(NodeRowId::new)),
        Box::new([class(0), class(1), class(2), class(3)]),
        frame(snapshot),
        None,
        None,
    )
    .expect("the square fixture is a valid gauge")
}

/// Canonical square at corpus rows 1, 2, 4, 5. Rows 0 and 3 are non-anchor filler.
const CANONICAL: [Vec2; 6] = [
    Vec2::new(9.0, 9.0),
    Vec2::new(1.0, 0.0),
    Vec2::new(-1.0, 0.0),
    Vec2::new(-9.0, -9.0),
    Vec2::new(0.0, 1.0),
    Vec2::new(0.0, -1.0),
];

/// The canonical square under scale 2, rotation 90°, translation (1, −2), hand-applied.
const ZERO: [Vec2; 6] = [
    Vec2::new(7.0, 7.0),
    Vec2::new(1.0, 0.0),
    Vec2::new(1.0, -4.0),
    Vec2::new(-7.0, -7.0),
    Vec2::new(-1.0, -2.0),
    Vec2::new(3.0, -2.0),
];

/// Every fit coefficient lands exactly on this fixture, and so do the adjoint fields and the
/// Euler sums. Anchors sit at non-contiguous corpus rows, so the gather is also under test.
#[test]
fn recovers_an_exact_similarity_with_exact_adjoints() {
    let gauge = square_gauge(&ZERO);
    // Frozen spread: the zero-frame anchors are 2 from their centroid in every direction.
    assert_eq!(gauge.frozen_spread().get(), 2.0);
    assert_eq!(gauge.effective_count(), DNonNegative::from_usize(4));
    assert_eq!(gauge.len(), 4);

    let fit = gauge
        .fit(frame(&CANONICAL), frame(&ZERO), None)
        .expect("the exact fixture fits");

    assert_eq!(fit.scale().get(), 2.0);
    assert_eq!(fit.similarity().rotation().cos(), 0.0);
    assert_eq!(fit.similarity().rotation().sin(), 1.0);
    assert_eq!(fit.similarity().translation(), Vec2::new(1.0, -2.0));
    assert_eq!(fit.residual(), 0.0);

    // Hand-evaluated adjoints at anchor 0 (canonical (1, 0), centred zero (0, 2), D = 4):
    // canonical (Rᵀ·v − 2s·u)/D = ((2, 0) − (4, 0))/4, zero (R·u)/D = (0, 1)/4.
    assert_eq!(
        fit.canonical_adjoints()[GaugeOrdinal::new(0)],
        Vec2::new(-0.5, 0.0)
    );
    assert_eq!(
        fit.zero_adjoints()[GaugeOrdinal::new(0)],
        Vec2::new(0.0, 0.25)
    );

    // Euler laws: the scale is degree −1 in the canonical constellation and degree +1 in the
    // zero one, so the centred dot of each field with its adjoints reads ∓s exactly.
    let rows = [1_usize, 2, 4, 5];
    let canonical_euler: f32 = rows
        .iter()
        .enumerate()
        .map(|(ordinal, &row)| {
            let adjoint = fit.canonical_adjoints()[GaugeOrdinal::from_usize(ordinal)];
            CANONICAL[row].dot(adjoint)
        })
        .sum();
    let zero_centre = Vec2::new(1.0, -2.0);
    let zero_euler: f32 = rows
        .iter()
        .enumerate()
        .map(|(ordinal, &row)| {
            let adjoint = fit.zero_adjoints()[GaugeOrdinal::from_usize(ordinal)];
            (ZERO[row] - zero_centre).dot(adjoint)
        })
        .sum();
    assert_eq!(canonical_euler, -2.0);
    assert_eq!(zero_euler, 2.0);
}

/// An f64 mirror of the closed-form scale, for finite differences.
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

/// Both adjoint fields match central finite differences of the closed form on a generic
/// constellation.
#[test]
fn adjoints_match_finite_differences() {
    let canonical = [
        Vec2::new(0.0, 0.0),
        Vec2::new(4.0, 0.0),
        Vec2::new(1.0, 3.0),
        Vec2::new(-2.0, 5.0),
    ];
    let zero = [
        Vec2::new(0.5, 0.25),
        Vec2::new(3.0, 1.0),
        Vec2::new(1.5, 3.5),
        Vec2::new(-1.0, 4.0),
    ];

    let gauge = GaugeAnchors::freeze(
        Box::new([0, 1, 2, 3].map(NodeRowId::new)),
        Box::new([class(0), class(1), class(2), class(3)]),
        frame(&zero),
        None,
        None,
    )
    .expect("the generic fixture is a valid gauge");
    let fit = gauge
        .fit(frame(&canonical), frame(&zero), None)
        .expect("the generic fixture fits");

    let source: Vec<(f64, f64)> = canonical
        .iter()
        .map(|point| (f64::from(point.x()), f64::from(point.y())))
        .collect();
    let target: Vec<(f64, f64)> = zero
        .iter()
        .map(|point| (f64::from(point.x()), f64::from(point.y())))
        .collect();

    let step = 1e-5;
    for anchor in 0..4 {
        let ordinal = GaugeOrdinal::from_usize(anchor);

        for component in 0..2 {
            let mut plus = source.clone();
            let mut minus = source.clone();
            if component == 0 {
                plus[anchor].0 += step;
                minus[anchor].0 -= step;
            } else {
                plus[anchor].1 += step;
                minus[anchor].1 -= step;
            }
            let reference =
                (mirror_scale(&plus, &target) - mirror_scale(&minus, &target)) / (2.0 * step);
            let evaluated = if component == 0 {
                fit.canonical_adjoints()[ordinal].x()
            } else {
                fit.canonical_adjoints()[ordinal].y()
            };
            assert!(
                (f64::from(evaluated) - reference).abs() < 1e-6,
                "canonical adjoint {anchor}/{component}: {evaluated} vs {reference}"
            );

            let mut plus = target.clone();
            let mut minus = target.clone();
            if component == 0 {
                plus[anchor].0 += step;
                minus[anchor].0 -= step;
            } else {
                plus[anchor].1 += step;
                minus[anchor].1 -= step;
            }
            let reference =
                (mirror_scale(&source, &plus) - mirror_scale(&source, &minus)) / (2.0 * step);
            let evaluated = if component == 0 {
                fit.zero_adjoints()[ordinal].x()
            } else {
                fit.zero_adjoints()[ordinal].y()
            };
            assert!(
                (f64::from(evaluated) - reference).abs() < 1e-6,
                "zero adjoint {anchor}/{component}: {evaluated} vs {reference}"
            );
        }
    }
}

/// Translating the zero field moves the fitted translation alone: the centred quantities and
/// therefore both adjoint fields are bit-identical.
#[test]
fn adjoints_are_invariant_under_zero_field_translation() {
    let gauge = square_gauge(&ZERO);
    let fit = gauge
        .fit(frame(&CANONICAL), frame(&ZERO), None)
        .expect("the exact fixture fits");

    let shifted: Vec<Vec2> = ZERO
        .iter()
        .map(|point| Vec2::new(point.x() + 16.0, point.y() - 8.0))
        .collect();
    let shifted_gauge = square_gauge(&shifted);
    let shifted_fit = shifted_gauge
        .fit(frame(&CANONICAL), frame(&shifted), None)
        .expect("the shifted fixture fits");

    assert_eq!(fit.canonical_adjoints(), shifted_fit.canonical_adjoints());
    assert_eq!(fit.zero_adjoints(), shifted_fit.zero_adjoints());
    assert_eq!(fit.scale(), shifted_fit.scale());
    assert_eq!(
        shifted_fit.similarity().translation(),
        Vec2::new(17.0, -10.0)
    );
}

/// The minimum-spread rule binds at the freeze, inclusively at its edge.
#[test]
fn the_spread_floor_binds_at_the_freeze() {
    // Frozen spread is exactly 2, so a band of 0.5 reads a ratio of exactly 4.
    GaugeAnchors::freeze(
        Box::new([1, 2, 4, 5].map(NodeRowId::new)),
        Box::new([class(0), class(1), class(2), class(3)]),
        frame(&ZERO),
        Some(SpreadFloor {
            kappa: positive(4.0),
            band: positive(0.5),
        }),
        None,
    )
    .expect("the ratio meets the floor exactly, inclusively");

    let refused = GaugeAnchors::freeze(
        Box::new([1, 2, 4, 5].map(NodeRowId::new)),
        Box::new([class(0), class(1), class(2), class(3)]),
        frame(&ZERO),
        Some(SpreadFloor {
            kappa: positive(4.25),
            band: positive(0.5),
        }),
        None,
    );
    assert_eq!(
        refused,
        Err(GaugeRefusal::SpreadBelowFloor {
            ratio: DPositive::new_unchecked(4.0),
            kappa: positive(4.25),
        })
    );
}

/// The effective count deduplicates by class before the minimum binds.
#[test]
fn the_effective_count_deduplicates_by_class() {
    let rows: Box<[NodeRowId]> = Box::new([1, 2, 4, 5].map(NodeRowId::new));
    let classes: Box<[DuplicateClassId]> = Box::new([class(7), class(7), class(3), class(9)]);

    let refused = GaugeAnchors::freeze(
        rows.clone(),
        classes.clone(),
        frame(&ZERO),
        None,
        Some(positive(4.0)),
    );
    assert_eq!(
        refused,
        Err(GaugeRefusal::UndersizedEffectiveCount {
            effective: DNonNegative::from_usize(3),
            minimum: positive(4.0),
        })
    );

    let admitted = GaugeAnchors::freeze(rows, classes, frame(&ZERO), None, None)
        .expect("three effective anchors freeze without a declared minimum");
    assert_eq!(admitted.effective_count(), DNonNegative::from_usize(3));
}

/// A deformation orthogonal to the fit's normal equations leaves the similarity exactly in
/// place and lands whole in the residual, so the bar's reading is exact.
#[test]
fn the_residual_bar_binds_at_the_fit() {
    let canonical = [
        Vec2::new(1.0, 0.0),
        Vec2::new(-1.0, 0.0),
        Vec2::new(0.0, 1.0),
        Vec2::new(0.0, -1.0),
    ];
    // Identity similarity plus the orthogonal deformation (0, ±0.5): Σe = 0, Σu·e = 0,
    // Σu⊥·e = 0, so the fit stays the identity and the residual RMS is exactly 0.5.
    let zero = [
        Vec2::new(1.0, 0.5),
        Vec2::new(-1.0, 0.5),
        Vec2::new(0.0, 0.5),
        Vec2::new(0.0, -1.5),
    ];

    let gauge = GaugeAnchors::freeze(
        Box::new([0, 1, 2, 3].map(NodeRowId::new)),
        Box::new([class(0), class(1), class(2), class(3)]),
        frame(&zero),
        None,
        None,
    )
    .expect("the deformed fixture is a valid gauge");

    let refused = gauge.fit(frame(&canonical), frame(&zero), Some(positive(0.25)));
    let Err(GaugeRefusal::ResidualAboveBar { residual, bar }) = refused else {
        panic!("expected a residual refusal, got {refused:?}");
    };
    assert_eq!(bar, 0.25);
    // RMS 0.5 against the frozen spread √1.25.
    assert!((residual - 0.5 / f64::from(gauge.frozen_spread())).abs() < 1e-12);

    let admitted = gauge
        .fit(frame(&canonical), frame(&zero), Some(positive(0.5)))
        .expect("the residual sits under the raised bar");
    assert_eq!(admitted.scale().get(), 1.0);
    assert_eq!(admitted.similarity().rotation().cos(), 1.0);
    assert_eq!(admitted.similarity().rotation().sin(), 0.0);
}

/// Coincident canonical anchors are the closed form's own refusal.
#[test]
fn coincident_anchors_refuse_the_fit() {
    let gauge = square_gauge(&ZERO);
    let coincident = [Vec2::new(1.0, 1.0); 6];

    let refused = gauge.fit(frame(&coincident), frame(&ZERO), None);

    assert_eq!(refused, Err(GaugeRefusal::FitRefused));
}

/// Fewer than two anchors cannot carry a frame.
#[test]
fn insufficient_anchors_refuse_the_freeze() {
    let refused = GaugeAnchors::freeze(
        Box::new([NodeRowId::new(1)]),
        Box::new([class(0)]),
        frame(&ZERO),
        None,
        None,
    );

    assert_eq!(refused, Err(GaugeRefusal::InsufficientAnchors { count: 1 }));
}

/// Anchors coincident in the boundary snapshot have no spread to denominate a residual.
#[test]
fn a_degenerate_snapshot_spread_refuses_the_freeze() {
    let coincident = [Vec2::new(3.0, 3.0); 6];

    let refused = GaugeAnchors::freeze(
        Box::new([1, 2].map(NodeRowId::new)),
        Box::new([class(0), class(1)]),
        frame(&coincident),
        None,
        None,
    );

    assert_eq!(refused, Err(GaugeRefusal::DegenerateSpread { spread: 0.0 }));
}
