use hash_graph_postgres_store::store::{EntityDeletion, EntityEnd, EntityEvent, EntityUpdate};
use hash_graph_temporal_versioning::{Timestamp, TransactionTime};
use hashql_core::collections::FastHashMap;
use type_system::knowledge::entity::{
    EntityId,
    id::{EntityEditionId, EntityUuid},
    provenance::EntityDeletionProvenance,
};
use uuid::Uuid;

use super::{
    DeltaCell, DeltaEdge, DeltaEvent, DeltaNode, DeltaRegister, DeltaRevision, Disposition,
    IdentityTables, ProjectedArrival, Standing,
    consumer::PollOutcome,
    register::UniverseExhausted,
    staging::{MissAction, StagingPipeline},
};
use crate::{
    dataset::auxiliary::{Icon, Label, OwnedIcon, OwnedLabel, OwnedLegend},
    identity::{EdgeRowId, NodeRowId, OntologyRowId},
    math::{BoxedVecN, Vec2},
    postgres::{
        Classification,
        edition_display::DisplayParts,
        id::{ArchivedEntityId, ArchivedEntityUuid, ArchivedOntologyTypeUuid},
    },
    serve::codec::Universe,
};

/// The fixture generation's base row bound, past every fitted row the tables name.
const BASE: u32 = 100;

/// The fixture generation's tabulated type bound, where ontology row allocation starts.
const ONTOLOGY_BASE: u64 = 8;

/// The fixture generation's fitted edge bound, where edge row allocation starts.
const EDGE_BASE: u64 = 40;

/// An empty register whose row allocation starts at the fixture's bounds.
fn register() -> DeltaRegister {
    DeltaRegister::new(
        Universe::new(slot(BASE)),
        Universe::new(EdgeRowId::new(EDGE_BASE)),
        Universe::new(OntologyRowId::new(ONTOLOGY_BASE)),
    )
}

/// The row id `n` names in the fixture's allocated node domain.
fn slot(n: u32) -> NodeRowId {
    NodeRowId::new(u64::from(n))
}

/// Identity tables over a handful of fitted rows, standing in for a generation.
#[derive(Debug, Default)]
struct Tables {
    nodes: Vec<(ArchivedEntityId, NodeRowId)>,
    edges: Vec<(ArchivedEntityId, EdgeRowId)>,
    ontology: Vec<(ArchivedOntologyTypeUuid, OntologyRowId)>,
}

impl IdentityTables for Tables {
    fn node_row_of(&self, id: ArchivedEntityId) -> Option<NodeRowId> {
        self.nodes
            .iter()
            .find(|&&(key, _)| key == id)
            .map(|&(_, row)| row)
    }

    fn edge_row_of(&self, id: ArchivedEntityId) -> Option<EdgeRowId> {
        self.edges
            .iter()
            .find(|&&(key, _)| key == id)
            .map(|&(_, row)| row)
    }

    fn ontology_row_of(&self, id: ArchivedOntologyTypeUuid) -> Option<OntologyRowId> {
        self.ontology
            .iter()
            .find(|&&(key, _)| key == id)
            .map(|&(_, row)| row)
    }
}

fn entity(n: u128) -> ArchivedEntityId {
    ArchivedEntityId {
        web_id: Uuid::from_u128(0xAB).into(),
        entity_uuid: ArchivedEntityUuid::from_bytes(Uuid::from_u128(n).into_bytes()),
    }
}

fn at(seconds: i64) -> Timestamp<TransactionTime> {
    Timestamp::from_unix_timestamp(seconds)
}

fn edition(n: u128) -> EntityEditionId {
    EntityEditionId::new(Uuid::from_u128(n))
}

fn live(n: u128) -> Standing {
    Standing::Live {
        edition: edition(n),
    }
}

/// The fixture's shared representative type, unknown to the tables, so the register's own
/// extension allocates its row.
fn type_uuid() -> ArchivedOntologyTypeUuid {
    ArchivedOntologyTypeUuid::from(Uuid::from_u128(0xE0))
}

/// A display read answer carrying `text`, the fixture icon, and the fixture's shared
/// representative type.
fn display(text: &str) -> DisplayParts {
    DisplayParts {
        label: OwnedLabel::from(text),
        icon: OwnedIcon::from("capture-icon"),
        representative: type_uuid(),
    }
}

/// The legend the fixture's display read produces: the extension's first ontology row.
fn legend(text: &str) -> OwnedLegend {
    OwnedLegend::new(OntologyRowId::new(ONTOLOGY_BASE), Label::new(text))
}

/// Captures `text` for the identity through `tables`, panicking where the fixture cannot
/// exhaust the ontology domain.
fn capture(
    register: &mut DeltaRegister,
    entity_n: u128,
    edition_n: u128,
    text: &str,
    tables: &Tables,
) {
    let DisplayParts {
        label,
        icon,
        representative,
    } = display(text);
    register
        .capture_display(
            entity(entity_n),
            edition(edition_n),
            &label,
            &icon,
            representative,
            tables,
        )
        .expect("the fixture ontology domain has room");
}

