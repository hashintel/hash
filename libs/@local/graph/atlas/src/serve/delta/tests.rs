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
    DeltaCell, DeltaEvent, DeltaLink, DeltaRegister, DeltaRevision, Disposition, FrozenPlacement,
    IdentityTables, PlacedArrival, Standing, UniverseExhausted,
    consumer::PollOutcome,
    staging::{MissAction, StagingPipeline},
};
use crate::{
    dataset::{
        auxiliary::OwnedLabel,
        postgres::{
            Classification, EditionDisplay,
            id::{ArchivedEntityId, ArchivedEntityUuid},
        },
    },
    identity::{EdgeRowId, NodeRowId},
    math::{BoxedVecN, Vec2},
    serve::codec::Universe,
};

/// The fixture generation's base row bound, past every fitted row the tables name.
const BASE: u32 = 100;

/// An empty register whose slot allocation starts at the fixture's base bound.
fn register() -> DeltaRegister {
    DeltaRegister::new(Universe::new(BASE))
}

/// The row id `n` names in the fixture's slot domain.
fn slot(n: u32) -> NodeRowId {
    NodeRowId::new(u64::from(n))
}

/// Identity tables over a handful of fitted rows, standing in for a generation.
#[derive(Debug, Default)]
struct Tables {
    nodes: Vec<(ArchivedEntityId, NodeRowId)>,
    edges: Vec<(ArchivedEntityId, EdgeRowId)>,
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

/// A captured display payload carrying `text` and no first type.
fn display(text: &str) -> EditionDisplay {
    EditionDisplay {
        label: OwnedLabel::from(text),
        first_type: None,
    }
}

fn link_between(source: u128, target: u128) -> Classification {
    Classification::Link {
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
fn unarchive_replaces_tombstone_through_the_ordinary_fold() {
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
fn same_version_redelivery_is_idempotent() {
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert!(!register.apply(event(1, 1, live(10))));
    assert!(register.apply(event(2, 1, Standing::Withdrawn)));
    assert!(!register.apply(event(2, 1, Standing::Withdrawn)));
}

#[test]
fn equal_version_conflict_resolves_toward_withdrawn_under_both_orders() {
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
        Disposition::Resolving
    );

    let mut descending = register();
    assert!(descending.apply(event(1, 1, live(11))));
    assert!(!descending.apply(event(1, 1, live(10))));
    assert_eq!(
        descending.classify(entity(1), Classification::Node),
        Disposition::Resolving
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
fn withdrawn_fitted_rows_subtract_and_enter_the_identity_set() {
    let tables = Tables {
        nodes: vec![(entity(1), NodeRowId::new(4))],
        edges: vec![(entity(2), EdgeRowId::new(7))],
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
fn withdrawn_unfitted_identity_enters_the_identity_set_alone() {
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
fn arrival_stages_only_after_a_node_verdict() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert!(register.apply(event(1, 2, live(11))));
    assert!(register.apply(event(2, 1, Standing::Withdrawn)));

    // Unclassified, the arrival publishes nowhere while everything else proceeds.
    let unclassified = snapshot(&register, &tables);
    assert_eq!(unclassified.staged(entity(1)), None);
    assert_eq!(unclassified.link(entity(1)), None);
    assert!(unclassified.withdraws(entity(2)));

    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Disposition::Resolving
    );

    assert_eq!(
        snapshot(&register, &tables).staged(entity(1)),
        Some(edition(11))
    );
}

#[test]
fn unclassified_lists_only_live_unfitted_arrivals() {
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
        Disposition::Resolving
    );

    assert_eq!(
        register.unclassified(&tables).collect::<Vec<_>>(),
        [entity(1)]
    );
}

#[test]
fn classification_is_final_for_the_process_lifetime() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Disposition::Resolving
    );

    // A later conflicting verdict changes nothing: the first verdict holds.
    assert_eq!(
        register.classify(entity(1), link_between(8, 9)),
        Disposition::AlreadyHeld
    );

    let snapshot = snapshot(&register, &tables);
    assert_eq!(snapshot.staged(entity(1)), Some(edition(10)));
    assert_eq!(snapshot.link(entity(1)), None);
}

#[test]
fn only_a_resolving_disposition_changes_resolution() {
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
fn link_verdict_publishes_endpoint_identities() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert_eq!(
        register.classify(entity(1), link_between(8, 9)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &tables);
    assert_eq!(
        snapshot.link(entity(1)),
        Some(DeltaLink {
            edition: edition(10),
            source: entity(8),
            target: entity(9),
        })
    );
    assert_eq!(snapshot.staged(entity(1)), None);
    assert!(!snapshot.withdraws(entity(1)));
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
            Classification::Link {
                source: Some(entity(8)),
                target: None,
            }
        ),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &tables);
    assert_eq!(snapshot.staged(entity(1)), None);
    assert_eq!(snapshot.link(entity(1)), None);
    assert!(!snapshot.withdraws(entity(1)));
    // The verdict holds, so the identity never re-lists for classification.
    assert_eq!(register.unclassified(&tables).collect::<Vec<_>>(), []);
}

#[test]
fn classify_on_a_withdrawn_identity_changes_no_publication_input() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, Standing::Withdrawn)));
    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Disposition::Dormant
    );

    let snapshot = snapshot(&register, &tables);
    assert!(snapshot.withdraws(entity(1)));
    assert_eq!(snapshot.staged(entity(1)), None);
}

