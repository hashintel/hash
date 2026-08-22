//! Unit suite over the data-level constructor, fakes only.

use alloc::{borrow::Cow, collections::VecDeque};
use core::num::NonZero;

use hashql_core::id::IdSlice;

use super::{
    ArrivalReplay, Pair,
    design::{NeighbourhoodDesign, ReplaySizes},
    draw::{DrawSizes, DrawnSamples},
    error::ReplayError,
    extract::GenerationColumns,
    path::{ArrivalPlacement, NonFinitePlacement, PublishPath},
    population::{ArrivalClassIndex, ArrivalIndex, Novelty, Populations, StableClassIndex},
    report::{IncidentEdgeSummary, OutcomeCounts, PlacementOutcome, ReplayReport},
};
use crate::{
    dataset::{PROJECTOR_DIMENSIONS, TemporalAxes},
    file::generation::GenerationId,
    identity::{EdgeRowId, NodeRowId},
    math::{AlignedVecN, MatrixN, Vec2},
    progress::NoProgress,
};

/// A deterministic entity identity per fixture ordinal.
fn entity(ordinal: u128) -> crate::postgres::id::ArchivedEntityId {
    crate::postgres::id::ArchivedEntityId {
        web_id: uuid::Uuid::from_u128(1).into(),
        entity_uuid: uuid::Uuid::from_u128(ordinal).into(),
    }
}

fn generation(ordinal: u8) -> GenerationId {
    format!("{ordinal:064x}")
        .parse()
        .expect("a 64-digit hex literal is a generation id")
}

/// A node row id from a fixture ordinal.
const fn row(value: u64) -> NodeRowId {
    NodeRowId::new(value)
}

fn axes(seconds: i64) -> TemporalAxes {
    TemporalAxes {
        transaction_time: hash_graph_temporal_versioning::Timestamp::from_unix_timestamp(seconds),
        decision_time: hash_graph_temporal_versioning::Timestamp::from_unix_timestamp(seconds),
    }
}

/// One fabricated corpus of rows on the unit circle of the representation's leading 2-plane.
///
/// Each row's representation points at its angle and its wire coordinate is the same point,
/// so representation-space and wire-space orderings agree exactly for angles within one
/// half-turn of each other - the geometry every faithful-path certificate leans on. Equal
/// angles produce byte-equal representations.
struct Corpus {
    ids: Vec<crate::postgres::id::ArchivedEntityId>,
    representations: MatrixN<PROJECTOR_DIMENSIONS>,
    wire: Vec<Vec2>,
}

impl Corpus {
    fn new(rows: &[(u128, f32)]) -> Self {
        let mut corpus = Self::decoupled(
            rows,
            rows.iter()
                .map(|&(_, angle)| Vec2::new(angle.cos(), angle.sin()))
                .collect(),
        );
        corpus.wire.truncate(rows.len());
        corpus
    }

    /// A corpus whose wire coordinates are chosen freely, decoupled from the representations.
    fn decoupled(rows: &[(u128, f32)], wire: Vec<Vec2>) -> Self {
        let mut representations = MatrixN::zeroed(rows.len());
        for (slot, &(_, angle)) in representations.rows_mut().iter_mut().zip(rows) {
            slot.as_array_mut()[0] = angle.cos();
            slot.as_array_mut()[1] = angle.sin();
        }

        Self {
            ids: rows.iter().map(|&(ordinal, _)| entity(ordinal)).collect(),
            representations,
            wire,
        }
    }

    fn columns(&self, id: GenerationId, at: Option<TemporalAxes>) -> GenerationColumns<'_> {
        GenerationColumns::new(
            id,
            at,
            IdSlice::from_raw(&self.ids),
            IdSlice::from_raw(self.representations.rows()),
            IdSlice::from_raw(&self.wire),
        )
        .expect("the fabricated columns are coherent")
    }
}

/// The standing pair holds five stable rows, one revised row, one departure, and two arrivals.
///
/// The later generation's arrivals sit at rows 6 (entity 8, novel) and 7 (entity 9, whose
/// bytes equal the departed entity 7's, hence seen). Entity 6 revises its bytes between the
/// generations. Every stable row is byte-distinct, so stable classes and stable rows
/// coincide.
fn standing_pair() -> (Corpus, Corpus) {
    let earlier = Corpus::new(&[
        (1, 0.1),
        (2, 0.5),
        (3, 0.9),
        (4, 1.3),
        (5, 1.7),
        (6, 0.7),
        (7, 2.3),
    ]);
    let later = Corpus::new(&[
        (1, 0.1),
        (2, 0.5),
        (3, 0.9),
        (4, 1.3),
        (5, 1.7),
        (6, 0.8),
        (8, 2.1),
        (9, 2.3),
    ]);
    (earlier, later)
}

/// An endpoint pair of node row ids, little-endian by construction.
const fn edge(source: u64, target: u64) -> [NodeRowId; 2] {
    [row(source), row(target)]
}

/// The standing pair's later-generation edges.
///
/// Arrival row 6 touches stable row 0 and revised row 5. Arrival row 7 carries one
/// self-referential edge, and rows 0 and 1 share an edge no query touches.
const STANDING_EDGES: &IdSlice<EdgeRowId, [NodeRowId; 2]> =
    IdSlice::from_raw(&[edge(6, 0), edge(6, 5), edge(7, 7), edge(0, 1)]);

/// An edgeless later generation.
const NO_EDGES: &IdSlice<EdgeRowId, [NodeRowId; 2]> = IdSlice::from_raw(&[]);

