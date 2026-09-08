use hash_graph_postgres_store::store::{EntityDeletion, EntityEnd, EntityEvent};
use hash_graph_temporal_versioning::Timestamp;
use type_system::{
    knowledge::entity::provenance::EntityDeletionProvenance, principal::actor::ActorEntityUuid,
};
use uuid::Uuid;

use super::{DeltaAction, Pending, Placement, Stage};
use crate::{
    postgres::id::ArchivedEntityId,
    serve2::delta::feed::tests::{entity, update},
};

/// Overlap retains the pending phase and edition until a strictly newer event replaces them.
#[test]
fn observe_overlap() {
    let mut pending = Pending::default();
    let entity = ArchivedEntityId::from(entity(1));
    assert!(matches!(
        pending.observe(update(1, 10, false)),
        DeltaAction::None
    ));
    let first = pending.updates[&entity].id;
    pending
        .updates
        .get_mut(&entity)
        .expect("should retain the update")
        .stage = Stage::Node(Placement::Waiting);
    assert!(matches!(
        pending.observe(update(1, 10, false)),
        DeltaAction::None
    ));
    assert!(matches!(
        pending.observe(update(1, 9, true)),
        DeltaAction::None
    ));
    assert_eq!(pending.updates[&entity].id, first);
    assert!(matches!(
        pending.updates[&entity].stage,
        Stage::Node(Placement::Waiting)
    ));
    assert_eq!(pending.updates.len(), 1);
    assert!(matches!(
        pending.observe(update(1, 11, false)),
        DeltaAction::None
    ));
    assert_ne!(pending.updates[&entity].id, first);
    assert!(matches!(pending.updates[&entity].stage, Stage::Classify));
    assert_eq!(pending.updates.len(), 1);
}

/// A replacement waits for the previous request, whose completion cannot apply to it.
#[test]
fn complete_superseded() {
    let mut pending = Pending::default();
    let entity = ArchivedEntityId::from(entity(1));
    pending.observe(update(1, 1, false));
    let first = pending.updates[&entity].id;
    pending.submitted(entity, first);
    pending.observe(update(1, 2, false));
    let second = pending.updates[&entity].id;
    pending
        .updates
        .get_mut(&entity)
        .expect("should retain the replacement")
        .stage = Stage::Node(Placement::Waiting);
    assert!(pending.next_placement().is_none());
    assert!(
        !pending.complete(entity, second),
        "should ignore an unsubmitted ID"
    );
    assert!(pending.next_placement().is_none());
    assert!(
        !pending.complete(entity, first),
        "should discard the superseded result"
    );
    assert_eq!(
        pending
            .next_placement()
            .expect("should release the waiting replacement")
            .id,
        second
    );
    pending.submitted(entity, second);
    assert!(
        !pending.complete(entity, first),
        "should ignore a repeated old completion"
    );
    assert!(pending.next_placement().is_none());
    assert!(pending.complete(entity, second));
}

/// Every removal cancels its update while retaining the outstanding placement until completion.
#[test]
fn observe_removals() {
    let id = entity(1);
    let entity = ArchivedEntityId::from(id);
    let removals = [
        update(1, 2, true),
        EntityEvent::Ended(EntityEnd {
            entity: id,
            ended_at: Timestamp::from_unix_timestamp(2),
        }),
        EntityEvent::Deleted(EntityDeletion {
            entity: id,
            provenance: EntityDeletionProvenance {
                deleted_by_id: ActorEntityUuid::new(Uuid::from_u128(4)),
                deleted_at_transaction_time: Timestamp::from_unix_timestamp(2),
                deleted_at_decision_time: Timestamp::from_unix_timestamp(2),
            },
        }),
    ];
    for removal in removals {
        let mut pending = Pending::default();
        pending.observe(update(1, 1, false));
        let first = pending.updates[&entity].id;
        pending.submitted(entity, first);
        assert!(
            matches!(pending.observe(removal), DeltaAction::Withdraw(withdrawn) if withdrawn == entity)
        );
        assert!(pending.updates.is_empty());
        pending.observe(update(1, 1, false));
        assert!(pending.updates.is_empty());
        assert!(!pending.complete(entity, first));
        assert!(pending.placements.is_empty());
    }
}

/// Equal entity UUIDs in different webs have independent versions and outstanding requests.
#[test]
fn observe_other_web() {
    let mut pending = Pending::default();
    let first = entity(1);
    let mut second = first;
    second.web_id = type_system::principal::actor_group::WebId::new(Uuid::from_u128(2));
    pending.observe(update(1, 10, false));
    let EntityEvent::Updated(mut other) = update(1, 1, false) else {
        unreachable!()
    };
    other.entity = second;
    pending.observe(EntityEvent::Updated(other));
    assert_eq!(pending.updates.len(), 2);
    let first = ArchivedEntityId::from(first);
    let second = ArchivedEntityId::from(second);
    let request = pending.updates[&first].id;
    pending.submitted(first, request);
    assert!(!pending.complete(second, request));
    assert!(pending.complete(first, request));
    assert_eq!(pending.updates[&second].event, other);
}
