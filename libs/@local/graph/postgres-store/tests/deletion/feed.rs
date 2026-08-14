//! Dispatch tests for the entity event feed: which production motion fires which event kind.
//!
//! The table under test, one row per motion:
//!
//! - create, undraft, update at the present, archived-flag patch, draft publish over a live entity:
//!   [`EntityEvent::Updated`]
//! - temporal archive without a successor (purge archiving incoming links): [`EntityEvent::Ended`]
//! - patch into a closed decision slice (pure backfill): nothing
//! - purge: [`EntityEvent::Deleted`] alone
//! - erase, draft-only activity: nothing at all

use std::collections::HashSet;

use futures::TryStreamExt as _;
use hash_graph_postgres_store::store::{EntityDeletion, EntityEnd, EntityEvent, EntityUpdate};
use hash_graph_store::{
    entity::{
        DeleteEntitiesParams, DeletionScope, EntityStore as _, LinkDeletionBehavior,
        PatchEntityParams,
    },
    filter::Filter,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use type_system::knowledge::{
    Entity,
    property::{
        Property, PropertyObject, PropertyPatchOperation, PropertyPath, PropertyWithMetadata,
    },
};

use crate::{
    DatabaseApi, DatabaseTestWrapper, alice, bob, create_link, create_person, provenance, seed,
};

/// Collects the feed at `since` into its three kinds, keeping each kind's time order.
async fn collect_events(
    api: &DatabaseApi<'_>,
    since: Timestamp<TransactionTime>,
) -> (Vec<EntityUpdate>, Vec<EntityEnd>, Vec<EntityDeletion>) {
    let events: Vec<EntityEvent> = api
        .store
        .entity_events_since(since)
        .try_collect()
        .await
        .expect("could not read the entity event feed");
    let mut updated = Vec::new();
    let mut ended = Vec::new();
    let mut deleted = Vec::new();
    for event in events {
        match event {
            EntityEvent::Updated(update) => updated.push(update),
            EntityEvent::Ended(end) => ended.push(end),
            EntityEvent::Deleted(deletion) => deleted.push(deletion),
        }
    }
    (updated, ended, deleted)
}

/// Returns the latest event time the feed has produced so far, or the epoch.
///
/// The feed supplies its own cursors: every event carries the time the next read resumes from,
/// so the tests never read a clock that could disagree with the store's own.
async fn feed_cursor(api: &DatabaseApi<'_>) -> Timestamp<TransactionTime> {
    let (updated, ended, deleted) = collect_events(api, Timestamp::UNIX_EPOCH).await;
    updated
        .iter()
        .map(|update| update.changed_at)
        .chain(ended.iter().map(|end| end.ended_at))
        .chain(
            deleted
                .iter()
                .map(|deletion| deletion.provenance.deleted_at_transaction_time),
        )
        .max()
        .unwrap_or(Timestamp::UNIX_EPOCH)
}

/// Patches the entity's draft flag: `true` creates a draft of it, `false` publishes the draft.
async fn set_draft(api: &mut DatabaseApi<'_>, entity: &Entity, draft: bool) -> Entity {
    api.store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                decision_time: None,
                entity_type_ids: HashSet::new(),
                properties: Vec::new(),
                draft: Some(draft),
                archived: None,
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("could not change draft state")
}

/// Patches the entity's properties at the given decision time (`None` means the present).
async fn patch_properties(
    api: &mut DatabaseApi<'_>,
    entity: &Entity,
    properties: PropertyObject,
    decision_time: Option<Timestamp<DecisionTime>>,
) -> Entity {
    api.store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                decision_time,
                entity_type_ids: HashSet::new(),
                properties: vec![PropertyPatchOperation::Replace {
                    path: PropertyPath::default(),
                    property: PropertyWithMetadata::from_parts(Property::Object(properties), None)
                        .expect("could not create property with metadata"),
                }],
                draft: None,
                archived: None,
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("could not patch entity")
}

/// A third distinct property object, so a backfill differs from the edition it corrects.
///
/// [`patch_entity`](EntityStore::patch_entity) drops a patch whose result equals the locked
/// edition without writing anything, so a backfill test that reuses the original properties
/// exercises the no-op path instead of the write it means to observe.
fn charles() -> PropertyObject {
    serde_json::from_str(hash_graph_test_data::entity::PERSON_CHARLES_V1)
        .expect("could not parse entity")
}

fn purge_params(
    entity: &Entity,
    link_behavior: LinkDeletionBehavior,
) -> DeleteEntitiesParams<'static> {
    DeleteEntitiesParams {
        filter: Filter::for_entity_by_entity_id(entity.metadata.record_id.entity_id),
        temporal_axes: QueryTemporalAxesUnresolved::live_only(),
        include_drafts: false,
        scope: DeletionScope::Purge { link_behavior },
        decision_time: None,
    }
}