fn one_neighbourhood() -> ReplaySizes {
    ReplaySizes {
        queries: NonZero::new(4).expect("the fixture query cap is nonzero"),
        comparisons: NonZero::new(4).expect("the fixture universe is nonzero"),
        controls: NonZero::new(1).expect("the fixture control count is nonzero"),
        neighbourhoods: Cow::Owned(vec![
            NonZero::new(1).expect("the fixture neighbourhood size is nonzero"),
        ]),
        ..
    }
}

fn standing_replay(seed: u64) -> Result<ArrivalReplay, ReplayError> {
    let (earlier, later) = standing_pair();
    ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: later.columns(generation(2), Some(axes(200))),
        },
        STANDING_EDGES,
        seed,
        &one_neighbourhood(),
    )
}

/// The faithful path, projecting each row to the wire point its own leading components name.
///
/// On the aligned fixture geometry this reproduces every universe member's published wire
/// coordinate exactly, so the deployed ordering equals the reference ordering.
struct PlanarPath;

impl PublishPath for PlanarPath {
    fn project(
        &mut self,
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    ) -> Result<impl IntoIterator<Item = ArrivalPlacement>, NonFinitePlacement> {
        Ok(embeddings
            .iter()
            .map(|embedding| ArrivalPlacement::Placed {
                wire: Vec2::new(embedding.as_array()[0], embedding.as_array()[1]),
            })
            .collect::<Vec<_>>())
    }
}

/// A path answering from a script, recording each call's batch width.
struct ScriptedPath {
    script: VecDeque<Result<Vec<ArrivalPlacement>, NonFinitePlacement>>,
    calls: Vec<usize>,
}

impl PublishPath for ScriptedPath {
    fn project(
        &mut self,
        embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
    ) -> Result<impl IntoIterator<Item = ArrivalPlacement>, NonFinitePlacement> {
        self.calls.push(embeddings.len());
        self.script
            .pop_front()
            .expect("the script covers every call")
    }
}

#[test]
fn partition_standing_pair() {
    let (earlier, later) = standing_pair();
    let populations = Populations::new(&Pair {
        earlier: earlier.columns(generation(1), Some(axes(100))),
        later: later.columns(generation(2), Some(axes(200))),
    });

    assert_eq!(populations.stable.len(), 5);
    assert!(
        populations
            .stable
            .iter()
            .all(|pair| pair.earlier_row == pair.later_row && pair.later_row < row(5)),
        "the five shared byte-equal identities sit on matching rows",
    );
    assert_eq!(populations.revised, 1);
    assert_eq!(populations.arrivals.len(), 2);
    assert_eq!(populations.arrivals[ArrivalIndex::new(0)].later_row, row(6));
    assert_eq!(
        populations.arrivals[ArrivalIndex::new(0)].novelty,
        Novelty::Novel
    );
    assert_eq!(populations.arrivals[ArrivalIndex::new(1)].later_row, row(7));
    assert_eq!(
        populations.arrivals[ArrivalIndex::new(1)].novelty,
        Novelty::Seen
    );
    assert_eq!(populations.arrivals_seen, 1);
}

#[test]
fn class_formation() {
    // Stable rows pair up at angles 0.2 and 0.9 beside a singleton at
    // 1.6, forming three byte-classes. The arrivals hold one duplicated
    // novel class and one seen singleton.
    let earlier = Corpus::new(&[(1, 0.2), (2, 0.2), (3, 0.9), (4, 0.9), (5, 1.6), (6, 2.3)]);
    let later = Corpus::new(&[
        (1, 0.2),
        (2, 0.2),
        (3, 0.9),
        (4, 0.9),
        (5, 1.6),
        (8, 2.1),
        (9, 2.1),
        (10, 2.3),
    ]);
    let populations = Populations::new(&Pair {
        earlier: earlier.columns(generation(1), Some(axes(100))),
        later: later.columns(generation(2), Some(axes(200))),
    });

    let stable = populations.stable_classes(IdSlice::from_raw(later.representations.rows()));
    let stable_class = StableClassIndex::new;
    assert_eq!(stable.len(), 3);
    assert_eq!(stable[stable_class(0)].representative.later_row, row(0));
    assert_eq!(stable[stable_class(0)].members, 2);
    assert_eq!(stable[stable_class(1)].representative.later_row, row(2));
    assert_eq!(stable[stable_class(1)].members, 2);
    assert_eq!(stable[stable_class(2)].representative.later_row, row(4));
    assert_eq!(stable[stable_class(2)].members, 1);

    let arrivals = populations.arrival_classes(IdSlice::from_raw(later.representations.rows()));
    let arrival_class = ArrivalClassIndex::new;
    assert_eq!(arrivals.len(), 2);
    assert_eq!(arrivals[arrival_class(0)].representative_row, row(5));
    assert_eq!(arrivals[arrival_class(0)].members, 2);
    assert_eq!(arrivals[arrival_class(0)].novelty, Novelty::Novel);
    assert_eq!(arrivals[arrival_class(1)].representative_row, row(7));
    assert_eq!(arrivals[arrival_class(1)].members, 1);
    assert_eq!(arrivals[arrival_class(1)].novelty, Novelty::Seen);
}

#[test]
fn axes_unrecorded() {
    let (earlier, later) = standing_pair();
    let result = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), None),
            later: later.columns(generation(2), Some(axes(200))),
        },
        STANDING_EDGES,
        0,
        &one_neighbourhood(),
    );

    assert!(matches!(
        result,
        Err(ReplayError::UnrecordedTemporalAxes { generation: named }) if named == generation(1),
    ));
}

