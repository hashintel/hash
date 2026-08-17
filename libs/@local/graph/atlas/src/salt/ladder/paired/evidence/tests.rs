//! Evidence aggregation and wire-shape expectations.
//!
//! The quantile oracle restates the cumulative quantile rule directly, and the aggregate pins
//! derive by hand from exact decimal literals. The serialized equalities pin each outcome
//! kind's whole wire shape, so a drifted field name or a defaulted absence fails against an
//! independent statement of the contract.

#![expect(
    clippy::float_cmp,
    reason = "the oracles restate exact decimal readings, so equality is the contract"
)]
#![expect(
    clippy::cast_precision_loss,
    reason = "test populations stay far below exact f64 integer precision"
)]

use core::iter;

use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

use super::{
    ControlDecile, FailureReason, MovementAggregate, MovementOutcome, PairAggregates,
    PairedMovementEvidence, Rung,
};
use crate::{
    identity::NodeRowId,
    math::{DFinite, DNonNegative, NonFinitePoint, d_finite, d_non_negative, unit_fraction},
    salt::ladder::paired::{
        census::CensusError,
        fixtures::salt,
        identity::RuleIdentity,
        movement::{ControlMovement, MovementError, PairMovement},
    },
};

#[test]
fn nearest_rank_quantiles_restate_the_cumulative_rule() {
    // The oracle restates the definition directly: walk the ascending readings and take
    // the first whose cumulative unit count reaches the fraction of the population.
    fn oracle(readings: &[f64], fraction: f64) -> f64 {
        let mut sorted = readings.to_vec();
        sorted.sort_unstable_by(f64::total_cmp);
        let population = sorted.len() as f64;
        let mut cumulative = 0.0_f64;
        for &reading in &sorted {
            cumulative += 1.0;
            if cumulative >= fraction * population {
                return reading;
            }
        }
        unreachable!("a fraction of at most one ends the walk inside the population")
    }

    let mut rng = Xoshiro256PlusPlus::seed_from_u64(0x9E37_79B9);
    for population in [1_usize, 2, 7, 20, 100, 101] {
        let raw: Vec<f64> = iter::repeat_with(|| rng.random_range(-8.0..8.0))
            .take(population)
            .collect();
        let readings: Vec<DFinite> = raw
            .iter()
            .map(|&reading| DFinite::new(reading).expect("the fixture readings are finite"))
            .collect();
        let aggregate = MovementAggregate::over(&readings);
        for (fraction, reading) in [
            (0.05, aggregate.q05),
            (0.25, aggregate.q25),
            (0.5, aggregate.q50),
            (0.75, aggregate.q75),
            (0.95, aggregate.q95),
        ] {
            assert_eq!(
                reading.get(),
                oracle(&raw, fraction),
                "fraction {fraction} over a population of {population}",
            );
        }
    }
}

#[test]
fn pair_aggregates_pin_exact_decimal_literals() {
    let readings = [
        PairMovement {
            distance_zero: d_non_negative!(1.0),
            distance_canonical: d_non_negative!(0.5),
            rank_zero: 5,
            rank_canonical: 3,
        },
        PairMovement {
            distance_zero: d_non_negative!(2.0),
            distance_canonical: d_non_negative!(2.25),
            rank_zero: 1,
            rank_canonical: 4,
        },
        PairMovement {
            distance_zero: d_non_negative!(3.0),
            distance_canonical: d_non_negative!(1.5),
            rank_zero: 2,
            rank_canonical: 2,
        },
        PairMovement {
            distance_zero: d_non_negative!(1.0),
            distance_canonical: d_non_negative!(1.0),
            rank_zero: 7,
            rank_canonical: 6,
        },
    ];

    let aggregates = PairAggregates::over(&readings);

    // Δd = [-0.5, 0.25, -1.5, 0.0] sorts to [-1.5, -0.5, 0.0, 0.25]. Over four readings the
    // one-based nearest ranks are ⌈0.2⌉ = 1, ⌈1⌉ = 1, ⌈2⌉ = 2, ⌈3⌉ = 3, and ⌈3.8⌉ = 4. Every
    // literal is exact in f64, so the serial fold gives (-0.5 + 0.25 - 1.5 + 0.0) / 4 exactly.
    assert_eq!(aggregates.count, 4);
    assert_eq!(aggregates.distance.q05, d_finite!(-1.5));
    assert_eq!(aggregates.distance.q25, d_finite!(-1.5));
    assert_eq!(aggregates.distance.q50, d_finite!(-0.5));
    assert_eq!(aggregates.distance.q75, d_finite!(0.0));
    assert_eq!(aggregates.distance.q95, d_finite!(0.25));
    assert_eq!(aggregates.distance.mean, d_finite!(-0.4375));
    assert_eq!(aggregates.contracting, unit_fraction!(0.5));

    // Δr = [-2, 3, 0, -1] sorts to [-2, -1, 0, 3] and sums to zero.
    assert_eq!(aggregates.rank.q05, d_finite!(-2.0));
    assert_eq!(aggregates.rank.q25, d_finite!(-2.0));
    assert_eq!(aggregates.rank.q50, d_finite!(-1.0));
    assert_eq!(aggregates.rank.q75, d_finite!(0.0));
    assert_eq!(aggregates.rank.q95, d_finite!(3.0));
    assert_eq!(aggregates.rank.mean, d_finite!(0.0));
    assert_eq!(aggregates.rank_improving, unit_fraction!(0.5));
}