/// Creation fires [`EntityEvent::Updated`] with the created edition, and the event's own time
/// is its cursor.
#[tokio::test]
async fn create_fires_updated() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let cursor = feed_cursor(&api).await;
    let entity = create_person(&mut api, alice(), false).await;

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert_eq!(updated.len(), 1);
    assert!(ended.is_empty());
    assert!(deleted.is_empty());
    let update = updated[0];
    assert_eq!(
        update.entity.entity_uuid,
        entity.metadata.record_id.entity_id.entity_uuid
    );
    assert_eq!(update.edition, entity.metadata.record_id.edition_id);

    // Re-reading with an unchanged watermark returns the same events.
    let (updated_again, ended_again, deleted_again) = collect_events(&api, cursor).await;
    assert_eq!(updated_again, updated);
    assert!(ended_again.is_empty());
    assert!(deleted_again.is_empty());

    // The comparison is strict, so the event's own time excludes it.
    let (updated_after, ended_after, deleted_after) = collect_events(&api, update.changed_at).await;
    assert!(updated_after.is_empty());
    assert!(ended_after.is_empty());
    assert!(deleted_after.is_empty());
}

/// An update at the present fires [`EntityEvent::Updated`] with the new edition, and the
/// decision slice it closes stays out of [`EntityEvent::Ended`] because the present row still
/// exists.
#[tokio::test]
async fn update_at_present_fires_updated_with_new_edition() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let cursor = feed_cursor(&api).await;

    let patched = patch_properties(&mut api, &entity, bob(), None).await;
    assert_ne!(
        patched.metadata.record_id.edition_id,
        entity.metadata.record_id.edition_id
    );

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert_eq!(updated.len(), 1);
    assert!(ended.is_empty());
    assert!(deleted.is_empty());
    assert_eq!(updated[0].edition, patched.metadata.record_id.edition_id);
}

/// A patch into a closed decision slice is a pure backfill: it rewrites history rows without
/// touching the present row, and fires nothing.
#[tokio::test]
async fn backdated_patch_into_closed_slice_fires_nothing() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let backdate = Timestamp::<DecisionTime>::now();
    // This present-time patch bounds the creation slice, so `backdate` now falls inside a
    // closed slice.
    let present = patch_properties(&mut api, &entity, bob(), None).await;
    let cursor = feed_cursor(&api).await;

    let backfilled = patch_properties(&mut api, &entity, charles(), Some(backdate)).await;
    // The backfill minted an edition of its own, so it really wrote rather than hitting the
    // store's no-op early return.
    assert_ne!(
        backfilled.metadata.record_id.edition_id,
        entity.metadata.record_id.edition_id
    );
    assert_ne!(
        backfilled.metadata.record_id.edition_id,
        present.metadata.record_id.edition_id
    );

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert!(updated.is_empty());
    assert!(ended.is_empty());
    assert!(deleted.is_empty());
}

/// A backdated patch whose decision time falls inside the open present slice rewrites the
/// present from that date onward, so it fires [`EntityEvent::Updated`] like any other
/// present-state write.
#[tokio::test]
async fn backdated_patch_into_open_slice_fires_updated() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let backdate = Timestamp::<DecisionTime>::now();
    let cursor = feed_cursor(&api).await;

    let patched = patch_properties(&mut api, &entity, bob(), Some(backdate)).await;

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert_eq!(updated.len(), 1);
    assert!(ended.is_empty());
    assert!(deleted.is_empty());
    assert_eq!(updated[0].edition, patched.metadata.record_id.edition_id);
}

/// Flipping the archived flag is an edition change at the present, so it fires
/// [`EntityEvent::Updated`] and the flag travels on the edition the event carries.
#[tokio::test]
async fn archived_flag_patch_fires_updated() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let cursor = feed_cursor(&api).await;

    let archived = api
        .store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: entity.metadata.record_id.entity_id,
                decision_time: None,
                entity_type_ids: HashSet::new(),
                properties: Vec::new(),
                draft: None,
                archived: Some(true),
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("could not archive entity");
    assert!(archived.metadata.archived);

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert_eq!(updated.len(), 1);
    assert!(ended.is_empty());
    assert!(deleted.is_empty());
    assert_eq!(updated[0].edition, archived.metadata.record_id.edition_id);
}

