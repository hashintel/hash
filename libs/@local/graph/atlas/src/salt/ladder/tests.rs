#![expect(
    clippy::float_cmp,
    reason = "exactness assertions on echoed inputs and constructed zeros are bit-precise \
              contracts"
)]
use core::assert_matches;

use super::{
    CanonicalError, Conditions, ConditionsError, Field, LadderError, MeasurementOptions,
    RungMeasurement, measure_ladder, select_canonical,
};
use crate::math::{Rotation, Similarity, Vec2};

/// A sixteen-point deterministic cloud.
///
/// Spread radii and no symmetry a similarity could exploit.
fn base_field() -> Vec<Vec2> {
    (0..16_u8)
        .map(|index| {
            let index = f32::from(index);
            let angle = index * 0.7;
            let radius = (index * 0.37).sin().abs().mul_add(4.0, 1.0);
            Vec2::new(
                radius * angle.cos(),
                0.1_f32.mul_add(index, radius * angle.sin()),
            )
        })
        .collect()
}

/// Swaps the axes of every even-indexed point.
///
/// A genuine deformation no similarity can explain (axis swap alone is a reflection, which the
/// orientation-preserving family excludes).
fn deformed_field(base: &[Vec2]) -> Vec<Vec2> {
    base.iter()
        .enumerate()
        .map(|(index, &point)| {
            if index.is_multiple_of(2) {
                Vec2::new(point.y(), point.x())
            } else {
                point
            }
        })
        .collect()
}

#[test]
fn conditions_accept_the_reference_schedule() {
    let conditions = Conditions::default();

    assert_eq!(conditions.values(), &[0.0, 0.25, 0.5, 0.75, 1.0]);
    assert_eq!(conditions.len(), 5);
    assert_eq!(
        Conditions::new(vec![0.0, 0.25, 0.5, 0.75, 1.0]),
        Ok(conditions)
    );
}

#[test]
fn conditions_reject_each_violated_invariant() {
    assert_eq!(
        Conditions::new(vec![]),
        Err(ConditionsError::TooFew { count: 0 })
    );
    assert_eq!(
        Conditions::new(vec![0.0]),
        Err(ConditionsError::TooFew { count: 1 })
    );
    assert_eq!(
        Conditions::new(vec![0.5, 1.0]),
        Err(ConditionsError::BaselineNotZero { value: 0.5 })
    );
    // The baseline is bit-exact: the negative zero conditions the
    // projector with different bits and is rejected.
    assert_eq!(
        Conditions::new(vec![-0.0, 1.0]),
        Err(ConditionsError::BaselineNotZero { value: -0.0 })
    );
    assert_matches!(
        Conditions::new(vec![0.0, f32::NAN]),
        Err(ConditionsError::NonFinite { index: 1, .. })
    );
    assert_eq!(
        Conditions::new(vec![0.0, f32::INFINITY]),
        Err(ConditionsError::NonFinite {
            index: 1,
            value: f32::INFINITY,
        })
    );
    assert_eq!(
        Conditions::new(vec![0.0, 0.5, 0.5]),
        Err(ConditionsError::Unordered {
            index: 2,
            previous: 0.5,
            value: 0.5,
        })
    );
    assert_eq!(
        Conditions::new(vec![0.0, 0.75, 0.5]),
        Err(ConditionsError::Unordered {
            index: 2,
            previous: 0.75,
            value: 0.5,
        })
    );
}

#[test]
fn measure_rejects_invalid_input() {
    let conditions = Conditions::new(vec![0.0, 1.0]).expect("the schedule is valid");
    let base = base_field();
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
    ];

    assert_eq!(
        measure_ladder(&conditions, &fields[..1], MeasurementOptions { .. }),
        Err(LadderError::FieldCount {
            conditions: 2,
            fields: 1,
        })
    );

    let short = &base[..8];
    let mismatched = [
        fields[0],
        Field {
            coordinates: short,
            relation_loss: 1.0,
        },
    ];
    assert_eq!(
        measure_ladder(&conditions, &mismatched, MeasurementOptions { .. }),
        Err(LadderError::RowMismatch {
            index: 1,
            rows: 8,
            expected: 16,
        })
    );

    let non_finite_loss = [
        fields[0],
        Field {
            coordinates: &base,
            relation_loss: f64::NAN,
        },
    ];
    assert_matches!(
        measure_ladder(&conditions, &non_finite_loss, MeasurementOptions { .. }),
        Err(LadderError::NonFiniteLoss { index: 1, .. })
    );

    assert_eq!(
        measure_ladder(
            &conditions,
            &fields,
            MeasurementOptions {
                distinguishability_floor: 0.0,
                ..
            }
        ),
        Err(LadderError::InvalidFloor { value: 0.0 })
    );
    assert_eq!(
        measure_ladder(
            &conditions,
            &fields,
            MeasurementOptions {
                monotonicity_tolerance: -0.1,
                ..
            }
        ),
        Err(LadderError::InvalidTolerance { value: -0.1 })
    );
}

