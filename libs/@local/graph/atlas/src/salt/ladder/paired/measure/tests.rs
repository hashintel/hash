//! Complete paired-evidence values from constructed index regions and aligned frames.
//!
//! Each case checks [`measure`]'s serialized result, including draw counts, outcome dispatch and
//! aggregate fields.

use serde_json::json;

use super::measure;
use crate::{
    file::attraction::{EdgeRecord, GroupRecord},
    identity::{EdgeRowId, NodeRowId},
    math::{DFinite, Vec2},
    salt::ladder::paired::{
        evidence::MovementAggregate,
        fixtures::{edge, frame, group, reproducibility, salt, snapshot},
    },
};

/// Builds attraction regions with four Proximal pairs over ten rows.
///
/// Edges `(0,1)`, `(2,3)`, `(4,5)` and `(6,7)` form the pair domain in one force-bearing group. The
/// participant set is rows `0..=7`, leaving rows 8 and 9 as the control candidates. Both domains
/// fit within their quotas and every candidate is drawn. The fixture's bounded integer readings sum
/// exactly in any draw order.
fn readout_index() -> (Vec<GroupRecord>, Vec<EdgeRecord<NodeRowId, EdgeRowId>>) {
    (
        vec![group(3, 0, 1.0)],
        vec![edge(0, 1), edge(2, 3), edge(4, 5), edge(6, 7)],
    )
}

/// Builds aligned frames with integer pair distances and control displacements.
///
/// The pair clusters sit far apart, and each partner is its source's nearest row at both steps
/// except one designed movement: row 4 moves ahead of partner 3 at the canonical step, where
/// row 5's reading ties the partner's own squared distance exactly (81) and resolves behind it
/// by row identity. Every drawn distance is an integer by construction:
///
/// | pair    | zero | canonical | Δd | Δrank |
/// |---------|------|-----------|----|-------|
/// | `(0,1)` | 8    | 2         | -6 | 0     |
/// | `(2,3)` | 5    | 9         | +4 | +1    |
/// | `(4,5)` | 3    | 2         | -1 | 0     |
/// | `(6,7)` | 4    | 4         | 0  | 0     |
///
/// The control rows read anchor distances 40 (row 8 to anchor row 0) and 46 (row 9 to anchor
/// row 7) and displacements 3 and 5, a 3-4-5 triangle.
fn readout_frames() -> (Vec<Vec2>, Vec<Vec2>) {
    let zero = vec![
        Vec2::new(0.0, 0.0),
        Vec2::new(8.0, 0.0),
        Vec2::new(100.0, 0.0),
        Vec2::new(105.0, 0.0),
        Vec2::new(100.0, 7.0),
        Vec2::new(100.0, 10.0),
        Vec2::new(200.0, 0.0),
        Vec2::new(204.0, 0.0),
        Vec2::new(0.0, 40.0),
        Vec2::new(250.0, 0.0),
    ];
    let canonical = vec![
        Vec2::new(0.0, 0.0),
        Vec2::new(2.0, 0.0),
        Vec2::new(100.0, 0.0),
        Vec2::new(109.0, 0.0),
        Vec2::new(100.0, 7.0),
        Vec2::new(100.0, 9.0),
        Vec2::new(200.0, 0.0),
        Vec2::new(204.0, 0.0),
        Vec2::new(0.0, 43.0),
        Vec2::new(247.0, 4.0),
    ];
    (zero, canonical)
}

/// Records an empty pair population as a present vacuous outcome.
///
/// This measures a ladder with no Proximal pairs. The outcome keeps the recognized rule and derived
/// salt beside zero counts, distinguishing it from absent paired evidence.
#[test]
fn the_writer_reads_an_empty_pair_domain_as_a_present_vacuous_body() {
    let (_, edges) = readout_index();
    let groups = vec![group(3, 0, 0.0)];
    let (zero, _) = readout_frames();

    let evidence = measure(
        &snapshot(),
        &reproducibility(),
        &groups,
        &edges,
        frame(&zero),
        frame(&zero),
    )
    .expect("the fixture preimage serializes");

    assert_eq!(
        serde_json::to_value(&evidence).expect("the body serializes"),
        json!({
            "rule": 1,
            "salt": salt(),
            "rank_window": 256,
            "pair_candidates": 0,
            "pairs_selected": 0,
            "control_candidates": 0,
            "controls_selected": 0,
            "outcome": "vacuous",
        }),
    );
}

