use std::collections::HashSet;

use hash_graph_store::{
    entity::{
        CreateEntityParams, DeleteEntitiesParams, DeletionScope, DeletionSummary, EntityStore as _,
        PatchEntityParams,
    },
    filter::Filter,
};
use type_system::knowledge::property::{
    Property, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
    PropertyWithMetadata,
};

use crate::{
    DatabaseTestWrapper, alice, count_entity, create_person, get_deletion_provenance,
    person_type_id, provenance, raw_count, raw_entity_ids_exists, seed,
};

/// Erases the `entity_ids` row entirely, leaving no tombstone.
///
/// After erase, `entity_ids` has zero rows for the `(web_id, entity_uuid)` pair. Unlike purge
/// (which calls `update_entity_ids_provenance` to stamp a tombstone), erase calls
/// `delete_entity_ids` to remove the row completely. `count_incoming_links` always runs for erase
/// scope to prevent FK violations from `entity_edge.target → entity_ids`.
#[tokio::test]
async fn removes_entity_ids_row() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("erase should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert_eq!(count_entity(&api, entity_id, false).await, 0);
    assert!(!raw_entity_ids_exists(&api, entity_id.web_id, entity_id.entity_uuid).await);
}

/// Verifies all satellite tables are cleaned after erase.
///
/// Same `delete_target_data` FK-safe ordering as purge (collect edition IDs → `entity_is_of_type` →
/// `entity_embeddings` → `entity_temporal_metadata` → `entity_editions` → `entity_drafts`),
/// followed by `delete_entity_edge` and `delete_entity_ids`. All tables with
/// `(web_id, entity_uuid)` columns must have zero rows for the entity.
#[tokio::test]
async fn satellite_tables_cleaned() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;
    let web_id = entity_id.web_id;
    let entity_uuid = entity_id.entity_uuid;

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("erase should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert_eq!(
        raw_count(&api, "entity_temporal_metadata", web_id, entity_uuid).await,
        0
    );
    assert_eq!(
        raw_count(&api, "entity_embeddings", web_id, entity_uuid).await,
        0
    );
    assert_eq!(
        raw_count(&api, "entity_drafts", web_id, entity_uuid).await,
        0
    );
    // entity_editions and entity_is_of_type have no (web_id, entity_uuid) columns — verified
    // implicitly: deletion succeeded without FK violations and temporal metadata is empty.

    assert!(!raw_entity_ids_exists(&api, web_id, entity_uuid).await);
}

/// Erases an entity with multiple temporal editions.
///
/// `collect_entity_edition_ids` captures all historical edition IDs from `entity_temporal_metadata`
/// without temporal restriction. All editions, temporal rows, and the `entity_ids` row must be
/// completely gone.
#[tokio::test]
async fn entity_with_history() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Create a second edition via patch (must change properties to create new edition)
    api.store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: HashSet::default(),
                properties: vec![PropertyPatchOperation::Replace {
                    path: PropertyPath::default(),
                    property: PropertyWithMetadata::from_parts(
                        Property::Object(crate::bob()),
                        None,
                    )
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

    assert!(count_entity(&api, entity_id, false).await >= 2);

    let web_id = entity_id.web_id;
    let entity_uuid = entity_id.entity_uuid;
    assert!(
        raw_count(&api, "entity_temporal_metadata", web_id, entity_uuid).await >= 2,
        "entity must have >= 2 temporal metadata rows before erase"
    );

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("erase should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert_eq!(count_entity(&api, entity_id, false).await, 0);
    assert_eq!(
        raw_count(&api, "entity_temporal_metadata", web_id, entity_uuid).await,
        0,
        "all temporal metadata rows must be erased, not just the current edition"
    );
    assert!(!raw_entity_ids_exists(&api, web_id, entity_uuid).await);
}

/// Erasing the same entity twice succeeds silently on the second call.
///
/// Unlike purge (where the `entity_ids` tombstone survives), erase removes `entity_ids` too. The
/// second call's [`SelectCompiler`] queries `entity_temporal_metadata` which is also gone — no rows
/// match, empty targets, immediate `Ok(())`. There is literally no trace of the entity in any
/// table.
#[tokio::test]
async fn double_deletion_is_noop() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    let summary1 = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("first erase failed");

    assert_eq!(
        summary1,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    let summary2 = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("second erase should not fail");

    assert_eq!(
        summary2,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 0,
        }
    );

    assert!(!raw_entity_ids_exists(&api, entity_id.web_id, entity_id.entity_uuid).await);
}

/// Re-creates an entity with the same UUID after erase.
///
/// After erase, `entity_ids` is gone and `delete_target_data` has removed all satellite rows.
/// Creating a new entity with the same `entity_uuid` must succeed without FK violations from
/// orphaned references in any table. Critical for the "erase = no trace" contract. The new entity
/// should be fully functional (queryable, patchable).
#[tokio::test]
async fn entity_reuse_after_erase() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;
    let reuse_uuid = entity_id.entity_uuid;

    api.store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: false,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("erase should succeed");

    assert!(!raw_entity_ids_exists(&api, entity_id.web_id, reuse_uuid).await);

    // Re-create with the same UUID
    let new_entity = api
        .store
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: entity_id.web_id,
                entity_uuid: Some(reuse_uuid),
                decision_time: None,
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
        .expect("re-creating entity with same UUID should succeed");

    let new_id = new_entity.metadata.record_id.entity_id;
    assert!(count_entity(&api, new_id, false).await >= 1);

    // Verify it's fully functional by patching
    api.store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: new_id,
                decision_time: None,
                entity_type_ids: HashSet::default(),
                properties: vec![],
                draft: None,
                archived: None,
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("patching re-created entity should succeed");
}