fn link_between(source: u128, target: u128) -> Classification {
    Classification::Edge {
        source: Some(entity(source)),
        target: Some(entity(target)),
    }
}

fn store_id(n: u128) -> EntityId {
    EntityId {
        web_id: type_system::principal::actor_group::WebId::new(Uuid::from_u128(0xAB)),
        entity_uuid: EntityUuid::new(Uuid::from_u128(n)),
        draft_id: None,
    }
}

fn updated(entity_n: u128, seconds: i64, edition_n: u128, archived: bool) -> EntityEvent {
    EntityEvent::Updated(EntityUpdate {
        entity: store_id(entity_n),
        edition: edition(edition_n),
        archived,
        changed_at: at(seconds),
    })
}

fn event(entity_n: u128, seconds: i64, standing: Standing) -> DeltaEvent {
    DeltaEvent {
        entity: entity(entity_n),
        version: at(seconds),
        standing,
    }
}

/// Publishes under fixed publication inputs, so two snapshots compare on resolution alone.
fn snapshot(register: &DeltaRegister, tables: &Tables) -> super::DeltaSnapshot {
    register.snapshot(tables, DeltaRevision::FIRST, at(100))
}

#[test]
fn newer_event_wins() {
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert!(register.apply(event(1, 2, Standing::Withdrawn)));

    assert!(snapshot(&register, &Tables::default()).withdraws(entity(1)));
}

#[test]
fn unarchive_replaces_tombstone() {
    let tables = Tables {
        nodes: vec![(entity(1), NodeRowId::new(4))],
        ..Tables::default()
    };
    let mut register = register();

    assert!(register.apply(event(1, 1, Standing::Withdrawn)));
    assert!(register.apply(event(1, 2, live(10))));

    // The live standing cleared the tombstone, and a fitted live identity resolves to nothing.
    let snapshot = snapshot(&register, &tables);
    assert!(!snapshot.withdraws(entity(1)));
    assert!(!snapshot.withdraws_node(NodeRowId::new(4)));
    assert_eq!(snapshot.staged(entity(1)), None);
}

#[test]
fn older_event_is_ignored() {
    let mut register = register();

    assert!(register.apply(event(1, 2, Standing::Withdrawn)));
    assert!(!register.apply(event(1, 1, live(10))));

    assert!(snapshot(&register, &Tables::default()).withdraws(entity(1)));
}

#[test]
fn redelivery_idempotent() {
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert!(!register.apply(event(1, 1, live(10))));
    assert!(register.apply(event(2, 1, Standing::Withdrawn)));
    assert!(!register.apply(event(2, 1, Standing::Withdrawn)));
}

#[test]
fn equal_version_withdrawn_bias() {
    let tables = Tables::default();

    let mut withdrawal_last = register();
    assert!(withdrawal_last.apply(event(1, 1, live(10))));
    assert!(withdrawal_last.apply(event(1, 1, Standing::Withdrawn)));

    let mut withdrawal_first = register();
    assert!(withdrawal_first.apply(event(1, 1, Standing::Withdrawn)));
    assert!(!withdrawal_first.apply(event(1, 1, live(10))));

    assert!(snapshot(&withdrawal_last, &tables).withdraws(entity(1)));
    assert!(snapshot(&withdrawal_first, &tables).withdraws(entity(1)));
}

#[test]
fn version_moves_without_flipping_standing() {
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    // The same standing at a newer version replaces the register without changing resolution.
    assert!(!register.apply(event(1, 3, live(10))));
    // The version moved even though resolution did not, so an older withdrawal still loses.
    assert!(!register.apply(event(1, 2, Standing::Withdrawn)));

    assert!(!snapshot(&register, &Tables::default()).withdraws(entity(1)));
}

#[test]
fn equal_version_live_editions_converge() {
    let tables = Tables::default();

    let mut ascending = register();
    assert!(ascending.apply(event(1, 1, live(10))));
    assert!(ascending.apply(event(1, 1, live(11))));
    assert_eq!(
        ascending.classify(entity(1), Classification::Node),
        Ok(Disposition::Resolving)
    );

    let mut descending = register();
    assert!(descending.apply(event(1, 1, live(11))));
    assert!(!descending.apply(event(1, 1, live(10))));
    assert_eq!(
        descending.classify(entity(1), Classification::Node),
        Ok(Disposition::Resolving)
    );

    assert_eq!(
        snapshot(&ascending, &tables).staged(entity(1)),
        Some(edition(11))
    );
    assert_eq!(
        snapshot(&ascending, &tables),
        snapshot(&descending, &tables)
    );
}

#[test]
fn withdrawn_fitted_subtract() {
    let tables = Tables {
        nodes: vec![(entity(1), NodeRowId::new(4))],
        edges: vec![(entity(2), EdgeRowId::new(7))],
        ..Tables::default()
    };
    let mut register = register();

    assert!(register.apply(event(1, 1, Standing::Withdrawn)));
    assert!(register.apply(event(2, 1, Standing::Withdrawn)));

    let snapshot = snapshot(&register, &tables);
    assert!(snapshot.withdraws(entity(1)));
    assert!(snapshot.withdraws(entity(2)));
    assert!(snapshot.withdraws_node(NodeRowId::new(4)));
    assert!(snapshot.withdraws_edge(EdgeRowId::new(7)));
}