#[test]
fn pair_unordered() {
    let (earlier, later) = standing_pair();
    for (earlier_at, later_at) in [(200, 100), (150, 150)] {
        let result = ArrivalReplay::from_columns(
            &Pair {
                earlier: earlier.columns(generation(1), Some(axes(earlier_at))),
                later: later.columns(generation(2), Some(axes(later_at))),
            },
            STANDING_EDGES,
            0,
            &one_neighbourhood(),
        );

        assert!(
            matches!(result, Err(ReplayError::OrderViolation { .. })),
            "transaction times {earlier_at} and {later_at} must refuse",
        );
    }
}

#[test]
fn arrivals_empty() {
    let (earlier, _) = standing_pair();
    let unchanged = Corpus::new(&[
        (1, 0.1),
        (2, 0.5),
        (3, 0.9),
        (4, 1.3),
        (5, 1.7),
        (6, 0.7),
        (7, 2.3),
    ]);
    let result = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: unchanged.columns(generation(2), Some(axes(200))),
        },
        NO_EDGES,
        0,
        &one_neighbourhood(),
    );

    assert!(matches!(result, Err(ReplayError::EmptyArrivals)));
}

#[test]
fn stable_insufficient() {
    let (earlier, later) = standing_pair();
    let result = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: later.columns(generation(2), Some(axes(200))),
        },
        STANDING_EDGES,
        0,
        &ReplaySizes {
            comparisons: NonZero::new(5).expect("the fixture universe is nonzero"),
            ..one_neighbourhood()
        },
    );

    assert!(matches!(
        result,
        Err(ReplayError::InsufficientStableRows {
            stable: 5,
            comparisons: 5,
            controls: 1,
        }),
    ));
}

#[test]
fn stable_classes_insufficient() {
    // Stable rows outnumber their three byte-classes: the entity
    // population hosts the joint draw while the class population
    // cannot.
    let earlier = Corpus::new(&[(1, 0.2), (2, 0.2), (3, 0.9), (4, 0.9), (5, 1.6), (6, 1.6)]);
    let later = Corpus::new(&[
        (1, 0.2),
        (2, 0.2),
        (3, 0.9),
        (4, 0.9),
        (5, 1.6),
        (6, 1.6),
        (8, 2.1),
    ]);
    let result = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: later.columns(generation(2), Some(axes(200))),
        },
        NO_EDGES,
        0,
        &one_neighbourhood(),
    );

    assert!(matches!(
        result,
        Err(ReplayError::InsufficientStableClasses {
            classes: 3,
            comparisons: 4,
            controls: 1,
        }),
    ));
}

#[test]
fn neighbourhood_oversized() {
    let (earlier, later) = standing_pair();
    let result = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: later.columns(generation(2), Some(axes(200))),
        },
        STANDING_EDGES,
        0,
        &ReplaySizes {
            neighbourhoods: Cow::Owned(vec![
                NonZero::new(3).expect("the fixture neighbourhood size is nonzero"),
            ]),
            ..one_neighbourhood()
        },
    );

    assert!(matches!(
        result,
        Err(ReplayError::NeighbourhoodDesign { universe: 4, .. }),
    ));
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "the fixture geometry makes every reading exact: shared counts divide evenly and \
              zero penalties normalize to exactly one"
)]
fn faithful_path_optimum() {
    let replay = standing_replay(7).expect("the standing pair carries the design");
    let report = replay.report(&mut PlanarPath, &NoProgress);

    assert_eq!(report.populations.arrivals_seen, 1);
    assert_eq!(report.populations.arrivals_novel, 1);
    assert_eq!(report.populations.arrival_classes_seen, 1);
    assert_eq!(report.populations.arrival_classes_novel, 1);
    assert_eq!(report.populations.stable, 5);
    assert_eq!(report.populations.stable_classes, 5);
    assert_eq!(report.populations.revised, 1);
    assert_eq!(report.populations.sampled_queries_seen, 1);
    assert_eq!(report.populations.sampled_queries_novel, 1);
    assert_eq!(report.populations.sampled_class_queries_seen, 1);
    assert_eq!(report.populations.sampled_class_queries_novel, 1);
    assert_eq!(report.populations.sampled_comparisons, 4);
    assert_eq!(report.populations.sampled_class_comparisons, 4);
    assert_eq!(report.populations.deduplicated_comparisons, 4);
    assert_eq!(report.populations.sampled_controls, 1);
    assert_eq!(report.populations.sampled_class_controls, 1);
    let placed_pair = OutcomeCounts {
        placed: 2,
        out_of_frame: 0,
        non_finite: 0,
    };
    assert_eq!(report.outcomes, placed_pair);
    assert_eq!(report.class_outcomes, placed_pair);

    // The fixture geometry makes every ordering agree, so each reading
    // sits at its optimum and every paired difference is exactly zero.
    let block = &report.neighbourhoods[0];
    let class_block = &report.class_neighbourhoods[0];
    for (name, row) in [
        ("deployed", &block.deployed),
        ("refit", &block.refit),
        ("controls", &block.controls),
        ("class deployed", &class_block.deployed),
        ("class refit", &class_block.refit),
        ("class controls", &class_block.controls),
        ("dedup deployed", &report.deduplicated[0].deployed),
        ("dedup refit", &report.deduplicated[0].refit),
        ("dedup controls", &report.deduplicated[0].controls),
    ] {
        let row = row.as_ref().unwrap_or_else(|| panic!("{name} has queries"));
        assert_eq!(row.recall.get(), 1.0, "{name} recall");
        assert_eq!(row.trustworthiness.get(), 1.0, "{name} trustworthiness");
        assert_eq!(row.continuity.get(), 1.0, "{name} continuity");
        assert_eq!(row.intrusion_rate.get(), 0.0, "{name} intrusions");
        assert_eq!(row.extrusion_rate.get(), 0.0, "{name} extrusions");
    }
    assert_eq!(block.deployed.expect("two placed queries").queries, 2);
    assert_eq!(block.deployed_seen.expect("one seen query").queries, 1);
    assert_eq!(block.deployed_novel.expect("one novel query").queries, 1);
    assert_eq!(class_block.deployed.expect("two placed classes").queries, 2,);
    let paired = block.paired.expect("two placed queries pair");
    assert_eq!(paired.queries, 2);
    assert_eq!(paired.mean.recall, 0.0);
    assert_eq!(paired.mean.trustworthiness, 0.0);
    let class_paired = class_block.paired.expect("two placed classes pair");
    assert_eq!(class_paired.queries, 2);
    assert_eq!(class_paired.mean.recall, 0.0);

    // Per-query rows ride ascending by later row. The novel arrival
    // comes first and the seen one second, each placed with zero
    // difference. The arrival classes are singletons on the same rows,
    // so the class rows mirror them with member count one.
    assert_eq!(report.queries.len(), 2);
    assert_eq!(report.queries[0].novelty, Novelty::Novel);
    assert_eq!(report.queries[0].entity, entity(8).into());
    assert_eq!(report.queries[1].novelty, Novelty::Seen);
    assert_eq!(report.queries[1].entity, entity(9).into());
    for query in &report.queries {
        assert_eq!(query.outcome, PlacementOutcome::Placed);
        let readings = &query.readings[0];
        assert_eq!(readings.refit.recall.get(), 1.0);
        assert_eq!(
            readings
                .deployed
                .expect("a placed query reads")
                .recall
                .get(),
            1.0,
        );
        assert_eq!(
            readings.difference.expect("a placed query pairs").recall,
            0.0,
        );
    }
    assert_eq!(report.class_queries.len(), 2);
    assert_eq!(report.class_queries[0].entity, entity(8).into());
    assert_eq!(report.class_queries[0].members, 1);
    assert_eq!(report.class_queries[1].entity, entity(9).into());
    assert_eq!(report.class_queries[1].members, 1);
    assert_eq!(report.controls.len(), 1);
    assert_eq!(report.controls[0].readings[0].reading.recall.get(), 1.0);
    assert_eq!(report.class_controls.len(), 1);
    assert_eq!(report.class_controls[0].members, 1);
}

