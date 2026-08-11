use super::{
    CanonicalError, Conditions, ConditionsError, Field, LadderError, LadderOptions,
    RungMeasurement, measure_ladder, select_canonical,
};
use crate::math::{Rotation, Similarity, Vec2, d_non_negative, non_negative};

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
/// A deformation no similarity can explain (axis swap alone is a reflection, which the
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

    assert_eq!(
        conditions.values(),
        &[
            non_negative!(0.0),
            non_negative!(0.25),
            non_negative!(0.5),
            non_negative!(0.75),
            non_negative!(1.0),
        ]
    );
    assert_eq!(conditions.len(), 5);
    assert_eq!(
        Conditions::new(vec![
            non_negative!(0.0),
            non_negative!(0.25),
            non_negative!(0.5),
            non_negative!(0.75),
            non_negative!(1.0),
        ]),
        Ok(conditions)
    );
}

#[test]
fn conditions_reject_each_violated_invariant() {
    assert_eq!(
        Conditions::new(Vec::new()),
        Err(ConditionsError::TooFew { count: 0 })
    );
    assert_eq!(
        Conditions::new(vec![non_negative!(0.0)]),
        Err(ConditionsError::TooFew { count: 1 })
    );
    assert_eq!(
        Conditions::new(vec![non_negative!(0.5), non_negative!(1.0)]),
        Err(ConditionsError::BaselineNotZero {
            value: non_negative!(0.5)
        })
    );
    assert_eq!(
        Conditions::new(vec![
            non_negative!(0.0),
            non_negative!(0.5),
            non_negative!(0.5)
        ]),
        Err(ConditionsError::Unordered {
            index: 2,
            previous: non_negative!(0.5),
            value: non_negative!(0.5),
        })
    );
    assert_eq!(
        Conditions::new(vec![
            non_negative!(0.0),
            non_negative!(0.75),
            non_negative!(0.5)
        ]),
        Err(ConditionsError::Unordered {
            index: 2,
            previous: non_negative!(0.75),
            value: non_negative!(0.5),
        })
    );
}

/// A negative-zero input is `+0.0` before validation sees it ([`NonNegative`] canonicalizes the
/// sign of zero at construction), so no `-0.0` alias can reach the baseline check or condition
/// the projector with different bits.
#[test]
fn conditions_accept_a_canonicalized_negative_zero_baseline() {
    assert_eq!(
        Conditions::new(vec![non_negative!(-0.0), non_negative!(1.0)]),
        Conditions::new(vec![non_negative!(0.0), non_negative!(1.0)])
    );
}

#[test]
fn measure_rejects_invalid_input() {
    let conditions = Conditions::new(vec![non_negative!(0.0), non_negative!(1.0)])
        .expect("the schedule is valid");
    let base = base_field();
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(1.0),
        },
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(1.0),
        },
    ];

    assert_eq!(
        measure_ladder(&conditions, &fields[..1]),
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
            relation_loss: d_non_negative!(1.0),
        },
    ];
    assert_eq!(
        measure_ladder(&conditions, &mismatched),
        Err(LadderError::RowMismatch {
            index: 1,
            rows: 8,
            expected: 16,
        })
    );
}

#[test]
fn measure_rejects_a_degenerate_field() {
    let conditions = Conditions::new(vec![non_negative!(0.0), non_negative!(1.0)])
        .expect("the schedule is valid");
    let base = base_field();
    let coincident = vec![Vec2::new(3.0, -2.0); base.len()];
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(1.0),
        },
        Field {
            coordinates: &coincident,
            relation_loss: d_non_negative!(1.0),
        },
    ];

    assert_eq!(
        measure_ladder(&conditions, &fields),
        Err(LadderError::Degenerate {
            index: 1,
            against: 0,
        })
    );
}