#[test]
fn withdrawn_unfitted_identity_only() {
    let tables = Tables {
        nodes: vec![(entity(1), NodeRowId::new(4))],
        ..Tables::default()
    };
    let mut register = register();

    assert!(register.apply(event(9, 1, Standing::Withdrawn)));

    let snapshot = snapshot(&register, &tables);
    assert!(snapshot.withdraws(entity(9)));
    assert!(!snapshot.withdraws_node(NodeRowId::new(4)));
    assert_eq!(snapshot.staged(entity(9)), None);
}

#[test]
fn live_fitted_identity_resolves_to_nothing() {
    let tables = Tables {
        nodes: vec![(entity(1), NodeRowId::new(4))],
        ..Tables::default()
    };
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));

    let snapshot = snapshot(&register, &tables);
    assert!(!snapshot.withdraws(entity(1)));
    assert!(!snapshot.withdraws_node(NodeRowId::new(4)));
    assert_eq!(snapshot.staged(entity(1)), None);
}

#[test]
fn arrival_stages_on_node_verdict() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert!(register.apply(event(1, 2, live(11))));
    assert!(register.apply(event(2, 1, Standing::Withdrawn)));

    // Unclassified, the arrival publishes nowhere while everything else proceeds.
    let unclassified = snapshot(&register, &tables);
    assert_eq!(unclassified.staged(entity(1)), None);
    assert_eq!(unclassified.edge(entity(1)), None);
    assert!(unclassified.withdraws(entity(2)));

    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Ok(Disposition::Resolving)
    );

    assert_eq!(
        snapshot(&register, &tables).staged(entity(1)),
        Some(edition(11))
    );
}

#[test]
fn unclassified_live_unfitted_only() {
    let tables = Tables {
        nodes: vec![(entity(3), NodeRowId::new(4))],
        ..Tables::default()
    };
    let mut register = register();

    // A live arrival, a withdrawn identity, a live fitted identity, a classified arrival.
    assert!(register.apply(event(1, 1, live(10))));
    assert!(register.apply(event(2, 1, Standing::Withdrawn)));
    assert!(register.apply(event(3, 1, live(30))));
    assert!(register.apply(event(4, 1, live(40))));
    assert_eq!(
        register.classify(entity(4), Classification::Node),
        Ok(Disposition::Resolving)
    );

    assert_eq!(
        register.unclassified(&tables).collect::<Vec<_>>(),
        [entity(1)]
    );
}

#[test]
fn classification_final() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Ok(Disposition::Resolving)
    );

    // A later conflicting verdict changes nothing: the first verdict holds.
    assert_eq!(
        register.classify(entity(1), link_between(8, 9)),
        Ok(Disposition::AlreadyHeld)
    );

    let snapshot = snapshot(&register, &tables);
    assert_eq!(snapshot.staged(entity(1)), Some(edition(10)));
    assert_eq!(snapshot.edge(entity(1)), None);
}

#[test]
fn resolving_changes_resolution() {
    assert!(Disposition::Resolving.changes_resolution());
    assert!(!Disposition::Dormant.changes_resolution());
    assert!(!Disposition::AlreadyHeld.changes_resolution());
}

#[test]
fn dispositions_join_by_resolution_strength() {
    let all = [
        Disposition::Resolving,
        Disposition::Dormant,
        Disposition::AlreadyHeld,
    ];

    // The nine-case table by exhaustion: AlreadyHeld is the neutral element and Resolving
    // absorbs, in either operand order.
    for disposition in all {
        assert_eq!(disposition | Disposition::AlreadyHeld, disposition);
        assert_eq!(Disposition::AlreadyHeld | disposition, disposition);
        assert_eq!(disposition | Disposition::Resolving, Disposition::Resolving);
        assert_eq!(Disposition::Resolving | disposition, Disposition::Resolving);
    }
    assert_eq!(
        Disposition::Dormant | Disposition::Dormant,
        Disposition::Dormant
    );

    let mut folded = Disposition::AlreadyHeld;
    folded |= Disposition::Dormant;
    assert_eq!(folded, Disposition::Dormant);
    folded |= Disposition::Resolving;
    assert_eq!(folded, Disposition::Resolving);
}

