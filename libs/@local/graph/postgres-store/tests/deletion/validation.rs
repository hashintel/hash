use core::assert_matches;
use std::collections::HashSet;

use hash_graph_store::{
    entity::{
        CreateEntityParams, DeleteEntitiesParams, DeletionScope, DeletionSummary, EntityStore as _,
        LinkDeletionBehavior, PatchEntityParams,
    },
    error::DeletionError,
    filter::Filter,
};
use hash_graph_temporal_versioning::{
    DecisionTime, TemporalTagged as _, Timestamp, TransactionTime,
};
use type_system::knowledge::property::{
    Property, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
    PropertyWithMetadata,
};

use crate::{
    DatabaseTestWrapper, alice, bob, count_entity, get_deletion_provenance, person_type_id,
    provenance, raw_count, seed,
};

/// Rejects deletion when `decision_time` exceeds `transaction_time`.
///
/// `execute_entity_deletion` computes `transaction_time = Timestamp::<TransactionTime>::now()` and
/// checks `decision_time > transaction_time.cast()`. Setting `decision_time` to the future triggers
/// this guard before any database work happens.
#[tokio::test]
async fn decision_time_exceeds_transaction_time() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = crate::create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // 1 hour in the future
    let future_time = Timestamp::<DecisionTime>::from_unix_timestamp(
        time::OffsetDateTime::now_utc().unix_timestamp() + 3600,
    );

    let err = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: Some(future_time),
            },
        )
        .await
        .expect_err("future decision_time should be rejected");

    assert_matches!(err.current_context(), DeletionError::InvalidDecisionTime);
}

/// Accepts a past `decision_time` and records it in the tombstone.
///
/// The past `decision_time` is used both as the pinned axis for `select_entities_for_deletion` (the
/// entity must have been alive at that time) and as `deleted_at_decision_time` in
/// [`EntityDeletionProvenance`]. The tombstone must reflect the explicit past timestamp, not the
/// current time.
#[tokio::test]
async fn decision_time_in_past_succeeds() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Create entity with decision_time 2 hours ago so it's alive at 1 hour ago
    let two_hours_ago = Timestamp::<DecisionTime>::from_unix_timestamp(
        time::OffsetDateTime::now_utc().unix_timestamp() - 7200,
    );

    let entity = api
        .store
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: type_system::principal::actor_group::WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: Some(two_hours_ago),
                entity_type_ids: HashSet::from([person_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: provenance(),
            },
        )
        .await
        .expect("could not create entity");

    let entity_id = entity.metadata.record_id.entity_id;

    // Delete with decision_time 1 hour ago (entity was alive then)
    let one_hour_ago = Timestamp::<DecisionTime>::from_unix_timestamp(
        time::OffsetDateTime::now_utc().unix_timestamp() - 3600,
    );

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: Some(one_hour_ago),
            },
        )
        .await
        .expect("past decision_time should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    let deletion = get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
        .await
        .expect("deletion provenance should exist");

    assert_eq!(deletion.deleted_at_decision_time, one_hour_ago);
}

/// Defaults `decision_time` to `transaction_time` when `None`.
///
/// When `decision_time` is `None`, `execute_entity_deletion` defaults it to
/// `transaction_time.cast()`. Both timestamps are derived from the same
/// `Timestamp::<TransactionTime>::now()` call, so `deleted_at_decision_time` and
/// `deleted_at_transaction_time` in the provenance must be exactly equal (`.cast()` is a zero-cost
/// type conversion, not a second clock read).
#[tokio::test]
async fn decision_time_defaults_to_transaction_time() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = crate::create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("delete should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    let deletion = get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
        .await
        .expect("deletion provenance should exist");

    assert_eq!(
        deletion.deleted_at_decision_time.cast::<TransactionTime>(),
        deletion.deleted_at_transaction_time,
        "decision_time should exactly equal transaction_time when defaulted"
    );
}

/// Finds nothing when `decision_time` predates entity creation.
///
/// `select_entities_for_deletion` uses `QueryTemporalAxes::TransactionTime` with the decision axis
/// pinned at `decision_time` and a point query on transaction time at now. An entity created after
/// the given `decision_time` was not alive at that decision time, so its temporal rows don't match
/// the pinned axis and the filter produces nothing. Deletion is a no-op and the entity survives.
#[tokio::test]
async fn decision_time_before_creation_finds_nothing() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Entity created "now" (default decision_time)
    let entity = crate::create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Attempt deletion with decision_time 1 hour ago (before entity existed)
    let past_time = Timestamp::<DecisionTime>::from_unix_timestamp(
        time::OffsetDateTime::now_utc().unix_timestamp() - 3600,
    );

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: Some(past_time),
            },
        )
        .await
        .expect("delete with old decision_time should succeed (noop)");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 0,
        }
    );

    // Entity still exists
    assert!(count_entity(&api, entity_id, false).await >= 1);
}

/// Past `decision_time` still deletes ALL temporal editions, not just the one alive at that time.
///
/// `select_entities_for_deletion` pins at `decision_time` to find the entity, but
/// `collect_entity_edition_ids` queries `entity_temporal_metadata` without temporal restriction.
/// This means even editions created AFTER the `decision_time` are captured and deleted. If
/// `collect_entity_edition_ids` accidentally filtered by `decision_time`, the second edition
/// (created later) would survive and the test would fail.
#[tokio::test]
async fn past_decision_time_deletes_all_editions() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Create entity 2 hours ago
    let two_hours_ago = Timestamp::<DecisionTime>::from_unix_timestamp(
        time::OffsetDateTime::now_utc().unix_timestamp() - 7200,
    );

    let entity = api
        .store
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: type_system::principal::actor_group::WebId::new(api.account_id),
                entity_uuid: None,
                decision_time: Some(two_hours_ago),
                entity_type_ids: HashSet::from([person_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(alice(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: provenance(),
            },
        )
        .await
        .expect("could not create entity");

    let entity_id = entity.metadata.record_id.entity_id;
    let web_id = entity_id.web_id;
    let entity_uuid = entity_id.entity_uuid;

    // Create a second edition "now" (default decision_time)
    api.store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: HashSet::default(),
                properties: vec![PropertyPatchOperation::Replace {
                    path: PropertyPath::default(),
                    property: PropertyWithMetadata::from_parts(Property::Object(bob()), None)
                        .expect("could not create property with metadata"),
                }],
                draft: None,
                archived: None,
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("could not patch entity");

    assert!(
        raw_count(&api, "entity_temporal_metadata", web_id, entity_uuid).await >= 2,
        "entity must have >= 2 temporal rows (original + patched)"
    );

    // Delete with decision_time 1 hour ago — entity was alive then (created 2h ago)
    // The second edition (created "now") was NOT alive at 1h ago, but must still be deleted
    let one_hour_ago = Timestamp::<DecisionTime>::from_unix_timestamp(
        time::OffsetDateTime::now_utc().unix_timestamp() - 3600,
    );

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: Some(one_hour_ago),
            },
        )
        .await
        .expect("deletion with past decision_time should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    // ALL temporal rows must be gone — not just the edition alive at 1h ago
    assert_eq!(
        raw_count(&api, "entity_temporal_metadata", web_id, entity_uuid).await,
        0,
        "all temporal editions must be deleted, not just the one alive at decision_time"
    );
    assert_eq!(count_entity(&api, entity_id, false).await, 0);

    let deletion = get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
        .await
        .expect("deletion provenance should exist");

    assert_eq!(deletion.deleted_at_decision_time, one_hour_ago);
}