#[test]
fn pure_similarity_rung_measures_negligible_movement() {
    let conditions = Conditions::new(vec![non_negative!(0.0), non_negative!(1.0)])
        .expect("the schedule is valid");
    let base = base_field();
    let transform = Similarity::new(
        non_negative!(2.0),
        Rotation::from_radians(1.3),
        Vec2::new(5.0, -3.0),
    )
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
            relation_loss: d_non_negative!(1.0),
        },
        Field {
            coordinates: &moved,
            relation_loss: d_non_negative!(1.0),
        },
    ];
    let measurements = measure_ladder(&conditions, &fields).expect("the ladder is well-formed");

    let rung = &measurements[1];
    assert!(
        rung.adjacent_movement < d_non_negative!(1e-3),
        "a pure similarity image leaves no residual movement, moved {}",
        rung.adjacent_movement.get()
    );
    // The fitted alignment inverts the transform: its scale undoes the
    // doubling.
    assert!(
        (rung.alignment.scale().get() - 0.5).abs() < 1e-4,
        "the alignment must recover the inverse scale, got {}",
        rung.alignment.scale()
    );
    // Both comparands are the baseline field here, and the two fits run
    // over identical slices, so the movements agree exactly.
    assert_eq!(rung.baseline_movement, rung.adjacent_movement);
}

#[test]
fn deformed_rung_measures_a_large_movement() {
    let conditions = Conditions::new(vec![non_negative!(0.0), non_negative!(1.0)])
        .expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(1.0),
        },
        Field {
            coordinates: &deformed,
            relation_loss: d_non_negative!(1.0),
        },
    ];

    let measurements = measure_ladder(&conditions, &fields).expect("the ladder is well-formed");

    assert!(
        measurements[1].adjacent_movement > d_non_negative!(0.5),
        "an axis swap over half the cloud is a large residual, got {}",
        measurements[1].adjacent_movement.get()
    );
}

#[test]
fn adjacent_and_baseline_movements_use_their_own_comparands() {
    let conditions = Conditions::new(vec![
        non_negative!(0.0),
        non_negative!(0.5),
        non_negative!(1.0),
    ])
    .expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    // The third rung repeats the second exactly: no movement against
    // its predecessor, real movement against the baseline.
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(1.0),
        },
        Field {
            coordinates: &deformed,
            relation_loss: d_non_negative!(1.0),
        },
        Field {
            coordinates: &deformed,
            relation_loss: d_non_negative!(1.0),
        },
    ];

    let measurements = measure_ladder(&conditions, &fields).expect("the ladder is well-formed");

    let repeat = &measurements[2];
    assert!(repeat.adjacent_movement < d_non_negative!(1e-6));
    assert!(
        repeat.baseline_movement > d_non_negative!(0.5),
        "the repeat still differs from the baseline, got {}",
        repeat.baseline_movement.get()
    );
    // The repeated rung's baseline alignment matches its predecessor's:
    // identical fields fit identical alignments.
    assert_eq!(repeat.alignment, measurements[1].alignment);
}

#[test]
fn measurements_echo_the_loss_series() {
    let conditions = Conditions::new(vec![
        non_negative!(0.0),
        non_negative!(0.25),
        non_negative!(0.5),
        non_negative!(1.0),
    ])
    .expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    // The series falls, then rises twice: every loss echoes verbatim,
    // whatever its direction.
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(1.0),
        },
        Field {
            coordinates: &deformed,
            relation_loss: d_non_negative!(0.9),
        },
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(0.94),
        },
        Field {
            coordinates: &deformed,
            relation_loss: d_non_negative!(1.1),
        },
    ];

    let measurements = measure_ladder(&conditions, &fields).expect("the ladder is well-formed");

    let losses: Vec<f64> = measurements
        .iter()
        .map(|measurement| measurement.relation_loss.get())
        .collect();
    assert_eq!(losses, [1.0, 0.9, 0.94, 1.1]);
    let conditions_seen: Vec<f32> = measurements
        .iter()
        .map(|measurement| measurement.condition.get())
        .collect();
    assert_eq!(conditions_seen, [0.0, 0.25, 0.5, 1.0]);
}

#[test]
fn canonical_index_is_membership_over_the_options_alone() {
    let conditions = Conditions::new(vec![
        non_negative!(0.0),
        non_negative!(0.5),
        non_negative!(1.0),
    ])
    .expect("the schedule is valid");

    // Every schedule member resolves to its own position.
    for (index, &canonical) in conditions.values().iter().enumerate() {
        let options = LadderOptions {
            conditions: conditions.clone(),
            canonical,
        };
        assert_eq!(options.canonical_index(), Ok(index));
    }

    // Membership rejects a value inside the schedule's range that names
    // no rung rather than interpolating it.
    let options = LadderOptions {
        conditions,
        canonical: non_negative!(0.25),
    };
    assert_eq!(
        options.canonical_index(),
        Err(CanonicalError::UnknownRung {
            value: non_negative!(0.25)
        })
    );
}