#[test]
fn publish_withholds_uncaptured() {
    // The link attaches two fitted rows, so publication resolves them row-typed and the
    // capture alone decides whether the link publishes.
    let tables = Tables {
        nodes: vec![
            (entity(8), NodeRowId::new(2)),
            (entity(9), NodeRowId::new(3)),
        ],
        ..Tables::default()
    };
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert_eq!(
        register.classify(entity(1), link_between(8, 9)),
        Ok(Disposition::Resolving)
    );

    // Classified but uncaptured: publication withholds the link, and the pending listing
    // carries the link's edition.
    let withheld = snapshot(&register, &tables);
    assert_eq!(withheld.edge(entity(1)), None);
    assert_eq!(withheld.legend_of(entity(1)), None);
    let pending: Vec<_> = register.pending_captures(&tables).collect();
    assert_eq!(pending, [(entity(1), edition(10))]);

    capture(&mut register, 1, 10, "wrote", &tables);
    assert_eq!(register.pending_captures(&tables).count(), 0);

    let snapshot = snapshot(&register, &tables);
    assert_eq!(
        snapshot.edge(entity(1)),
        Some(DeltaEdge {
            id: EdgeRowId::new(EDGE_BASE),
            edition: edition(10),
            source: NodeRowId::new(2),
            target: NodeRowId::new(3),
        })
    );
    assert_eq!(snapshot.legend_of(entity(1)), Some(&*legend("wrote")));
    assert_eq!(snapshot.staged(entity(1)), None);
    assert!(!snapshot.withdraws(entity(1)));
}

#[test]
fn revised_fitted_display() {
    let tables = Tables {
        nodes: vec![(entity(2), NodeRowId::new(5))],
        edges: vec![(entity(3), EdgeRowId::new(7))],
        ..Tables::default()
    };
    let mut register = register();

    // A post-fit edition on either fitted domain lists for a capture.
    assert!(register.apply(event(2, 1, live(20))));
    assert!(register.apply(event(3, 1, live(30))));
    assert_eq!(register.pending_captures(&tables).count(), 2);

    // An uncaptured revision publishes no legend, so holders answer from the baked
    // fit-time payload.
    let uncaptured = snapshot(&register, &tables);
    assert_eq!(uncaptured.legend_of(entity(2)), None);
    assert_eq!(uncaptured.legend_of(entity(3)), None);

    capture(&mut register, 2, 20, "revised", &tables);
    let captured = snapshot(&register, &tables);
    assert_eq!(captured.legend_of(entity(2)), Some(&*legend("revised")));
    assert_eq!(captured.legend_of(entity(3)), None);

    // An edition move re-lists the identity while the held capture keeps serving.
    assert!(register.apply(event(2, 2, live(21))));
    assert!(
        register
            .pending_captures(&tables)
            .any(|(id, owed)| id == entity(2) && owed == edition(21))
    );
    let stale = snapshot(&register, &tables);
    assert_eq!(stale.legend_of(entity(2)), Some(&*legend("revised")));
}

/// Allocation records the first capture's icon, and a later read replaces nothing.
///
/// Hand-derivation: `type_uuid()` is unknown to the tables, so the first capture allocates
/// ontology row `ONTOLOGY_BASE` and records its icon beside the row. The second capture names
/// the same type with a different icon and must change nothing, exactly as a later edition
/// moves no placement coordinate: the refit repairs icon staleness.
#[test]
fn allocation_records_first_icon() {
    let tables = Tables::default();
    let mut register = register();

    register
        .capture_display(
            entity(1),
            edition(10),
            Label::new("first"),
            Icon::new("the first icon"),
            type_uuid(),
            &tables,
        )
        .expect("the fixture ontology domain has room");
    register
        .capture_display(
            entity(2),
            edition(20),
            Label::new("second"),
            Icon::new("a later icon"),
            type_uuid(),
            &tables,
        )
        .expect("the fixture ontology domain has room");

    let published = snapshot(&register, &tables);
    assert_eq!(
        published.allocated_icon_of(OntologyRowId::new(ONTOLOGY_BASE)),
        Some(Icon::new("the first icon"))
    );
    // A row below the baked bound answers from the generation's artifacts, never here.
    assert_eq!(published.allocated_icon_of(OntologyRowId::new(0)), None);
}

/// A capture for a tabulated type stores no extension icon, whose resolution stays the baked
/// closure artifact's.
#[test]
fn tabulated_capture_stores_no_extension_icon() {
    let known = ArchivedOntologyTypeUuid::from(Uuid::from_u128(0xE1));
    let tables = Tables {
        ontology: vec![(known, OntologyRowId::new(3))],
        ..Tables::default()
    };
    let mut register = register();

    register
        .capture_display(
            entity(1),
            edition(10),
            Label::new("known"),
            Icon::new("a fetched icon"),
            known,
            &tables,
        )
        .expect("the tabulated type allocates nothing");

    let published = snapshot(&register, &tables);
    assert_eq!(published.allocated_icon_of(OntologyRowId::new(3)), None);
}

#[test]
fn pending_captures_serving_only() {
    let tables = Tables {
        nodes: vec![(entity(4), NodeRowId::new(6))],
        ..Tables::default()
    };
    let mut register = register();

    // A node-classified arrival never lists, because staging captures its display.
    assert!(register.apply(event(1, 1, live(10))));
    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Ok(Disposition::Resolving)
    );

    // An incomplete link never lists, because it never serves.
    assert!(register.apply(event(2, 1, live(11))));
    assert_eq!(
        register.classify(
            entity(2),
            Classification::Edge {
                source: Some(entity(8)),
                target: None,
            }
        ),
        Ok(Disposition::Resolving)
    );

    // An unclassified arrival never lists, because no verdict says its display serves.
    assert!(register.apply(event(3, 1, live(12))));

    // A withdrawn fitted identity never lists, because it serves nothing.
    assert!(register.apply(event(4, 1, Standing::Withdrawn)));

    assert_eq!(register.pending_captures(&tables).count(), 0);
}