#[test]
fn withdraw_then_unarchive_keeps_the_held_verdict() {
    let tables = Tables::default();
    let mut register = register();

    assert!(register.apply(event(1, 1, live(10))));
    assert_eq!(
        register.classify(entity(1), Classification::Node),
        Disposition::Resolving
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
fn replay_order_does_not_move_the_snapshot() {
    let tables = Tables {
        nodes: vec![(entity(1), NodeRowId::new(4))],
        edges: vec![(entity(3), EdgeRowId::new(7))],
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
fn poll_outcome_counts_and_advances_past_ignored_events() {
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
fn poll_outcome_reports_no_change_for_redelivery() {
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
fn sync_stages_a_fresh_arrival_pending() {
    let mut pipeline = StagingPipeline::new(2);

    pipeline.sync(&staged_map(&[(1, 10)]));

    assert_eq!(pipeline.pending(), vec![entity(1)]);
    assert_eq!(pipeline.ready().count(), 0);
}

#[test]
fn the_read_that_spends_the_budget_obliges_the_ensure() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));

    // The first miss waits, and the second - the budget-spending final read - obliges the
    // ensure in its own cycle.
    assert_eq!(pipeline.miss(entity(1)), MissAction::Wait);
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
}

#[test]
fn an_unconfirmed_ensure_is_obliged_again_at_every_later_miss() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[(1, 10)]));

    // The ensure start failed, so `ensured` never confirmed it and each miss retries it.
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(10)));
}

#[test]
fn the_post_ensure_budget_ends_in_exhaustion() {
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
fn exhaustion_holds_through_an_edition_move() {
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
fn a_withdrawal_drops_pipeline_state_and_an_unarchive_restages_fresh() {
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
fn sync_moves_the_edition_in_place() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[(1, 10)]));

    // The ensure names the newest feed edition, not the one the arrival staged under.
    pipeline.sync(&staged_map(&[(1, 11)]));
    assert_eq!(pipeline.miss(entity(1)), MissAction::Ensure(edition(11)));
}

#[test]
fn a_hit_completes_the_arrival_at_either_phase() {
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
fn placement_waits_for_the_display_capture() {
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

    // A second capture for the same identity changes nothing: the first one froze.
    pipeline.captured(entity(1), display("a later read"));
    let ready: Vec<_> = pipeline
        .ready()
        .map(|(_, _, _, payload)| payload.clone())
        .collect();
    assert_eq!(ready, vec![display("labeled arrival")]);
}

#[test]
fn a_capture_for_a_departed_identity_is_dropped() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[]));

    // The display read raced a withdrawal, so the identity left the staged set first.
    pipeline.captured(entity(1), display("gone"));

    assert_eq!(pipeline.ready().count(), 0);
    assert!(pipeline.uncaptured().is_empty());
}