#[test]
fn measure_rejects_a_degenerate_field() {
    let conditions = Conditions::new(vec![0.0, 1.0]).expect("the schedule is valid");
    let base = base_field();
    let coincident = vec![Vec2::new(3.0, -2.0); base.len()];
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
        Field {
            coordinates: &coincident,
            relation_loss: 1.0,
        },
    ];

    assert_eq!(
        measure_ladder(&conditions, &fields, MeasurementOptions { .. }),
        Err(LadderError::Degenerate {
            index: 1,
            against: 0,
        })
    );
}

#[test]
fn a_pure_similarity_rung_is_indistinguishable() {
    let conditions = Conditions::new(vec![0.0, 1.0]).expect("the schedule is valid");
    let base = base_field();
    let transform = Similarity::new(2.0, Rotation::from_radians(1.3), Vec2::new(5.0, -3.0))
        .expect("scale 2.0 is normal and positive");
    let moved: Vec<Vec2> = base.iter().map(|&point| transform.apply(point)).collect();

    // The raw coordinates moved far - more than one unit per point on
    // average over the sixteen points; only alignment reveals that
    // nothing about the layout's shape changed.
    let raw_displacement = base
        .iter()
        .zip(&moved)
        .map(|(&before, &after)| f64::from((after - before).length()))
        .sum::<f64>();
    assert!(
        raw_displacement > 16.0,
        "the rung must move far in raw coordinates, moved {raw_displacement}"
    );

    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
        Field {
            coordinates: &moved,
            relation_loss: 1.0,
        },
    ];
    let measurements = measure_ladder(
        &conditions,
        &fields,
        MeasurementOptions {
            distinguishability_floor: 1e-3,
            ..
        },
    )
    .expect("the ladder is well-formed");

    let rung = &measurements[1];
    assert!(
        !rung.distinguishable,
        "a pure similarity image must be indistinguishable, moved {}",
        rung.adjacent_movement
    );
    assert!(rung.adjacent_movement < 1e-3);
    // The fitted alignment inverts the transform: its scale undoes the
    // doubling.
    assert!(
        (rung.alignment.scale() - 0.5).abs() < 1e-4,
        "the alignment must recover the inverse scale, got {}",
        rung.alignment.scale()
    );
    // Both comparands are the baseline field here, and the two fits run
    // over identical slices, so the movements agree exactly.
    assert_eq!(rung.baseline_movement, rung.adjacent_movement);
}

#[test]
fn a_deformed_rung_is_distinguishable() {
    let conditions = Conditions::new(vec![0.0, 1.0]).expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
        Field {
            coordinates: &deformed,
            relation_loss: 1.0,
        },
    ];

    let measurements = measure_ladder(
        &conditions,
        &fields,
        MeasurementOptions {
            distinguishability_floor: 1e-3,
            ..
        },
    )
    .expect("the ladder is well-formed");

    assert!(measurements[1].distinguishable);
    assert!(
        measurements[1].adjacent_movement > 0.5,
        "an axis swap over half the cloud is a large residual, got {}",
        measurements[1].adjacent_movement
    );
}

#[test]
fn adjacent_and_baseline_movements_use_their_own_comparands() {
    let conditions = Conditions::new(vec![0.0, 0.5, 1.0]).expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    // The third rung repeats the second exactly: no movement against
    // its predecessor, real movement against the baseline.
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
        Field {
            coordinates: &deformed,
            relation_loss: 1.0,
        },
        Field {
            coordinates: &deformed,
            relation_loss: 1.0,
        },
    ];

    let measurements = measure_ladder(
        &conditions,
        &fields,
        MeasurementOptions {
            distinguishability_floor: 1e-3,
            ..
        },
    )
    .expect("the ladder is well-formed");

    let repeat = &measurements[2];
    assert!(repeat.adjacent_movement < 1e-6);
    assert!(!repeat.distinguishable);
    assert!(
        repeat.baseline_movement > 0.5,
        "the repeat still differs from the baseline, got {}",
        repeat.baseline_movement
    );
    // The repeated rung's baseline alignment matches its predecessor's:
    // identical fields fit identical alignments.
    assert_eq!(repeat.alignment, measurements[1].alignment);
}