#[test]
fn incomplete_link_publishes_nowhere() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    // The verdict is new and the identity lives, so publication's input changed even though
    // the incomplete pair resolves to nothing served.
    assert_eq!(
        register.classify(
            entity(1),
            Classification::Edge {
                source: Some(entity(8)),
                target: None,
            }
        ),
        Ok(Disposition::Resolving)
    );

    let snapshot = snapshot(&register, &tables);
    assert_eq!(snapshot.staged(entity(1)), None);
    assert_eq!(snapshot.edge(entity(1)), None);
    assert!(!snapshot.withdraws(entity(1)));
    // The verdict holds, so the identity never re-lists for classification.
    assert_eq!(register.unclassified(&tables).collect::<Vec<_>>(), []);
}

#[test]
fn classify_withdrawn_no_input_change() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, Standing::Withdrawn)));
    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Ok(Disposition::Dormant)
    );

    let snapshot = snapshot(&register, &tables);
    assert!(snapshot.withdraws(entity(1)));
    assert_eq!(snapshot.staged(entity(1)), None);
}

#[test]
fn withdraw_unarchive_keeps_verdict() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Ok(Disposition::Resolving)
    );
    assert!(register.apply(event(1, 2, Standing::Withdrawn)));

    let withdrawn = snapshot(&register, &tables);
    assert!(withdrawn.withdraws(entity(1)));
    assert_eq!(withdrawn.staged(entity(1)), None);

    // The unarchive re-stages through the held verdict, with no second lookup owed.
    assert!(register.apply(event(1, 3, live(11))));
    assert_eq!(register.unclassified(&tables).collect::<Vec<_>>(), []);
    assert_eq!(
        snapshot(&register, &tables).staged(entity(1)),
        Some(edition(11))
    );
}

#[test]
fn replay_order_invariance() {
    let tables = Tables {
        nodes: vec![(entity(1), NodeRowId::new(4))],
        edges: vec![(entity(3), EdgeRowId::new(7))],
        ..Tables::default()
    };
    let events = [
        event(1, 1, live(10)),
        event(1, 2, Standing::Withdrawn),
        event(2, 1, live(20)),
        event(2, 1, Standing::Withdrawn),
        event(3, 2, Standing::Withdrawn),
        event(3, 3, live(30)),
        event(4, 1, live(40)),
        event(4, 1, live(41)),
    ];

    let mut forward = register();
    for event in events {
        forward.apply(event);
    }

    let mut reversed = register();
    for event in events.into_iter().rev() {
        reversed.apply(event);
    }

    assert_eq!(snapshot(&forward, &tables), snapshot(&reversed, &tables));
}

#[test]
fn feed_events_resolve_standing_and_version() {
    let id = store_id(1);

    assert_eq!(
        DeltaEvent::from(&updated(1, 1, 10, false)),
        event(1, 1, live(10))
    );
    assert_eq!(
        DeltaEvent::from(&updated(1, 2, 10, true)),
        event(1, 2, Standing::Withdrawn)
    );

    let ended = EntityEvent::Ended(EntityEnd {
        entity: id,
        ended_at: at(3),
    });
    assert_eq!(DeltaEvent::from(&ended), event(1, 3, Standing::Withdrawn));

    let deleted = EntityEvent::Deleted(EntityDeletion {
        entity: id,
        provenance: EntityDeletionProvenance {
            deleted_by_id: type_system::principal::actor::ActorEntityUuid::new(Uuid::from_u128(
                0xCD,
            )),
            deleted_at_transaction_time: at(4),
            deleted_at_decision_time: Timestamp::from_unix_timestamp(4),
        },
    });
    assert_eq!(DeltaEvent::from(&deleted), event(1, 4, Standing::Withdrawn));
}

#[test]
fn poll_outcome_advances_past_ignored() {
    let mut register = register();
    let mut outcome = PollOutcome::default();

    outcome.fold(&mut register, &updated(1, 5, 10, false));
    assert!(outcome.changed());

    // The register ignores an older event for the same identity, and the poll still counts it
    // while the watermark keeps the newest time read.
    outcome.fold(&mut register, &updated(1, 3, 11, false));
    assert_eq!(outcome.events(), 2);
    assert_eq!(outcome.watermark(), Some(at(5)));
}

#[test]
fn poll_outcome_redelivery_no_change() {
    let mut register = register();

    let mut first = PollOutcome::default();
    first.fold(&mut register, &updated(1, 5, 10, false));
    assert!(first.changed());

    let mut redelivery = PollOutcome::default();
    redelivery.fold(&mut register, &updated(1, 5, 10, false));
    assert!(!redelivery.changed());
    assert_eq!(redelivery.events(), 1);
    assert_eq!(redelivery.watermark(), Some(at(5)));
}