#[test]
fn incident_edges_once() {
    let replay = standing_replay(7).expect("the standing pair carries the design");
    let report = replay.report(&mut PlanarPath, &NoProgress);

    // Arrival 8 touches one stable and one revised row; arrival 9
    // carries only its self-referential edge, which counts once. The
    // class rows read the same representatives' stats.
    assert_eq!(report.queries[0].degree, 2);
    assert_eq!(report.queries[0].stable_incident, 1);
    assert_eq!(report.queries[1].degree, 1);
    assert_eq!(report.queries[1].stable_incident, 0);
    assert_eq!(report.class_queries[0].degree, 2);
    assert_eq!(report.class_queries[0].stable_incident, 1);
    assert_eq!(
        report.incident_edges,
        IncidentEdgeSummary {
            queries_with_stable_edge: 1,
            total_incident: 3,
            total_into_stable: 1,
        },
    );
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "the fixture geometry makes the refit readings exactly one"
)]
fn out_of_frame_keeps_refit() {
    struct Outside;
    impl PublishPath for Outside {
        fn project(
            &mut self,
            embeddings: &[AlignedVecN<PROJECTOR_DIMENSIONS>],
        ) -> Result<impl IntoIterator<Item = ArrivalPlacement>, NonFinitePlacement> {
            Ok(embeddings
                .iter()
                .map(|_| ArrivalPlacement::OutOfFrame {
                    world: Vec2::new(9.0, 9.0),
                })
                .collect::<Vec<_>>())
        }
    }

    let replay = standing_replay(7).expect("the standing pair carries the design");
    let report = replay.report(&mut Outside, &NoProgress);

    let all_outside = OutcomeCounts {
        placed: 0,
        out_of_frame: 2,
        non_finite: 0,
    };
    assert_eq!(report.outcomes, all_outside);
    assert_eq!(report.class_outcomes, all_outside);
    let block = &report.neighbourhoods[0];
    assert!(block.deployed.is_none(), "no placed query reads deployed");
    assert!(block.paired.is_none(), "no placed query pairs");
    assert_eq!(block.refit.expect("every query reads refit").queries, 2);
    assert!(report.class_neighbourhoods[0].deployed.is_none());
    for query in &report.queries {
        assert_eq!(query.outcome, PlacementOutcome::OutOfFrame);
        assert!(query.readings[0].deployed.is_none());
        assert!(query.readings[0].difference.is_none());
        assert_eq!(query.readings[0].refit.recall.get(), 1.0);
    }
}

#[test]
fn non_finite_retry() {
    let replay = standing_replay(7).expect("the standing pair carries the design");

    // Both estimands sample the same two arrival rows, so the plan
    // projects two distinct rows in one batch whose first row fails
    // non-finitely, and the path is asked again for the remainder
    // alone.
    let placed = ArrivalPlacement::Placed {
        wire: Vec2::new(0.5, 0.5),
    };
    let mut path = ScriptedPath {
        script: VecDeque::from([Err(NonFinitePlacement { row: 0 }), Ok(vec![placed])]),
        calls: Vec::new(),
    };
    let report = replay.report(&mut path, &NoProgress);

    assert_eq!(path.calls, vec![2, 1]);
    let split = OutcomeCounts {
        placed: 1,
        out_of_frame: 0,
        non_finite: 1,
    };
    assert_eq!(report.outcomes, split);
    assert_eq!(report.queries[0].outcome, PlacementOutcome::NonFinite);
    assert!(report.queries[0].readings[0].deployed.is_none());
    assert_eq!(report.queries[1].outcome, PlacementOutcome::Placed);
    assert_eq!(
        report.neighbourhoods[0]
            .deployed
            .expect("one placed query")
            .queries,
        1,
    );

    // The class estimand's representatives are the same rows, so each
    // class row reads the one projection its row received.
    assert_eq!(report.class_outcomes, split);
    assert_eq!(report.class_queries[0].outcome, PlacementOutcome::NonFinite);
    assert_eq!(report.class_queries[1].outcome, PlacementOutcome::Placed);
}