#[test]
fn monotonicity_tracks_the_loss_series_within_tolerance() {
    let conditions = Conditions::new(vec![0.0, 0.25, 0.5, 1.0]).expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
        // Improves: monotonic.
        Field {
            coordinates: &deformed,
            relation_loss: 0.9,
        },
        // Rises within the tolerance: still monotonic.
        Field {
            coordinates: &base,
            relation_loss: 0.94,
        },
        // Rises beyond the tolerance: not monotonic.
        Field {
            coordinates: &deformed,
            relation_loss: 1.1,
        },
    ];

    let measurements = measure_ladder(
        &conditions,
        &fields,
        MeasurementOptions {
            monotonicity_tolerance: 0.05,
            ..
        },
    )
    .expect("the ladder is well-formed");

    let monotonic: Vec<bool> = measurements
        .iter()
        .map(|measurement| measurement.monotonic)
        .collect();
    assert_eq!(monotonic, [true, true, true, false]);
    // Each rung echoes its condition and loss.
    let conditions_seen: Vec<f32> = measurements
        .iter()
        .map(|measurement| measurement.condition)
        .collect();
    assert_eq!(conditions_seen, [0.0, 0.25, 0.5, 1.0]);
}

#[test]
fn canonical_selection_requires_an_exact_passing_member() {
    let conditions = Conditions::new(vec![0.0, 0.5, 1.0]).expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    let transform = Similarity::new(3.0, Rotation::from_radians(0.4), Vec2::new(-2.0, 8.0))
        .expect("scale 3.0 is normal and positive");
    let moved: Vec<Vec2> = deformed
        .iter()
        .map(|&point| transform.apply(point))
        .collect();
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
        // Genuine deformation: distinguishable, improving loss.
        Field {
            coordinates: &deformed,
            relation_loss: 0.9,
        },
        // A pure similarity image of its predecessor whose loss rises
        // beyond tolerance: fails both criteria.
        Field {
            coordinates: &moved,
            relation_loss: 2.0,
        },
    ];

    let measurements = measure_ladder(
        &conditions,
        &fields,
        MeasurementOptions {
            distinguishability_floor: 1e-3,
            ..
        },
    )
    .expect("the ladder is well-formed");

    // The baseline and the deformed rung select; the selection names
    // the rung's field position and carries its alignment.
    let baseline = select_canonical(&measurements, 0.0).expect("the baseline always passes");
    assert_eq!(baseline.index, 0);
    assert_eq!(baseline.measurement.alignment, Similarity::IDENTITY);

    let selected = select_canonical(&measurements, 0.5).expect("the passing rung selects");
    assert_eq!(selected.index, 1);
    assert_eq!(selected.measurement.alignment, measurements[1].alignment);

    // Values outside the schedule are rejected, not interpolated.
    assert_eq!(
        select_canonical(&measurements, 0.25),
        Err(CanonicalError::UnknownRung { value: 0.25 })
    );

    // The failing rung reports its first violated criterion:
    // monotonicity is checked before distinguishability.
    assert_eq!(
        select_canonical(&measurements, 1.0),
        Err(CanonicalError::Monotonicity { value: 1.0 })
    );
}

#[test]
fn canonical_selection_rejects_an_indistinguishable_rung() {
    let conditions = Conditions::new(vec![0.0, 1.0]).expect("the schedule is valid");
    let base = base_field();
    // The rung repeats the baseline exactly: monotonic (loss improves)
    // but indistinguishable.
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 1.0,
        },
        Field {
            coordinates: &base,
            relation_loss: 0.9,
        },
    ];

    let measurements = measure_ladder(
        &conditions,
        &fields,
        MeasurementOptions {
            distinguishability_floor: 1e-3,
            ..
        },
    )
    .expect("the ladder is well-formed");

    assert_eq!(
        select_canonical(&measurements, 1.0),
        Err(CanonicalError::Distinguishability { value: 1.0 })
    );
}

#[test]
fn the_baseline_rung_measures_as_the_identity() {
    let conditions = Conditions::new(vec![0.0, 1.0]).expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: 2.5,
        },
        Field {
            coordinates: &deformed,
            relation_loss: 2.5,
        },
    ];

    let measurements =
        measure_ladder(&conditions, &fields, MeasurementOptions { .. }).expect("well-formed");

    let RungMeasurement {
        condition,
        relation_loss,
        alignment,
        baseline_movement,
        adjacent_movement,
        monotonic,
        distinguishable,
    } = measurements[0];
    assert_eq!(condition, 0.0);
    assert_eq!(relation_loss, 2.5);
    assert_eq!(alignment, Similarity::IDENTITY);
    assert_eq!(baseline_movement, 0.0);
    assert_eq!(adjacent_movement, 0.0);
    assert!(monotonic);
    assert!(distinguishable);
}