#[test]
fn cell_swaps_publications_whole() {
    let cell = DeltaCell::default();
    assert!(cell.load().is_none());

    let register = register();
    cell.publish(register.snapshot(&Tables::default(), DeltaRevision::FIRST, at(1)));
    let first = cell.load();
    assert_eq!(
        first.as_ref().map(|snapshot| snapshot.revision()),
        Some(DeltaRevision::FIRST)
    );

    cell.publish(register.snapshot(&Tables::default(), DeltaRevision::FIRST.next(), at(2)));
    assert_eq!(
        cell.load().as_ref().map(|snapshot| snapshot.revision()),
        Some(DeltaRevision::FIRST.next())
    );
    // The guard loaded before the swap keeps reading its own publication.
    assert_eq!(
        first.as_ref().map(|snapshot| snapshot.watermark()),
        Some(at(1))
    );
}

/// The staged map one publication would carry, from `(identity, edition)` pairs.
fn staged_map(pairs: &[(u128, u128)]) -> FastHashMap<ArchivedEntityId, EntityEditionId> {
    pairs
        .iter()
        .map(|&(entity_n, edition_n)| (entity(entity_n), edition(edition_n)))
        .collect()
}

#[test]
fn sync_stages_fresh_pending() {
    let mut pipeline = StagingPipeline::new(2);

    pipeline.sync(&staged_map(&[(1, 10)]));

    assert_eq!(pipeline.pending(), vec![entity(1)]);
    assert_eq!(pipeline.ready().count(), 0);
}

#[test]
fn budget_read_obliges_ensure() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));

    // The first miss waits, and the second - the budget-spending final read - obliges the
    // ensure in its own cycle.
    assert_eq!(pipeline.miss(entity(1)), MissAction::Wait);
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
}

#[test]
fn unconfirmed_ensure_reobliged() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[(1, 10)]));

    // The ensure start failed, so `ensured` never confirmed it and each miss retries it.
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
}

#[test]
fn post_ensure_exhaustion() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Wait);
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
    pipeline.ensured(entity(1));

    // The post-ensure side reads under the same budget: one waiting miss, then the parking one.
    assert_eq!(pipeline.miss(entity(1)), MissAction::Wait);
    assert_eq!(pipeline.miss(entity(1)), MissAction::Park);

    // An exhausted arrival stops reading, and the mirror keeps it parked while it stays staged.
    assert!(pipeline.pending().is_empty());
    pipeline.sync(&staged_map(&[(1, 10)]));
    assert!(pipeline.pending().is_empty());
}

#[test]
fn exhaustion_survives_edition_move() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[(1, 10)]));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
    pipeline.ensured(entity(1));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Park);

    // A parked arrival stays parked until reconciliation or refit: a later edition moves the
    // recorded edition and nothing else.
    pipeline.sync(&staged_map(&[(1, 11)]));
    assert!(pipeline.pending().is_empty());
}

#[test]
fn withdrawal_drops_unarchive_restages() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Wait);

    // The withdrawal removes the identity from the staged set, and its state drops with it.
    pipeline.sync(&staged_map(&[]));
    assert!(pipeline.pending().is_empty());

    // The unarchive restages it with the full budget. A held budget of 1 would oblige the
    // ensure here, and a fresh budget of 2 waits.
    pipeline.sync(&staged_map(&[(1, 10)]));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Wait);
}

#[test]
fn sync_moves_edition_in_place() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[(1, 10)]));

    // The ensure names the newest feed edition, not the one the arrival staged under.
    pipeline.sync(&staged_map(&[(1, 11)]));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(11)));
}

#[test]
fn hit_completes_either_phase() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10), (2, 20)]));

    // Identity 2 is post-ensure when its row returns, and identity 1 is still pre-ensure.
    assert_eq!(pipeline.miss(entity(2)), MissAction::Wait);
    assert_eq!(pipeline.miss(entity(2)), MissAction::Ensure(edition(20)));
    pipeline.ensured(entity(2));

    pipeline.complete(entity(1), BoxedVecN::zero());
    pipeline.complete(entity(2), BoxedVecN::zero());

    assert!(pipeline.pending().is_empty());
    let mut uncaptured = pipeline.uncaptured();
    uncaptured.sort_unstable_by_key(|&(identity, _)| identity);
    assert_eq!(
        uncaptured,
        vec![(entity(1), edition(10)), (entity(2), edition(20))]
    );

    pipeline.captured(entity(1), display("one"));
    pipeline.captured(entity(2), display("two"));
    let mut ready: Vec<_> = pipeline
        .ready()
        .map(|(identity, recorded, _, _)| (identity, recorded))
        .collect();
    ready.sort_unstable_by_key(|&(identity, _)| identity);
    assert_eq!(
        ready,
        vec![(entity(1), edition(10)), (entity(2), edition(20))]
    );

    // A completed arrival survives the mirror without re-entering pending.
    pipeline.sync(&staged_map(&[(1, 10), (2, 20)]));
    assert!(pipeline.pending().is_empty());
    assert_eq!(pipeline.ready().count(), 2);
}