/// Retains completed draw counts when the canonical frame is one row short.
///
/// The census completes before the frame-length check. The failed outcome names both row counts and
/// carries no partial aggregates.
#[test]
fn an_injected_movement_refusal_keeps_its_counts_and_no_partial_aggregates() {
    let (groups, edges) = readout_index();
    let (zero, mut canonical) = readout_frames();
    canonical.pop();

    let evidence = measure(
        &snapshot(),
        &reproducibility(),
        &groups,
        &edges,
        frame(&zero),
        frame(&canonical),
    )
    .expect("the fixture preimage serializes");

    assert_eq!(
        serde_json::to_value(&evidence).expect("the body serializes"),
        json!({
            "rule": 1,
            "salt": salt(),
            "rank_window": 256,
            "pair_candidates": 4,
            "pairs_selected": 4,
            "control_candidates": 2,
            "controls_selected": 2,
            "outcome": "failed",
            "reason": {
                "cause": "frame-rows",
                "zero": 10,
                "canonical": 9,
            },
        }),
    );
}

/// Repeats the complete readout over binary-representable fixture values.
///
/// The readout computes twice with byte-identical serialized output. The pinned aggregate
/// derives by hand from [`readout_frames`]'s table: distance differences `{-6, +4, -1, 0}`
/// sort to `[-6, -1, 0, 4]` (mean `-0.75`), rank differences `{0, +1, 0, 0}` sort to
/// `[0, 0, 0, 1]` (mean `0.25`), and two of four pairs contract. The strata stand on the two
/// candidate readings 40 and 46, with the lower five uppers at 40 and the upper five at 46.
/// Each boundary stratum holds one candidate and one drawn control, and every other stratum
/// sits individually empty with an absent displacement family.
#[test]
#[expect(
    clippy::float_cmp,
    reason = "the forbidden-shortcut restatement compares exact decimal literals"
)]
fn the_readout_reproduces_its_bytes_and_pins_exact_decimal_aggregates() {
    let (groups, edges) = readout_index();
    let (zero, canonical) = readout_frames();

    let evidence = measure(
        &snapshot(),
        &reproducibility(),
        &groups,
        &edges,
        frame(&zero),
        frame(&canonical),
    )
    .expect("the fixture preimage serializes");
    let repeat = measure(
        &snapshot(),
        &reproducibility(),
        &groups,
        &edges,
        frame(&zero),
        frame(&canonical),
    )
    .expect("the fixture preimage serializes");

    assert_eq!(
        serde_json::to_vec(&evidence).expect("the body serializes"),
        serde_json::to_vec(&repeat).expect("the body serializes"),
        "one readout over one input reproduces its bytes",
    );

    let single = |reading: f64| {
        json!({
            "q05": reading, "q25": reading, "q50": reading,
            "q75": reading, "q95": reading, "mean": reading,
        })
    };
    let empty = |upper: f64| {
        json!({
            "upper": upper, "candidates": 0, "selected": 0, "displacement": null,
        })
    };
    let value = serde_json::to_value(&evidence).expect("the body serializes");
    assert_eq!(
        value,
        json!({
            "rule": 1,
            "salt": salt(),
            "rank_window": 256,
            "pair_candidates": 4,
            "pairs_selected": 4,
            "control_candidates": 2,
            "controls_selected": 2,
            "outcome": "measured",
            "pairs": {
                "count": 4,
                "distance": {
                    "q05": -6.0, "q25": -6.0, "q50": -1.0,
                    "q75": 0.0, "q95": 4.0, "mean": -0.75,
                },
                "rank": {
                    "q05": 0.0, "q25": 0.0, "q50": 0.0,
                    "q75": 0.0, "q95": 1.0, "mean": 0.25,
                },
                "contracting": 0.5,
                "rank_improving": 0.0,
            },
            "deciles": [
                {
                    "upper": 40.0, "candidates": 1, "selected": 1,
                    "displacement": single(3.0),
                },
                empty(40.0), empty(40.0), empty(40.0), empty(40.0),
                {
                    "upper": 46.0, "candidates": 1, "selected": 1,
                    "displacement": single(5.0),
                },
                empty(46.0), empty(46.0), empty(46.0), empty(46.0),
            ],
        }),
    );

    // The step medians are 2 and 4, giving difference −2. The pair-difference median is −1.
    // Therefore the pair-first aggregate distinguishes these two calculations.
    let typed = |readings: [f64; 4]| {
        readings.map(|reading| DFinite::new(reading).expect("the fixture readings are finite"))
    };
    let canonical = typed([2.0, 9.0, 2.0, 4.0]);
    let zero = typed([8.0, 5.0, 3.0, 4.0]);
    let shortcut =
        MovementAggregate::over(&canonical).q50.get() - MovementAggregate::over(&zero).q50.get();
    assert_eq!(shortcut, -2.0);
    assert_eq!(value["pairs"]["distance"]["q50"], json!(-1.0));
}