#[test]
fn non_finite_mid_batch_split() {
    // A third arrival widens the plan to three rows so the failure can
    // sit strictly inside the batch.
    let earlier = Corpus::new(&[(1, 0.1), (2, 0.5), (3, 0.9), (4, 1.3), (5, 1.7)]);
    let later = Corpus::new(&[
        (1, 0.1),
        (2, 0.5),
        (3, 0.9),
        (4, 1.3),
        (5, 1.7),
        (8, 2.1),
        (9, 2.3),
        (10, 0.3),
    ]);
    let replay = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: later.columns(generation(2), Some(axes(200))),
        },
        NO_EDGES,
        0,
        &one_neighbourhood(),
    )
    .expect("the widened pair carries the design");

    let placed = ArrivalPlacement::Placed {
        wire: Vec2::new(0.5, 0.5),
    };
    let mut path = ScriptedPath {
        script: VecDeque::from([
            Err(NonFinitePlacement { row: 1 }),
            Ok(vec![placed]),
            Ok(vec![placed]),
        ]),
        calls: Vec::new(),
    };
    let report = replay.report(&mut path, &NoProgress);

    assert_eq!(path.calls, vec![3, 1, 1]);
    assert_eq!(
        report.outcomes,
        OutcomeCounts {
            placed: 2,
            out_of_frame: 0,
            non_finite: 1,
        },
    );
    assert_eq!(report.queries[0].outcome, PlacementOutcome::Placed);
    assert_eq!(report.queries[1].outcome, PlacementOutcome::NonFinite);
    assert_eq!(report.queries[2].outcome, PlacementOutcome::Placed);
}

#[test]
fn duplicate_rows_dedup() {
    // The stable population spreads eight rows over six byte-classes
    // (two duplicate pairs, four singletons), so the sampled entity
    // universe of four rows deduplicates to between two and four
    // representatives while both estimands' joint draws still fit.
    let earlier = Corpus::new(&[
        (1, 0.2),
        (2, 0.2),
        (3, 0.9),
        (4, 0.9),
        (5, 1.3),
        (6, 1.6),
        (7, 0.5),
        (11, 2.0),
    ]);
    let later = Corpus::new(&[
        (1, 0.2),
        (2, 0.2),
        (3, 0.9),
        (4, 0.9),
        (5, 1.3),
        (6, 1.6),
        (7, 0.5),
        (11, 2.0),
        (8, 2.4),
    ]);
    let replay = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: later.columns(generation(2), Some(axes(200))),
        },
        NO_EDGES,
        0,
        &one_neighbourhood(),
    )
    .expect("the duplicated pair carries the design");

    let report = replay.report(&mut PlanarPath, &NoProgress);

    assert_eq!(report.populations.stable, 8);
    assert_eq!(report.populations.stable_classes, 6);
    assert_eq!(report.populations.sampled_comparisons, 4);
    assert_eq!(report.populations.sampled_class_comparisons, 4);
    assert!(
        (2..=4).contains(&report.populations.deduplicated_comparisons),
        "four rows over six classes deduplicate to between two and four",
    );
    assert!(report.deduplicated[0].refit.is_some());
    assert!(report.deduplicated[0].deployed.is_some());
}

#[test]
fn seed_replay() {
    let one = standing_replay(42)
        .expect("the standing pair carries the design")
        .report(&mut PlanarPath, &NoProgress);
    let two = standing_replay(42)
        .expect("the standing pair carries the design")
        .report(&mut PlanarPath, &NoProgress);

    assert_eq!(one, two);
}

#[test]
fn report_roundtrip() {
    let report = standing_replay(7)
        .expect("the standing pair carries the design")
        .report(&mut PlanarPath, &NoProgress);

    let serialized = serde_json::to_string(&report).expect("the report serializes");
    let reopened: ReplayReport =
        serde_json::from_str(&serialized).expect("the report deserializes");

    assert_eq!(report, reopened);
}

#[test]
fn joint_sample_overflow() {
    // A joint request beyond `usize` refuses as insufficient instead of
    // overflowing the addition.
    let (earlier, later) = standing_pair();
    let populations = Populations::new(&Pair {
        earlier: earlier.columns(generation(1), Some(axes(100))),
        later: later.columns(generation(2), Some(axes(200))),
    });
    let stable = populations.stable_classes(IdSlice::from_raw(later.representations.rows()));
    let arrivals = populations.arrival_classes(IdSlice::from_raw(later.representations.rows()));

    let result = DrawnSamples::new(
        0,
        &populations,
        &stable,
        &arrivals,
        &DrawSizes {
            queries: 1,
            comparisons: usize::MAX,
            controls: usize::MAX,
        },
    );

    assert!(matches!(
        result,
        Err(ReplayError::InsufficientStableRows {
            stable: 5,
            comparisons: usize::MAX,
            controls: usize::MAX,
        }),
    ));
}

#[test]
fn horizon_design_refusal() {
    let size = NonZero::new(1).expect("the neighbourhood size is nonzero");
    let factor = NonZero::new(2).expect("the factor is nonzero");

    NeighbourhoodDesign::new(size, 2, 2, factor).expect("a universe of two hosts a size of one");
    assert!(matches!(
        NeighbourhoodDesign::new(size, 1, 1, factor),
        Err(ReplayError::NeighbourhoodDesign { universe: 1, .. }),
    ));
}