#[test]
fn placement_waits_for_capture() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));
    pipeline.complete(entity(1), BoxedVecN::zero());

    // The embedding is ready and the display is not, so nothing places yet.
    assert_eq!(pipeline.ready().count(), 0);
    assert_eq!(pipeline.uncaptured(), vec![(entity(1), edition(10))]);

    pipeline.captured(entity(1), display("labeled arrival"));
    assert!(pipeline.uncaptured().is_empty());
    let ready: Vec<_> = pipeline
        .ready()
        .map(|(identity, recorded, _, payload)| (identity, recorded, payload.clone()))
        .collect();
    assert_eq!(
        ready,
        vec![(entity(1), edition(10), display("labeled arrival"))]
    );

    // A second capture for the same identity changes nothing: the first one stands.
    pipeline.captured(entity(1), display("a later read"));
    let ready: Vec<_> = pipeline
        .ready()
        .map(|(_, _, _, payload)| payload.clone())
        .collect();
    assert_eq!(ready, vec![display("labeled arrival")]);
}

#[test]
fn departed_capture_dropped() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[]));

    // The display read raced a withdrawal, so the identity left the staged set first.
    pipeline.captured(entity(1), display("gone"));

    assert_eq!(pipeline.ready().count(), 0);
    assert!(pipeline.uncaptured().is_empty());
}

#[test]
fn departed_completion_dropped() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[]));

    // The row raced a withdrawal, so the identity left the staged set before its read answered.
    pipeline.complete(entity(1), BoxedVecN::zero());

    assert_eq!(pipeline.ready().count(), 0);
    assert!(pipeline.pending().is_empty());
}

/// A projected arrival at a distinct fixture coordinate.
fn projected(edition_n: u128, x: f32, y: f32) -> ProjectedArrival {
    let DisplayParts {
        label,
        icon,
        representative,
    } = display("arrival");
    ProjectedArrival {
        edition: edition(edition_n),
        position: Vec2::new(x, y),
        label,
        icon,
        representative,
    }
}

#[test]
fn captured_label_priced() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register
        .classify(entity(1), Classification::Node)
        .expect("a node verdict allocates no edge row");
    let bare = register.resident_estimate();

    let label = "a label the estimate carries";
    let arrival = ProjectedArrival {
        edition: edition(10),
        position: Vec2::new(0.25, -0.5),
        label: OwnedLabel::from(label),
        icon: OwnedIcon::from("an icon"),
        representative: type_uuid(),
    };
    assert_eq!(place(&mut register, 1, &arrival), Disposition::Resolving);

    // The estimate grows by at least the label's text, whatever the map allocation adds.
    assert!(register.resident_estimate() >= bare + label.len());
}