#[test]
fn canonical_selection_requires_an_exact_member() {
    let conditions = Conditions::new(vec![
        non_negative!(0.0),
        non_negative!(0.5),
        non_negative!(1.0),
    ])
    .expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    let transform = Similarity::new(
        non_negative!(3.0),
        Rotation::from_radians(0.4),
        Vec2::new(-2.0, 8.0),
    )
    .expect("scale 3.0 is normal and positive");
    let moved: Vec<Vec2> = deformed
        .iter()
        .map(|&point| transform.apply(point))
        .collect();
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(1.0),
        },
        // Genuine deformation, improving loss.
        Field {
            coordinates: &deformed,
            relation_loss: d_non_negative!(0.9),
        },
        // A pure similarity image of its predecessor whose loss rises:
        // the measurements record both, and the rung still publishes.
        Field {
            coordinates: &moved,
            relation_loss: d_non_negative!(2.0),
        },
    ];

    let measurements = measure_ladder(&conditions, &fields).expect("the ladder is well-formed");

    // Every schedule member selects; the selection names the rung's
    // field position and carries its alignment.
    let baseline =
        select_canonical(&measurements, non_negative!(0.0)).expect("the baseline is a member");
    assert_eq!(baseline.index, 0);
    assert_eq!(baseline.measurement.alignment, Similarity::IDENTITY);

    let selected =
        select_canonical(&measurements, non_negative!(0.5)).expect("the middle rung is a member");
    assert_eq!(selected.index, 1);
    assert_eq!(selected.measurement.alignment, measurements[1].alignment);

    // The rung whose loss rose and whose movement collapsed onto its
    // predecessor publishes like any other member: the measurements
    // are diagnostics, not gates.
    let risen =
        select_canonical(&measurements, non_negative!(1.0)).expect("the last rung is a member");
    assert_eq!(risen.index, 2);
    assert_eq!(risen.measurement.relation_loss, d_non_negative!(2.0));

    // Selection rejects a value outside the schedule rather than interpolating.
    assert_eq!(
        select_canonical(&measurements, non_negative!(0.25)),
        Err(CanonicalError::UnknownRung {
            value: non_negative!(0.25)
        })
    );
}

#[test]
fn canonical_selection_publishes_a_rung_that_repeats_the_baseline() {
    let conditions = Conditions::new(vec![non_negative!(0.0), non_negative!(1.0)])
        .expect("the schedule is valid");
    let base = base_field();
    // The rung repeats the baseline exactly: zero residual movement,
    // and it publishes regardless.
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(1.0),
        },
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(0.9),
        },
    ];

    let measurements = measure_ladder(&conditions, &fields).expect("the ladder is well-formed");

    let selected =
        select_canonical(&measurements, non_negative!(1.0)).expect("the rung is a member");
    assert_eq!(selected.index, 1);
    assert!(selected.measurement.adjacent_movement < d_non_negative!(1e-6));
}

#[test]
fn baseline_rung_measures_as_the_identity() {
    let conditions = Conditions::new(vec![non_negative!(0.0), non_negative!(1.0)])
        .expect("the schedule is valid");
    let base = base_field();
    let deformed = deformed_field(&base);
    let fields = [
        Field {
            coordinates: &base,
            relation_loss: d_non_negative!(2.5),
        },
        Field {
            coordinates: &deformed,
            relation_loss: d_non_negative!(2.5),
        },
    ];

    let measurements = measure_ladder(&conditions, &fields).expect("well-formed");

    let RungMeasurement {
        condition,
        relation_loss,
        alignment,
        baseline_movement,
        adjacent_movement,
    } = measurements[0];
    assert_eq!(condition, non_negative!(0.0));
    assert_eq!(relation_loss, d_non_negative!(2.5));
    assert_eq!(alignment, Similarity::IDENTITY);
    assert_eq!(baseline_movement, d_non_negative!(0.0));
    assert_eq!(adjacent_movement, d_non_negative!(0.0));
}