#[cfg(target_pointer_width = "64")]
#[test]
fn universe_beyond_rank_domain_refusal() {
    // The standing pair could never host this draw, so reaching the
    // sampling refusals instead would prove the domain check ran late.
    let (earlier, later) = standing_pair();

    let result = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: later.columns(generation(2), Some(axes(200))),
        },
        STANDING_EDGES,
        7,
        &ReplaySizes {
            comparisons: NonZero::new(1_usize << 32).expect("the request is nonzero"),
            ..
        },
    );

    assert!(matches!(
        result,
        Err(ReplayError::UniverseBeyondRankDomain { comparisons }) if comparisons == 1_usize << 32,
    ));
}

/// Both derivation fixtures pin the metric wiring numerically, so their sizes ride together.
fn derivation_sizes() -> ReplaySizes {
    ReplaySizes {
        queries: NonZero::new(1).expect("the fixture query cap is nonzero"),
        comparisons: NonZero::new(4).expect("the fixture universe is nonzero"),
        controls: NonZero::new(1).expect("the fixture control count is nonzero"),
        neighbourhoods: Cow::Owned(vec![
            NonZero::new(1).expect("the fixture neighbourhood size is nonzero"),
        ]),
        ..
    }
}

/// Runs one derivation fixture's single arrival through one scripted outcome.
fn derivation_report(pair: (Corpus, Corpus), outcome: ArrivalPlacement) -> ReplayReport {
    let (earlier, later) = pair;
    let replay = ArrivalReplay::from_columns(
        &Pair {
            earlier: earlier.columns(generation(1), Some(axes(100))),
            later: later.columns(generation(2), Some(axes(200))),
        },
        NO_EDGES,
        12345,
        &derivation_sizes(),
    )
    .expect("the derivation pair carries the design");

    let mut path = ScriptedPath {
        script: VecDeque::from([Ok(vec![outcome])]),
        calls: Vec::new(),
    };
    let report = replay.report(&mut path, &NoProgress);

    // Both estimands sample the same single arrival row, projected once.
    assert_eq!(path.calls, vec![1]);

    report
}