#[test]
fn the_mean_folds_serially_in_draw_order() {
    // 2^54 absorbs a unit exactly, so the fold order decides the sum. Draw order absorbs the
    // first unit and keeps the second, while an ascending fold would absorb both and read zero.
    let big = 18_014_398_509_481_984.0_f64;
    assert_eq!(big, (2.0_f64).powi(54), "the literal is 2^54");

    let readings = [big, 1.0, -big, 1.0]
        .map(|reading| DFinite::new(reading).expect("the readings are finite"));
    assert_eq!(MovementAggregate::over(&readings).mean, d_finite!(0.25));
}

#[test]
fn pair_first_quantiles_defeat_aggregate_subtraction() {
    let readings = [
        PairMovement {
            distance_zero: d_non_negative!(10.0),
            distance_canonical: d_non_negative!(1.0),
            rank_zero: 1,
            rank_canonical: 1,
        },
        PairMovement {
            distance_zero: d_non_negative!(20.0),
            distance_canonical: d_non_negative!(30.0),
            rank_zero: 1,
            rank_canonical: 1,
        },
        PairMovement {
            distance_zero: d_non_negative!(30.0),
            distance_canonical: d_non_negative!(12.0),
            rank_zero: 1,
            rank_canonical: 1,
        },
    ];

    let aggregates = PairAggregates::over(&readings);

    // Δd = [-9, 10, -18] has median -9. The rung medians are 20 and 12, whose difference -8
    // is a reading no pair produced, so an implementation that subtracts persisted rung
    // aggregates cannot reproduce the family.
    let zero_median =
        MovementAggregate::over(&[d_finite!(10.0), d_finite!(20.0), d_finite!(30.0)]).q50;
    let canonical_median =
        MovementAggregate::over(&[d_finite!(1.0), d_finite!(30.0), d_finite!(12.0)]).q50;
    assert_eq!(zero_median, d_finite!(20.0));
    assert_eq!(canonical_median, d_finite!(12.0));
    assert_eq!(aggregates.distance.q50, d_finite!(-9.0));
    assert_ne!(
        aggregates.distance.q50.get(),
        canonical_median.get() - zero_median.get()
    );
}