#[test]
fn a_completion_for_a_departed_identity_is_dropped() {
    let mut pipeline = StagingPipeline::new(1);
    pipeline.sync(&staged_map(&[]));

    // The row raced a withdrawal, so the identity left the staged set before its read answered.
    pipeline.complete(entity(1), BoxedVecN::zero());

    assert_eq!(pipeline.ready().count(), 0);
    assert!(pipeline.pending().is_empty());
}

/// A frozen placement at a distinct fixture coordinate.
fn frozen(edition_n: u128, x: f32, y: f32) -> FrozenPlacement {
    FrozenPlacement {
        edition: edition(edition_n),
        wire: Vec2::new(x, y),
        display: display("arrival"),
    }
}

#[test]
fn the_captured_label_prices_into_the_resident_estimate() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register.classify(entity(1), Classification::Node);
    let bare = register.resident_estimate();

    let label = "a label the estimate carries";
    let placement = FrozenPlacement {
        edition: edition(10),
        wire: Vec2::new(0.25, -0.5),
        display: display(label),
    };
    assert_eq!(place(&mut register, 1, placement), Disposition::Resolving);

    // The estimate grows by at least the label's text, whatever the map allocation adds.
    assert!(register.resident_estimate() >= bare + label.len());
}

#[test]
fn a_placed_arrival_leaves_the_staged_projection() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register.classify(entity(1), Classification::Node);
    assert_eq!(
        place(&mut register, 1, frozen(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(snapshot.staged(entity(1)), None);
    assert_eq!(
        snapshot.placed(entity(1)),
        Some(PlacedArrival {
            edition: edition(10),
            wire: Vec2::new(0.25, -0.5),
            slot: slot(BASE),
            display: display("arrival"),
        })
    );
}

#[test]
fn the_first_placement_freezes_while_the_edition_tracks_the_feed() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register.classify(entity(1), Classification::Node);
    assert_eq!(
        place(&mut register, 1, frozen(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    // A re-delivered placement changes nothing, coordinate and slot included.
    assert_eq!(
        place(&mut register, 1, frozen(11, 0.75, 0.75)),
        Disposition::AlreadyHeld
    );

    // A later edition moves the published edition and never the coordinate.
    register.apply(event(1, 2, live(11)));
    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(
        snapshot.placed(entity(1)),
        Some(PlacedArrival {
            edition: edition(11),
            wire: Vec2::new(0.25, -0.5),
            slot: slot(BASE),
            display: display("arrival"),
        })
    );
}

#[test]
fn a_placement_after_a_withdrawal_records_without_serving() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register.classify(entity(1), Classification::Node);
    register.apply(event(1, 2, Standing::Withdrawn));

    // The completion raced the withdrawal. The coordinate still freezes while the standing
    // keeps the row unserved, so the placement moves no publication input.
    assert_eq!(
        place(&mut register, 1, frozen(10, 0.25, -0.5)),
        Disposition::Dormant
    );

    let withdrawn = snapshot(&register, &Tables::default());
    assert!(withdrawn.withdraws(entity(1)));
    assert_eq!(withdrawn.staged(entity(1)), None);
    assert_eq!(withdrawn.placed(entity(1)), None);

    // The unarchive republishes the frozen coordinate on its former slot without re-entering
    // the staged set.
    register.apply(event(1, 3, live(11)));
    let restored = snapshot(&register, &Tables::default());
    assert_eq!(restored.staged(entity(1)), None);
    assert_eq!(
        restored.placed(entity(1)),
        Some(PlacedArrival {
            edition: edition(11),
            wire: Vec2::new(0.25, -0.5),
            slot: slot(BASE),
            display: display("arrival"),
        })
    );
}

#[test]
fn an_unclassified_placement_publishes_nowhere() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));

    // An arrival without a verdict serves nothing, so the placement waits for the
    // classification it cannot precede in any live pipeline, and publication stays fail-closed
    // if one ever does.
    assert_eq!(
        place(&mut register, 1, frozen(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(snapshot.staged(entity(1)), None);
    assert_eq!(snapshot.placed(entity(1)), None);
}

/// Places through the fixture universe, panicking where the fixture cannot exhaust it.
fn place(register: &mut DeltaRegister, entity_n: u128, placement: FrozenPlacement) -> Disposition {
    register
        .place(entity(entity_n), placement)
        .expect("the fixture universe has room")
}

#[test]
fn slots_assign_monotonically_in_placement_order() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register.apply(event(2, 1, live(20)));
    register.classify(entity(1), Classification::Node);
    register.classify(entity(2), Classification::Node);

    // Placement order assigns the slots, and the base bound is the first one taken.
    assert_eq!(
        place(&mut register, 2, frozen(20, 0.5, 0.5)),
        Disposition::Resolving
    );
    assert_eq!(
        place(&mut register, 1, frozen(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(
        snapshot.placed(entity(2)).map(|arrival| arrival.slot),
        Some(slot(BASE))
    );
    assert_eq!(
        snapshot.placed(entity(1)).map(|arrival| arrival.slot),
        Some(slot(BASE + 1))
    );
    assert_eq!(snapshot.universe(), Universe::new(BASE + 2));
}

#[test]
fn a_withdrawn_slot_is_never_reused() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));
    register.classify(entity(1), Classification::Node);
    assert_eq!(
        place(&mut register, 1, frozen(10, 0.25, -0.5)),
        Disposition::Resolving
    );

    // The withdrawal leaves the slot allocated, so the next placement takes the one after it
    // and the universe still counts both.
    register.apply(event(1, 2, Standing::Withdrawn));
    register.apply(event(2, 1, live(20)));
    register.classify(entity(2), Classification::Node);
    assert_eq!(
        place(&mut register, 2, frozen(20, 0.5, 0.5)),
        Disposition::Resolving
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(
        snapshot.placed(entity(2)).map(|arrival| arrival.slot),
        Some(slot(BASE + 1))
    );
    assert_eq!(snapshot.universe(), Universe::new(BASE + 2));
}

#[test]
fn the_universe_publishes_the_base_bound_before_any_placement() {
    let mut register = register();
    register.apply(event(1, 1, live(10)));

    assert_eq!(
        snapshot(&register, &Tables::default()).universe(),
        Universe::new(BASE)
    );
}

#[test]
fn an_exhausted_universe_refuses_placement_and_the_arrival_stays_staged() {
    let mut register = DeltaRegister::new(Universe::new(u32::MAX));
    register.apply(event(1, 1, live(10)));
    register.classify(entity(1), Classification::Node);

    // The slot past `u32::MAX - 1` would grow the accepted universe beyond the wire's row
    // domain, so the refusal repeats and the bound never moves.
    assert_eq!(
        register.place(entity(1), frozen(10, 0.25, -0.5)),
        Err(UniverseExhausted)
    );
    assert_eq!(
        register.place(entity(1), frozen(10, 0.25, -0.5)),
        Err(UniverseExhausted)
    );

    let snapshot = snapshot(&register, &Tables::default());
    assert_eq!(snapshot.staged(entity(1)), Some(edition(10)));
    assert_eq!(snapshot.placed(entity(1)), None);
    assert_eq!(snapshot.universe(), Universe::new(u32::MAX));
}

#[test]
fn a_placed_pipeline_entry_rests_until_the_staged_set_retires_it() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));
    pipeline.complete(entity(1), BoxedVecN::zero());
    pipeline.placed(entity(1));

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
fn a_held_pipeline_entry_stays_parked_while_it_stays_staged() {
    let mut pipeline = StagingPipeline::new(2);
    pipeline.sync(&staged_map(&[(1, 10)]));
    pipeline.complete(entity(1), BoxedVecN::zero());
    pipeline.held(entity(1));

    // An out-of-frame arrival neither reads nor re-projects, because only a refit moves the
    // frozen frame.
    assert!(pipeline.pending().is_empty());
    assert_eq!(pipeline.ready().count(), 0);
    assert_eq!(pipeline.miss(entity(1)), MissAction::Wait);

    pipeline.sync(&staged_map(&[(1, 10)]));
    assert!(pipeline.pending().is_empty());
    assert_eq!(pipeline.ready().count(), 0);
}