/// Purging an entity with `Archive` link behavior ends the incoming link entity's present and
/// tombstones the target, and one read delivers both: the [`EntityEvent::Ended`] for the link
/// and the [`EntityEvent::Deleted`] for the target come from the same snapshot.
#[tokio::test]
async fn purge_with_archived_links_ends_link_and_deletes_target() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let person_a = create_person(&mut api, alice(), false).await;
    let person_b = create_person(&mut api, bob(), false).await;
    let link = create_link(
        &mut api,
        person_a.metadata.record_id.entity_id,
        person_b.metadata.record_id.entity_id,
    )
    .await;
    let cursor = feed_cursor(&api).await;

    api.store
        .delete_entities(
            api.account_id.into(),
            purge_params(&person_b, LinkDeletionBehavior::Archive),
        )
        .await
        .expect("could not purge entity");

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert!(updated.is_empty());
    assert_eq!(ended.len(), 1);
    assert_eq!(
        ended[0].entity.entity_uuid,
        link.metadata.record_id.entity_id.entity_uuid
    );
    assert_eq!(deleted.len(), 1);
    assert_eq!(
        deleted[0].entity.entity_uuid,
        person_b.metadata.record_id.entity_id.entity_uuid
    );
    assert_eq!(deleted[0].provenance.deleted_by_id, api.account_id);
}

/// Purge removes the temporal rows outright, so [`EntityEvent::Deleted`] is the only event it
/// fires, and the tombstone's own time then excludes it from the next read.
#[tokio::test]
async fn purge_fires_deleted_only() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let cursor = feed_cursor(&api).await;

    api.store
        .delete_entities(
            api.account_id.into(),
            purge_params(&entity, LinkDeletionBehavior::Ignore),
        )
        .await
        .expect("could not purge entity");

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert!(updated.is_empty());
    assert!(ended.is_empty());
    assert_eq!(deleted.len(), 1);
    assert_eq!(
        deleted[0].entity.entity_uuid,
        entity.metadata.record_id.entity_id.entity_uuid
    );

    let (updated_after, ended_after, deleted_after) =
        collect_events(&api, deleted[0].provenance.deleted_at_transaction_time).await;
    assert!(updated_after.is_empty());
    assert!(ended_after.is_empty());
    assert!(deleted_after.is_empty());
}

/// Erase removes the `entity_ids` row itself, so the feed carries no record of the entity, from
/// any watermark.
#[tokio::test]
async fn erase_fires_nothing() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;

    api.store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity.metadata.record_id.entity_id),
                temporal_axes: QueryTemporalAxesUnresolved::live_only(),
                include_drafts: false,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("could not erase entity");

    let (updated, ended, deleted) = collect_events(&api, Timestamp::UNIX_EPOCH).await;
    assert!(updated.is_empty());
    assert!(ended.is_empty());
    assert!(deleted.is_empty());
}

/// Draft activity never enters the feed, and undrafting is the first event the entity fires.
#[tokio::test]
async fn draft_lifecycle_silent_until_undraft() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let cursor = feed_cursor(&api).await;
    let draft = create_person(&mut api, alice(), true).await;
    let draft_patched = patch_properties(&mut api, &draft, bob(), None).await;

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert!(updated.is_empty());
    assert!(ended.is_empty());
    assert!(deleted.is_empty());

    let published = set_draft(&mut api, &draft_patched, false).await;

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert_eq!(updated.len(), 1);
    assert!(ended.is_empty());
    assert!(deleted.is_empty());
    assert_eq!(
        updated[0].entity.entity_uuid,
        published.metadata.record_id.entity_id.entity_uuid
    );
    assert_eq!(updated[0].edition, published.metadata.record_id.edition_id);
}

/// Publishing a draft over a live entity closes the live decision slice and installs the
/// published edition as the new present in one motion, so the entity fires
/// [`EntityEvent::Updated`] and never [`EntityEvent::Ended`]. This is the anti-join's sharpest
/// case. After the publish, one snapshot carries both a decision-closed current row and a
/// present row for the entity, and without the anti-join the closed row would enter the ended
/// kind.
#[tokio::test]
async fn draft_supersedes_live_fires_updated_not_ended() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let live = create_person(&mut api, alice(), false).await;
    let draft = set_draft(&mut api, &live, true).await;
    assert!(draft.metadata.record_id.entity_id.draft_id.is_some());
    let draft = patch_properties(&mut api, &draft, bob(), None).await;

    let cursor = feed_cursor(&api).await;
    let published = set_draft(&mut api, &draft, false).await;
    assert!(published.metadata.record_id.entity_id.draft_id.is_none());

    let (updated, ended, deleted) = collect_events(&api, cursor).await;
    assert_eq!(updated.len(), 1);
    assert!(ended.is_empty());
    assert!(deleted.is_empty());
    assert_eq!(
        updated[0].entity.entity_uuid,
        live.metadata.record_id.entity_id.entity_uuid
    );
    assert_eq!(updated[0].edition, published.metadata.record_id.edition_id);
}