#[test]
#[expect(
    clippy::cast_possible_truncation,
    reason = "the ten stratum indices stay far below u32::MAX"
)]
fn control_deciles_stratify_the_candidate_census() {
    // Twenty distinct candidate readings split two per stratum, with the boundary at every
    // second reading. The drawn controls join the first, second, and final strata, leaving
    // the others individually empty.
    let mut candidates: Vec<DNonNegative> = (1..=20_u32)
        .rev()
        .map(|reading| {
            DNonNegative::new(f64::from(reading)).expect("the census readings are in domain")
        })
        .collect();
    let readings = [
        ControlMovement {
            displacement: d_non_negative!(1.0),
            anchor_distance: d_non_negative!(2.0),
        },
        ControlMovement {
            displacement: d_non_negative!(3.0),
            anchor_distance: d_non_negative!(3.0),
        },
        ControlMovement {
            displacement: d_non_negative!(5.0),
            anchor_distance: d_non_negative!(20.0),
        },
    ];

    let deciles = ControlDecile::over(&mut candidates, &readings);

    assert_eq!(deciles.len(), 10);
    for (index, decile) in deciles.iter().enumerate() {
        assert_eq!(decile.upper.get(), f64::from((index as u32 + 1) * 2));
        assert_eq!(decile.candidates, 2);
    }
    assert_eq!(deciles[0].selected, 1);
    assert_eq!(
        deciles[0].displacement,
        Some(MovementAggregate {
            q05: d_finite!(1.0),
            q25: d_finite!(1.0),
            q50: d_finite!(1.0),
            q75: d_finite!(1.0),
            q95: d_finite!(1.0),
            mean: d_finite!(1.0),
        }),
    );
    assert_eq!(deciles[1].selected, 1, "3.0 lies above 2.0 and reaches 4.0");
    assert_eq!(
        deciles[9].selected, 1,
        "the census maximum lands in the final stratum"
    );
    for decile in &deciles[2..9] {
        assert_eq!(decile.selected, 0);
        assert_eq!(
            decile.displacement, None,
            "an empty stratum persists without value fields",
        );
    }
}

#[test]
fn control_deciles_share_tied_boundaries_and_vanish_without_candidates() {
    // A Q = 0 reading persists no strata at all, which stays distinguishable from
    // strata that are merely empty.
    assert!(ControlDecile::over(&mut [], &[]).is_empty());

    // Equal candidate readings collapse every boundary onto one value. The first stratum
    // absorbs the whole census and the boundary ties leave the rest without candidates.
    let mut tied = [d_non_negative!(5.0); 4];
    let readings = [ControlMovement {
        displacement: d_non_negative!(2.0),
        anchor_distance: d_non_negative!(5.0),
    }];

    let deciles = ControlDecile::over(&mut tied, &readings);

    assert_eq!(deciles.len(), 10);
    assert_eq!(deciles[0].candidates, 4);
    assert_eq!(deciles[0].selected, 1);
    for decile in &deciles[1..] {
        assert_eq!(decile.upper, d_non_negative!(5.0));
        assert_eq!(decile.candidates, 0);
        assert_eq!(decile.selected, 0);
        assert_eq!(decile.displacement, None);
    }
}

#[test]
fn failure_reasons_mirror_their_producers() {
    assert_eq!(
        FailureReason::from(CensusError::<NodeRowId>::GroupRange {
            group: 3,
            start: 9,
            end: 7,
            edges: 12,
        }),
        FailureReason::GroupRange {
            group: 3,
            start: 9,
            end: 7,
            edges: 12,
        },
    );
    assert_eq!(
        FailureReason::from(CensusError::Endpoint {
            edge: 4,
            row: 99,
            rows: 50,
        }),
        FailureReason::Endpoint {
            edge: 4,
            row: 99,
            rows: 50,
        },
    );
    assert_eq!(
        FailureReason::from(MovementError::Rows {
            zero: 5,
            canonical: 6,
        }),
        FailureReason::FrameRows {
            zero: 5,
            canonical: 6,
        },
    );
    assert_eq!(
        FailureReason::from(MovementError::Zero(NonFinitePoint {
            id: NodeRowId::new(7),
        })),
        FailureReason::NonFinitePoint {
            rung: Rung::Zero,
            row: NodeRowId::new(7),
        },
    );
    assert_eq!(
        FailureReason::from(MovementError::Canonical(NonFinitePoint {
            id: NodeRowId::new(9),
        })),
        FailureReason::NonFinitePoint {
            rung: Rung::Canonical,
            row: NodeRowId::new(9),
        },
    );
}