/// Erases a draft-only entity that was promoted to a full target.
///
/// Draft-only entity with all drafts matched → `promote_draft_only_entities` clears the draft vec
/// (no published version and no unmatched drafts found in `entity_temporal_metadata`) → entity
/// becomes a full target → Erase scope calls `delete_entity_ids` instead of
/// `update_entity_ids_provenance`. The `entity_ids` row must be gone, not tombstoned.
#[tokio::test]
async fn promoted_draft_only_entity() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), true).await;
    let entity_id = entity.metadata.record_id.entity_id;
    let base_entity_id = type_system::knowledge::entity::EntityId {
        web_id: entity_id.web_id,
        entity_uuid: entity_id.entity_uuid,
        draft_id: None,
    };

    assert!(count_entity(&api, base_entity_id, true).await >= 1);

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(base_entity_id),
                include_drafts: true,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("erase of promoted draft should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert_eq!(count_entity(&api, base_entity_id, true).await, 0);
    assert!(!raw_entity_ids_exists(&api, entity_id.web_id, entity_id.entity_uuid).await);
}

/// Erase scope with partial draft match does NOT delete `entity_ids`.
///
/// Entity B has a published version and a draft. Filter matches only the draft with
/// `include_drafts: true`. The published version blocks promotion → draft-only target.
/// `execute_entity_deletion` only calls `delete_entity_ids` for full targets, so `entity_ids`
/// survives despite `DeletionScope::Erase`. The draft's temporal/edition/drafts rows are removed
/// but the published entity is untouched.
///
/// This is a semantic edge case: callers passing `Erase` should not assume complete removal
/// when the filter only captures drafts of an entity with published data.
#[tokio::test]
async fn erase_partial_draft_preserves_entity_ids() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Create a draft
    let patched = api
        .store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                decision_time: None,
                entity_type_ids: HashSet::default(),
                properties: vec![],
                draft: Some(true),
                archived: None,
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("could not create draft");

    let draft_entity_id = patched.metadata.record_id.entity_id;
    assert!(draft_entity_id.draft_id.is_some());

    assert!(count_entity(&api, entity_id, true).await >= 2);

    // Erase filtering only the draft
    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(draft_entity_id),
                include_drafts: true,
                scope: DeletionScope::Erase,
                decision_time: None,
            },
        )
        .await
        .expect("erase of draft should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 1,
        }
    );

    // Published version survives
    assert!(count_entity(&api, entity_id, false).await >= 1);
    assert_eq!(
        count_entity(&api, entity_id, true).await,
        count_entity(&api, entity_id, false).await
    );

    // entity_ids is NOT deleted despite Erase scope (draft-only target)
    assert!(raw_entity_ids_exists(&api, entity_id.web_id, entity_id.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
            .await
            .is_none()
    );
}
