//! Production-writer expectations, salt to serialized evidence body.
//!
//! Each pin runs [`measure`] over constructed index regions and frames and asserts the whole
//! serialized body at once, so the writer's counts, outcome dispatch, and aggregate wiring are
//! checked on the exact path the fit's writer drives.

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

/// Builds the writer fixture's attraction regions, four Proximal pairs over ten corpus rows.
///
/// Edges `(0,1)`, `(2,3)`, `(4,5)`, and `(6,7)` sit in one force-bearing group, so the pair
/// domain is the four oriented pairs, the participant set is rows `0..=7`, and rows 8 and 9
/// are the control candidates. The whole domain sits far under both draw bounds, so every
/// candidate is drawn and no pinned aggregate depends on the salt-keyed order.
fn readout_index() -> (Vec<GroupRecord>, Vec<EdgeRecord<NodeRowId, EdgeRowId>>) {
    (
        vec![group(3, 0, 1.0)],
        vec![edge(0, 1), edge(2, 3), edge(4, 5), edge(6, 7)],
    )
}

/// The writer fixture's aligned frames, exact in every drawn reading.
///
/// The pair clusters sit far apart, and each partner is its source's nearest row at both rungs
/// except one designed movement: row 4 moves ahead of partner 3 at the canonical rung, where
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

/// The `P = 0` reading through the production writer: a present vacuous body.
///
/// The C1 `--vacuous-placement` fixture cannot stand in for this one. A vacuous placement
/// publishes no ladder record at all, while this generation measures its ladder and records a
/// present body whose outcome is vacuous, with the recognized rule and derived salt beside
/// zero counts on both domains.
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

/// An injected typed post-census movement refusal through the production writer.
///
/// The canonical frame arrives one row short, so the census completes both domains and the
/// movement readout refuses the frame pair. A non-finite frame cannot enter here at all: the
/// frames arrive as proven-finite fields. The serialized equality pins the whole body: the
/// completed draw counts persist, the reason names both row counts, and no partial aggregate
/// key exists beside them.
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

/// The aggregation fixture on the production path: exact decimal literals, pinned bytes.
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

    // The forbidden shortcut over the same readings: subtracting the rung medians reads
    // 2 - 4 = -2 where the pair-first median reads -1, so the pinned aggregate cannot have
    // come from rung-aggregate subtraction.
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