#[test]
fn vacuous_bodies_serialize_the_persisted_shape() {
    let salt = salt();

    let vacuous = PairedMovementEvidence {
        rule: RuleIdentity::INITIAL,
        salt,
        rank_window: 256,
        pair_candidates: 0,
        pairs_selected: 0,
        control_candidates: 0,
        controls_selected: 0,
        outcome: MovementOutcome::Vacuous,
    };
    let value = serde_json::to_value(&vacuous).expect("the body serializes");
    assert_eq!(
        value,
        serde_json::json!({
            "rule": 1,
            "salt": salt,
            "rank_window": 256,
            "pair_candidates": 0,
            "pairs_selected": 0,
            "control_candidates": 0,
            "controls_selected": 0,
            "outcome": "vacuous",
        }),
    );
    assert_eq!(
        serde_json::from_value::<PairedMovementEvidence<NodeRowId>>(value)
            .expect("the body reads back"),
        vacuous,
    );
}

#[test]
fn measured_bodies_serialize_the_persisted_shape() {
    let salt = salt();

    let family = MovementAggregate {
        q05: d_finite!(-1.5),
        q25: d_finite!(-0.5),
        q50: d_finite!(0.5),
        q75: d_finite!(1.5),
        q95: d_finite!(2.5),
        mean: d_finite!(0.5),
    };
    let measured = PairedMovementEvidence {
        rule: RuleIdentity::INITIAL,
        salt,
        rank_window: 256,
        pair_candidates: 5,
        pairs_selected: 2,
        control_candidates: 3,
        controls_selected: 2,
        outcome: MovementOutcome::Measured {
            pairs: PairAggregates {
                count: 2,
                distance: family,
                rank: family,
                contracting: unit_fraction!(0.5),
                rank_improving: unit_fraction!(0.0),
            },
            deciles: vec![
                ControlDecile {
                    upper: d_non_negative!(1.5),
                    candidates: 3,
                    selected: 2,
                    displacement: Some(family),
                },
                ControlDecile {
                    upper: d_non_negative!(1.5),
                    candidates: 0,
                    selected: 0,
                    displacement: None,
                },
            ],
        },
    };
    let value = serde_json::to_value(&measured).expect("the body serializes");
    let family_json = serde_json::json!({
        "q05": -1.5,
        "q25": -0.5,
        "q50": 0.5,
        "q75": 1.5,
        "q95": 2.5,
        "mean": 0.5,
    });
    assert_eq!(
        value,
        serde_json::json!({
            "rule": 1,
            "salt": salt,
            "rank_window": 256,
            "pair_candidates": 5,
            "pairs_selected": 2,
            "control_candidates": 3,
            "controls_selected": 2,
            "outcome": "measured",
            "pairs": {
                "count": 2,
                "distance": family_json,
                "rank": family_json,
                "contracting": 0.5,
                "rank_improving": 0.0,
            },
            "deciles": [
                {
                    "upper": 1.5,
                    "candidates": 3,
                    "selected": 2,
                    "displacement": family_json,
                },
                {
                    "upper": 1.5,
                    "candidates": 0,
                    "selected": 0,
                    "displacement": null,
                },
            ],
        }),
        "an absent family reads null, never a numeric zero",
    );
    assert_eq!(
        serde_json::from_value::<PairedMovementEvidence<NodeRowId>>(value)
            .expect("the body reads back"),
        measured,
    );
}

#[test]
fn failed_bodies_serialize_the_persisted_shape() {
    let salt = salt();

    let failed = PairedMovementEvidence {
        rule: RuleIdentity::INITIAL,
        salt,
        rank_window: 256,
        pair_candidates: 5,
        pairs_selected: 2,
        control_candidates: 3,
        controls_selected: 2,
        outcome: MovementOutcome::Failed {
            reason: FailureReason::NonFinitePoint {
                rung: Rung::Zero,
                row: NodeRowId::new(7),
            },
        },
    };
    let value = serde_json::to_value(&failed).expect("the body serializes");
    assert_eq!(
        value,
        serde_json::json!({
            "rule": 1,
            "salt": salt,
            "rank_window": 256,
            "pair_candidates": 5,
            "pairs_selected": 2,
            "control_candidates": 3,
            "controls_selected": 2,
            "outcome": "failed",
            "reason": {
                "cause": "non-finite-point",
                "rung": "zero",
                "row": 7,
            },
        }),
    );
    assert_eq!(
        serde_json::from_value::<PairedMovementEvidence<NodeRowId>>(value)
            .expect("the body reads back"),
        failed,
    );
}