#[test]
fn placed_arrival_leaves_staged() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register
        .classify(entity(1), Classification::Node)
        .expect("a node verdict allocates no edge row");
    assert_eq!(
        place(&mut register, 1, &projected(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(snapshot.staged(entity(1)), None);
    assert_eq!(
        snapshot.node(entity(1)),
        Some(&DeltaNode {
            edition: edition(10),
            position: Vec2::new(0.25, -0.5),
            id: slot(BASE),
            legend: legend("arrival"),
        })
    );
}

#[test]
fn first_placement_stands() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register
        .classify(entity(1), Classification::Node)
        .expect("a node verdict allocates no edge row");
    assert_eq!(
        place(&mut register, 1, &projected(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    // A re-delivered placement changes nothing, coordinate and slot included.
    assert_eq!(
        place(&mut register, 1, &projected(11, 0.75, 0.75)),
        Disposition::AlreadyHeld
    );

    // A later edition moves the published edition and never the coordinate.
    register.apply(event(1, 2, live(11)));
    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(
        snapshot.node(entity(1)),
        Some(&DeltaNode {
            edition: edition(11),
            position: Vec2::new(0.25, -0.5),
            id: slot(BASE),
            legend: legend("arrival"),
        })
    );
}

#[test]
fn post_withdrawal_placement_unserved() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register
        .classify(entity(1), Classification::Node)
        .expect("a node verdict allocates no edge row");
    register.apply(event(1, 2, Standing::Withdrawn));

    // The completion raced the withdrawal. The register still records the placement while the
    // standing keeps the row unserved, so it moves no publication input.
    assert_eq!(
        place(&mut register, 1, &projected(10, 0.25, -0.5)),
        Disposition::Dormant
    );

    let withdrawn = snapshot(&register, &Tables::default());
    assert!(withdrawn.withdraws(entity(1)));
    assert_eq!(withdrawn.staged(entity(1)), None);
    assert_eq!(withdrawn.node(entity(1)), None);

    // The unarchive republishes the recorded coordinate on its former slot without re-entering
    // the staged set.
    register.apply(event(1, 3, live(11)));
    let restored = snapshot(&register, &Tables::default());
    assert_eq!(restored.staged(entity(1)), None);
    assert_eq!(
        restored.node(entity(1)),
        Some(&DeltaNode {
            edition: edition(11),
            position: Vec2::new(0.25, -0.5),
            id: slot(BASE),
            legend: legend("arrival"),
        })
    );
}

#[test]
fn unclassified_placement_unpublished() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));

    // An arrival without a verdict serves nothing, so the placement waits for the
    // classification it cannot precede in any live pipeline, and publication stays fail-closed
    // if one ever does.
    assert_eq!(
        place(&mut register, 1, &projected(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(snapshot.staged(entity(1)), None);
    assert_eq!(snapshot.node(entity(1)), None);
}

/// Places through the fixture universe, panicking where the fixture cannot exhaust it.
fn place(register: &mut DeltaRegister, entity_n: u128, arrival: &ProjectedArrival) -> Disposition {
    register
        .place(entity(entity_n), arrival, &Tables::default())
        .expect("the fixture universe has room")
}

#[test]
fn slots_assign_monotonically_in_placement_order() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register.apply(event(2, 1, live(20)));
    register
        .classify(entity(1), Classification::Node)
        .expect("a node verdict allocates no edge row");
    register
        .classify(entity(2), Classification::Node)
        .expect("a node verdict allocates no edge row");

    // Placement order assigns the slots, and the base bound is the first one taken.
    assert_eq!(
        place(&mut register, 2, &projected(20, 0.5, 0.5)),
        Disposition::Resolving
    );
    assert_eq!(
        place(&mut register, 1, &projected(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(
        snapshot.node(entity(2)).map(|arrival| arrival.id),
        Some(slot(BASE))
    );
    assert_eq!(
        snapshot.node(entity(1)).map(|arrival| arrival.id),
        Some(slot(BASE + 1))
    );
    assert_eq!(snapshot.universe(), Universe::new(slot(BASE + 2)));
}

#[test]
fn withdrawn_slot_never_reused() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register
        .classify(entity(1), Classification::Node)
        .expect("a node verdict allocates no edge row");
    assert_eq!(
        place(&mut register, 1, &projected(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    // The withdrawal leaves the slot allocated, so the next placement takes the one after it
    // and the universe still counts both.
    register.apply(event(1, 2, Standing::Withdrawn));
    register.apply(event(2, 1, live(20)));
    register
        .classify(entity(2), Classification::Node)
        .expect("a node verdict allocates no edge row");
    assert_eq!(
        place(&mut register, 2, &projected(20, 0.5, 0.5)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(
        snapshot.node(entity(2)).map(|arrival| arrival.id),
        Some(slot(BASE + 1))
    );
    assert_eq!(snapshot.universe(), Universe::new(slot(BASE + 2)));
}

#[test]
fn universe_base_bound_first() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));

    assert_eq!(
        snapshot(&register, &Tables::default()).universe(),
        Universe::new(slot(BASE))
    );
}

#[test]
fn exhausted_universe_refuses_placement() {
    let bound = NodeRowId::new(u64::from(u32::MAX) + 1);
    let mut register = DeltaRegister::new(
        Universe::new(bound),
        Universe::new(EdgeRowId::new(EDGE_BASE)),
        Universe::new(OntologyRowId::new(ONTOLOGY_BASE)),
    );
    register.apply(event(1, 1, live(10)));
    register
        .classify(entity(1), Classification::Node)
        .expect("a node verdict allocates no edge row");

    // One more node row would take a value the wire codec cannot encode, so the refusal
    // repeats and the bound never moves.
    assert_eq!(
        register.place(entity(1), &projected(10, 0.25, -0.5), &Tables::default()),
        Err(UniverseExhausted)
    );
    assert_eq!(
        register.place(entity(1), &projected(10, 0.25, -0.5), &Tables::default()),
        Err(UniverseExhausted)
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(snapshot.staged(entity(1)), Some(edition(10)));
    assert_eq!(snapshot.node(entity(1)), None);
    assert_eq!(snapshot.universe(), Universe::new(bound));
}

#[test]
fn handed_off_entry_rests_until_retired() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));
    pipeline.complete(entity(1), BoxedVecN::zero());
    pipeline.handed_off(entity(1));

    // After the hand-off nothing reads and nothing re-places.
    assert!(pipeline.pending().is_empty());
    assert_eq!(pipeline.ready().count(), 0);

    // The mirror keeps it resting while the publication still stages the identity.
    pipeline.sync(&staged_map(&[(1, 10)]));
    assert!(pipeline.pending().is_empty());
    assert_eq!(pipeline.ready().count(), 0);

    // The publication that placed it retires the entry, and a later unarchive restages fresh.
    pipeline.sync(&staged_map(&[]));
    pipeline.sync(&staged_map(&[(1, 10)]));
    assert_eq!(pipeline.pending(), vec![entity(1)]);
}

#[test]
fn out_of_frame_entry_stays_parked() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));
    pipeline.complete(entity(1), BoxedVecN::zero());
    pipeline.out_of_frame(entity(1));

    // An out-of-frame arrival neither reads nor re-projects, because only a refit moves the
    // fitted frame.
    assert!(pipeline.pending().is_empty());
    assert_eq!(pipeline.ready().count(), 0);
    assert_eq!(pipeline.miss(entity(1)), MissAction::Wait);

    pipeline.sync(&staged_map(&[(1, 10)]));
    assert!(pipeline.pending().is_empty());
    assert_eq!(pipeline.ready().count(), 0);
}