/// The decoupled corpus pair the orientation witness reads.
///
/// The geometry is derived value by value in the comments of `metric_orientation`.
fn orientation_pair() -> (Corpus, Corpus) {
    let earlier = Corpus::decoupled(
        &[(1, 0.3), (2, 0.6), (3, 0.6), (4, 0.9), (5, 1.2), (6, 1.6)],
        vec![
            Vec2::new(2.5, 4.0),
            Vec2::new(3.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(2.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(1.0, 0.0),
        ],
    );
    let later = Corpus::decoupled(
        &[
            (1, 0.3),
            (2, 0.6),
            (3, 0.6),
            (4, 0.9),
            (5, 1.2),
            (6, 1.6),
            (8, 2.0),
        ],
        vec![
            Vec2::new(12.0, 0.0),
            Vec2::new(1.0, 0.0),
            Vec2::new(2.0, 0.0),
            Vec2::new(3.0, 0.0),
            Vec2::new(4.0, 0.0),
            Vec2::new(14.0, 0.0),
            Vec2::new(0.0, 0.0),
        ],
    );

    (earlier, later)
}

/// The imbalanced corpus pair the class-weighting witness reads.
///
/// The class structure is derived value by value in the comments of `class_weighting`.
fn weighting_pair() -> (Corpus, Corpus) {
    let earlier = Corpus::decoupled(
        &[
            (1, 0.4),
            (2, 0.4),
            (3, 0.4),
            (4, 0.8),
            (5, 1.2),
            (6, 1.6),
            (7, 2.0),
        ],
        vec![
            Vec2::new(10.0, 0.0),
            Vec2::new(11.0, 0.0),
            Vec2::new(12.0, 0.0),
            Vec2::new(13.0, 0.0),
            Vec2::new(14.0, 0.0),
            Vec2::new(15.0, 0.0),
            Vec2::new(16.0, 0.0),
        ],
    );
    let later = Corpus::decoupled(
        &[
            (1, 0.4),
            (2, 0.4),
            (3, 0.4),
            (4, 0.8),
            (5, 1.2),
            (6, 1.6),
            (7, 2.0),
            (8, 2.6),
        ],
        vec![
            Vec2::new(3.0, 0.0),
            Vec2::new(1.1, 0.0),
            Vec2::new(1.2, 0.0),
            Vec2::new(5.0, 0.0),
            Vec2::new(2.0, 0.0),
            Vec2::new(7.0, 0.0),
            Vec2::new(8.0, 0.0),
            Vec2::new(0.0, 0.0),
        ],
    );

    (earlier, later)
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "the comparisons are deliberately exact: each expected value either repeats the \
              kernel's own f64 operations, so both sides round identically, or reaches the same \
              bits through individually exact f64 steps, and every wire coordinate and designed \
              tie is exact in f32"
)]
fn metric_orientation() {
    // The stable rows are entities 1..=6 with rows 1 and 2 byte-equal,
    // leaving five stable classes, and one novel arrival sits at row
    // 6. Wire columns are
    // decoupled from the representations to make trustworthiness and
    // continuity read different values: a swapped by_reference/by_map
    // argument pair anywhere in the wiring exchanges them and fails
    // here. Every expected value is hand-derived from the rank-kernel
    // definitions at k = 1, horizon 2.
    //
    // Seed 12345 realizes these draws (pinned by the seeded sampler):
    //   entity universe = rows {1, 2, 3, 4} (positions p0..p3),
    //   entity control  = row 0,
    //   dedup representatives = positions {0, 2, 3} (rows 1, 3, 4),
    //   class universe  = representative rows {0, 1, 3, 5} (cp0..cp3),
    //   class control   = row 4 (entity 5).
    //
    // Reference geometry (angles): query 2.0 against rows at 0.3, 0.6,
    // 0.6, 0.9, 1.2, 1.6 - the entity reference ordering over the
    // universe is therefore [p3, p2, p0, p1] (the byte-equal pair ties
    // exactly and breaks by position), and the class reference ordering
    // is [cp3, cp2, cp1, cp0].
    //
    // Refit wires put the reference-farthest nearest: entity refit
    // ordering [p0, p1, p2, p3], class refit [cp1, cp2, cp0, cp3].
    // Entity refit at k=1, m=4 (worst = 3): the refit-nearest p0 sits
    // at reference rank 2, and that penalty of 2 passes horizon 2, so
    // trust = 1 - 2/3 with intrusion = 1. The reference-nearest p3 has
    // refit rank 3 (penalty 3), giving continuity = 0 with extrusion
    // = 1.
    // Trust and continuity read different values, which is the
    // orientation witness. Dedup refit at m' = 3 (worst = 2): the same
    // penalties normalize to trust 1 - 2/2 = 0, the normalizer split
    // made numeric. Class refit at m = 4: nearest cp1 has reference
    // rank 2 (trust 1/3, intrusion), reference-nearest cp3 sits last
    // (continuity 0, extrusion).
    //
    // The scripted path places the arrival at the earlier-frame origin,
    // where the earlier wire column mirrors the reference order, so
    // every deployed reading is optimal and the paired differences are
    // recall +1, trust +2/3, continuity +1, intrusion -1, extrusion -1.
    //
    // The entity control (row 0) reads from earlier wire (2.5, 4)
    // against members at x = 3, 4, 2, 1 on the axis: two designed exact
    // ties (16.25 against p0/p2 and 18.25 against p1/p3) break by
    // ascending position, and the byte-equal pair ties exactly in
    // reference space, so the control reads optimal through three real
    // ties. The class control (row 4) reference-ranks row 3
    // nearest (0.3 against row 5's 0.4) while its map ordering leads
    // with cp3, penalty 1 on each side: trust = continuity = 1 - 1/3.
    let report = derivation_report(
        orientation_pair(),
        ArrivalPlacement::Placed {
            wire: Vec2::new(0.0, 0.0),
        },
    );

    assert_eq!(report.populations.stable, 6);
    assert_eq!(report.populations.stable_classes, 5);
    assert_eq!(report.populations.arrivals_novel, 1);
    assert_eq!(report.populations.deduplicated_comparisons, 3);
    assert_eq!(report.controls[0].entity, entity(1).into());
    assert_eq!(report.class_controls[0].entity, entity(5).into());

    let refit = report.neighbourhoods[0].refit.expect("one query reads");
    assert_eq!(refit.recall.get(), 0.0, "entity refit recall");
    assert_eq!(
        refit.trustworthiness.get(),
        1.0 - 2.0 / 3.0,
        "entity refit trust: penalty 2 over worst 3",
    );
    assert_eq!(
        refit.continuity.get(),
        0.0,
        "entity refit continuity: penalty 3 over worst 3",
    );
    assert_eq!(refit.intrusion_rate.get(), 1.0);
    assert_eq!(refit.extrusion_rate.get(), 1.0);
    assert!(
        refit.trustworthiness.get() != refit.continuity.get(),
        "the fixture is asymmetric: a trust/continuity swap cannot pass",
    );

    let dedup_refit = report.deduplicated[0].refit.expect("one query reads");
    assert_eq!(
        dedup_refit.trustworthiness.get(),
        0.0,
        "dedup refit trust: the same penalty 2 over the smaller worst 2",
    );
    assert_eq!(dedup_refit.continuity.get(), 0.0);

    let class_refit = report.class_neighbourhoods[0]
        .refit
        .expect("one class reads");
    assert_eq!(class_refit.recall.get(), 0.0);
    assert_eq!(
        class_refit.trustworthiness.get(),
        1.0 - 2.0 / 3.0,
        "class refit trust: penalty 2 over worst 3",
    );
    assert_eq!(class_refit.continuity.get(), 0.0);
    assert_eq!(class_refit.intrusion_rate.get(), 1.0);
    assert_eq!(class_refit.extrusion_rate.get(), 1.0);

    // The deployed placement mirrors the reference order in every
    // family, so each deployed row is optimal.
    for (name, deployed) in [
        ("entity", &report.neighbourhoods[0].deployed),
        ("class", &report.class_neighbourhoods[0].deployed),
        ("dedup", &report.deduplicated[0].deployed),
    ] {
        let deployed = deployed
            .as_ref()
            .unwrap_or_else(|| panic!("{name} deployed reads"));
        assert_eq!(deployed.recall.get(), 1.0, "{name} deployed recall");
        assert_eq!(deployed.trustworthiness.get(), 1.0, "{name} deployed trust");
        assert_eq!(deployed.continuity.get(), 1.0, "{name} deployed continuity");
        assert_eq!(deployed.intrusion_rate.get(), 0.0);
        assert_eq!(deployed.extrusion_rate.get(), 0.0);
    }

    // Paired signs: deployed minus refit, over the one placed query.
    let paired = report.neighbourhoods[0].paired.expect("one placed query");
    assert_eq!(paired.queries, 1);
    assert_eq!(paired.mean.recall, 1.0);
    assert_eq!(paired.mean.trustworthiness, 2.0 / 3.0);
    assert_eq!(paired.mean.continuity, 1.0);
    assert_eq!(paired.mean.intrusion_rate, -1.0);
    assert_eq!(paired.mean.extrusion_rate, -1.0);

    // The one query is novel, so the novel split repeats the whole
    // reading and the seen split is empty.
    assert!(report.neighbourhoods[0].refit_seen.is_none());
    assert_eq!(
        report.neighbourhoods[0]
            .refit_novel
            .expect("the novel split reads")
            .trustworthiness
            .get(),
        1.0 - 2.0 / 3.0,
    );

    // The entity control walks two designed exact wire ties (16.25
    // twice, 18.25 twice) and one byte-equal reference tie, each broken
    // by ascending position, and reads optimal.
    let controls = report.neighbourhoods[0].controls.expect("one control");
    assert_eq!(controls.recall.get(), 1.0);
    assert_eq!(controls.trustworthiness.get(), 1.0);
    assert_eq!(controls.continuity.get(), 1.0);
    let dedup_controls = report.deduplicated[0].controls.expect("one control");
    assert_eq!(dedup_controls.recall.get(), 1.0);

    // The class control's map order leads with cp3 where reference
    // leads with cp2: penalty 1 each side of the worst 3.
    let class_controls = report.class_neighbourhoods[0]
        .controls
        .expect("one class control");
    assert_eq!(class_controls.recall.get(), 0.0);
    assert_eq!(class_controls.trustworthiness.get(), 1.0 - 1.0 / 3.0);
    assert_eq!(class_controls.continuity.get(), 1.0 - 1.0 / 3.0);
    assert_eq!(class_controls.intrusion_rate.get(), 0.0);
    assert_eq!(class_controls.extrusion_rate.get(), 0.0);
}

#[test]
#[expect(
    clippy::float_cmp,
    reason = "the comparisons are deliberately exact: each expected expression repeats the \
              kernel's own f64 operations, so both sides round identically"
)]
fn class_weighting() {
    // The stable population spreads seven rows over five classes: rows
    // 0..=2 share one representation (class A) and rows 3..=6 are
    // singletons. One novel arrival sits at row 7. Each reading family
    // weighs the duplicated class its own way, and the fixture
    // separates every family numerically at k = 1, horizon 2.
    //
    // Seed 12345 realizes these draws (pinned by the seeded sampler):
    //   entity universe = rows {1, 2, 3, 5} (two A copies, B, D),
    //   entity control  = row 0,
    //   dedup representatives = positions {0, 2, 3} (rows 1, 3, 5),
    //   class universe  = representative rows {0, 3, 4, 6} (A, B, C, E),
    //   class control   = class D (row 5).
    //
    // Entity refit, m = 4 (worst = 3): refit order [p0, p1, p2, p3]
    // leads with an A copy whose reference rank is 2 (the pair ties in
    // reference space and breaks by position), so trust = 1 - 2/3;
    // reference-nearest D sits last, continuity = 0. The duplicate pair
    // holds two of four universe slots: entity weighting.
    //
    // Dedup diagnostic, m' = 3 (worst = 2): one A survives and the
    // same penalties normalize to trust = 0, distinguishable from the
    // entity reading. Its membership still follows the entity draw.
    //
    // Class estimand, m = 4 classes at their lowest-row representatives
    // (worst = 3): refit order [cp2, cp0, cp1, cp3] leads with C whose
    // reference rank is 1 (penalty 1, inside the horizon), so trust =
    // 1 - 1/3 and intrusion = 0; reference-nearest E sits last,
    // continuity = 0, extrusion = 1. All three trust values differ:
    // entity 1/3, dedup 0, class 2/3.
    let report = derivation_report(
        weighting_pair(),
        ArrivalPlacement::OutOfFrame {
            world: Vec2::new(9.0, 9.0),
        },
    );

    assert_eq!(report.populations.stable, 7);
    assert_eq!(report.populations.stable_classes, 5);
    assert_eq!(report.populations.deduplicated_comparisons, 3);
    assert_eq!(report.class_controls[0].entity, entity(6).into());
    assert_eq!(report.class_controls[0].members, 1);

    let entity_trust = report.neighbourhoods[0]
        .refit
        .expect("one query reads")
        .trustworthiness
        .get();
    let dedup_trust = report.deduplicated[0]
        .refit
        .expect("one query reads")
        .trustworthiness
        .get();
    let class_trust = report.class_neighbourhoods[0]
        .refit
        .expect("one class reads")
        .trustworthiness
        .get();

    assert_eq!(
        entity_trust,
        1.0 - 2.0 / 3.0,
        "entity weighting: the duplicate pair fills two universe slots",
    );
    assert_eq!(
        dedup_trust, 0.0,
        "within-draw dedup: same penalty over the shrunken normalizer",
    );
    assert_eq!(
        class_trust,
        1.0 - 1.0 / 3.0,
        "class weighting: equal-weight classes at full-population representatives",
    );
    assert!(
        entity_trust != class_trust && dedup_trust != class_trust,
        "the class estimand is numerically distinct from both other families",
    );

    let class_refit = report.class_neighbourhoods[0]
        .refit
        .expect("one class reads");
    assert_eq!(class_refit.intrusion_rate.get(), 0.0);
    assert_eq!(class_refit.extrusion_rate.get(), 1.0);
    assert_eq!(class_refit.continuity.get(), 0.0);

    // Out-of-frame outcomes keep the refit readings while deployed and
    // paired rows stay absent.
    assert_eq!(
        report.outcomes,
        OutcomeCounts {
            placed: 0,
            out_of_frame: 1,
            non_finite: 0,
        },
    );
    assert!(report.neighbourhoods[0].deployed.is_none());
    assert!(report.class_neighbourhoods[0].paired.is_none());
}
