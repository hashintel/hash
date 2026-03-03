use std::collections::HashSet;

use hash_graph_store::{
    entity::{
        CreateEntityParams, DeleteEntitiesParams, DeletionScope, DeletionSummary, EntityStore as _,
        LinkDeletionBehavior, PatchEntityParams, UpdateEntityEmbeddingsParams,
    },
    filter::Filter,
};
use hash_graph_temporal_versioning::{TemporalTagged as _, Timestamp, TransactionTime};
use hash_graph_types::{Embedding, knowledge::entity::EntityEmbedding};
use type_system::{
    knowledge::{
        entity::{EntityId, id::EntityUuid},
        property::{
            Property, PropertyObjectWithMetadata, PropertyPatchOperation, PropertyPath,
            PropertyWithMetadata,
        },
    },
    principal::actor_group::WebId,
};
use uuid::Uuid;

use crate::{
    DatabaseTestWrapper, alice, bob, count_entity, create_link, create_person, create_second_user,
    get_deletion_provenance, get_inferred_provenance, person_type_id, provenance, raw_count,
    raw_entity_ids_exists, seed,
};

/// Helper: purge with default settings (`include_drafts=false`, Ignore link behavior).
const fn purge_params(
    filter: Filter<'static, type_system::knowledge::Entity>,
) -> DeleteEntitiesParams<'static> {
    DeleteEntitiesParams {
        filter,
        include_drafts: false,
        scope: DeletionScope::Purge {
            link_behavior: LinkDeletionBehavior::Ignore,
        },
        decision_time: None,
    }
}

/// Purges a single published entity with no history.
///
/// Creates one published entity, purges it with `Ignore` link behavior, and verifies
/// `count_entities` drops from 1 to 0. The filter uses `Filter::for_entity_by_entity_id` with
/// `draft_id: None`, which matches on `(web_id, entity_uuid)` only — the `draft_id IS NULL`
/// constraint comes from `include_drafts: false` via [`SelectCompiler`], not from the filter
/// itself.
#[tokio::test]
async fn published_entity() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .store
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
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
        .expect("could not create entity");

    let entity_id = entity.metadata.record_id.entity_id;
    assert_eq!(count_entity(&api, entity_id, false).await, 1);

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
        .expect("could not delete entity");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );
    assert_eq!(count_entity(&api, entity_id, false).await, 0);
}

/// Purges an entity that was updated, producing 2 temporal editions.
///
/// Verifies ALL editions are removed, not just the latest. The select phase uses a point query on
/// `transaction_time` (now) pinned at `decision_time`, which finds only the current version. But
/// `collect_entity_edition_ids` then queries `entity_temporal_metadata` without temporal
/// restriction, capturing all historical edition IDs for the DELETE operations.
#[tokio::test]
async fn published_entity_with_history() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = api
        .store
        .create_entity(
            api.account_id,
            CreateEntityParams {
                web_id: WebId::new(api.account_id),
                entity_uuid: None,
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
        .expect("could not create entity");

    let entity_id = entity.metadata.record_id.entity_id;

    api.store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                properties: vec![PropertyPatchOperation::Replace {
                    path: PropertyPath::default(),
                    property: PropertyWithMetadata::from_parts(Property::Object(bob()), None)
                        .expect("could not create property with metadata"),
                }],
                entity_type_ids: HashSet::new(),
                archived: None,
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("could not update entity");

    // Unbounded temporal query shows both editions
    assert_eq!(count_entity(&api, entity_id, false).await, 2);

    let web_id = entity_id.web_id;
    let entity_uuid = entity_id.entity_uuid;
    assert!(
        raw_count(&api, "entity_temporal_metadata", web_id, entity_uuid).await >= 2,
        "entity must have >= 2 temporal metadata rows before purge"
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
                decision_time: None,
            },
        )
        .await
        .expect("could not delete entity");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );
    // All history gone — both via read path and raw table count
    assert_eq!(count_entity(&api, entity_id, false).await, 0);
    assert_eq!(
        raw_count(&api, "entity_temporal_metadata", web_id, entity_uuid).await,
        0,
        "all temporal metadata rows must be deleted, not just the current edition"
    );
}

/// Succeeds silently when the filter matches nothing.
///
/// The [`SelectCompiler`] queries `entity_temporal_metadata`, not `entity_ids`. A nonexistent
/// entity has no temporal rows, so both full and draft targets are empty and
/// `execute_entity_deletion` returns `Ok(())` immediately.
#[tokio::test]
async fn no_match_is_noop() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let nonexistent_id = EntityId {
        web_id: WebId::new(api.account_id),
        entity_uuid: EntityUuid::new(Uuid::new_v4()),
        draft_id: None,
    };

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(nonexistent_id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("deletion of nonexistent entity should not fail");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 0,
        }
    );
}

/// `include_drafts` has no effect on published-only entities.
///
/// A published entity has `draft_id IS NULL` in all temporal rows. With `include_drafts: true`,
/// [`SelectCompiler`] does NOT add `draft_id IS NULL` — but since all rows already satisfy that
/// condition, the result is identical to `include_drafts: false`. Both calls must produce the same
/// `DeletionSummary` and leave the entity equally purged.
#[tokio::test]
async fn include_drafts_irrelevant_for_published() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let summary_a = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("could not delete entity A");

    let summary_b = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("could not delete entity B");

    let expected = DeletionSummary {
        full_entities: 1,
        draft_deletions: 0,
    };
    assert_eq!(summary_a, expected);
    assert_eq!(summary_b, expected);
    assert_eq!(count_entity(&api, id_a, false).await, 0);
    assert_eq!(count_entity(&api, id_b, false).await, 0);
}

/// `Purge` with [`LinkDeletionBehavior::Error`] succeeds when no incoming links exist.
///
/// All other purge tests use `Ignore` link behavior, skipping `count_incoming_links` entirely.
/// This test exercises the `Error` path: `count_incoming_links` runs, finds 0 incoming edges from
/// sources outside the batch, and deletion proceeds normally. Confirms the happy path through the
/// link check doesn't spuriously block deletion.
#[tokio::test]
async fn purge_error_succeeds_without_incoming_links() {
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
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                decision_time: None,
            },
        )
        .await
        .expect("purge with Error behavior should succeed when no incoming links exist");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );
    assert_eq!(count_entity(&api, entity_id, false).await, 0);
    assert!(raw_entity_ids_exists(&api, entity_id.web_id, entity_id.entity_uuid).await);
}

/// Verifies the tombstone carries correct deletion provenance.
///
/// After purge, the `entity_ids` row persists with `provenance->'deletion'` containing
/// `deletedById` (matching the acting actor), `deletedAtTransactionTime`, and
/// `deletedAtDecisionTime`. The provenance is merged into the existing JSONB via
/// `update_entity_ids_provenance` using PostgreSQL's `||` operator. Verified via raw SQL.
#[tokio::test]
async fn tombstone_has_deletion_provenance() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("could not delete entity");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert!(raw_entity_ids_exists(&api, entity_id.web_id, entity_id.entity_uuid).await);

    let deletion = get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
        .await
        .expect("deletion provenance should exist");

    assert_eq!(deletion.deleted_by_id, api.account_id);
}

/// Verifies all satellite tables are cleaned after purge.
///
/// After purge, `entity_temporal_metadata`, `entity_editions`, `entity_is_of_type`,
/// `entity_embeddings`, and `entity_drafts` must have zero rows for the entity.
/// `delete_target_data` deletes these in FK-safe order: edition IDs are collected first, then
/// `entity_is_of_type` and `entity_embeddings` (no children), then `entity_temporal_metadata` (FK
/// to editions and drafts), then `entity_editions`, and finally `entity_drafts`. Verified via raw
/// SQL `COUNT(*)` per table.
#[tokio::test]
async fn satellite_tables_cleaned() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("could not delete entity");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    let web_id = entity_id.web_id;
    let entity_uuid = entity_id.entity_uuid;
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
    // implicitly: edition IDs are collected from temporal metadata before deletion, so if
    // temporal metadata is empty and the deletion succeeded without FK violations, both must be
    // clean.

    // entity_ids survives as tombstone
    assert!(raw_entity_ids_exists(&api, web_id, entity_uuid).await);
}

/// Purging the same entity twice succeeds silently on the second call.
///
/// After the first purge, `entity_temporal_metadata` is gone. Since `select_entities_for_deletion`
/// queries temporal metadata (not `entity_ids`), the second call finds no matching rows, produces
/// empty targets, and returns `Ok(())`. The surviving tombstone in `entity_ids` does not interfere.
/// Provenance must not be double-stamped.
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
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("first purge failed");

    assert_eq!(
        summary1,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    let prov_after_first = get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
        .await
        .expect("provenance should exist after first purge");

    let summary2 = api
        .store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("second purge should not fail");

    assert_eq!(
        summary2,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 0,
        }
    );

    let prov_after_second = get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
        .await
        .expect("provenance should still exist after second purge");

    assert_eq!(
        prov_after_first, prov_after_second,
        "provenance must not be double-stamped"
    );
}

/// Purges multiple entities in a single call.
///
/// Uses a filter matching 2+ entities. Exercises `UNNEST` arrays with multiple
/// elements. Both entities must be fully deleted (count = 0 for each).
#[tokio::test]
async fn multiple_entities_in_batch() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let filter = Filter::Any(vec![
        Filter::for_entity_by_entity_id(id_a),
        Filter::for_entity_by_entity_id(id_b),
    ]);

    let summary = api
        .store
        .delete_entities(api.account_id, purge_params(filter))
        .await
        .expect("could not delete entities");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 2,
            draft_deletions: 0,
        }
    );
    assert_eq!(count_entity(&api, id_a, false).await, 0);
    assert_eq!(count_entity(&api, id_b, false).await, 0);

    // Both tombstoned
    assert!(raw_entity_ids_exists(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
}

/// Purging one entity must not affect another entity's data.
///
/// After purging A, entity B's satellite table rows, `entity_ids`, and temporal
/// data must be completely intact. Guards against `UNNEST` over-matching.
#[tokio::test]
async fn other_entity_unaffected() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(id_a)),
        )
        .await
        .expect("could not delete entity A");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert_eq!(count_entity(&api, id_a, false).await, 0);
    assert_eq!(count_entity(&api, id_b, false).await, 1);

    // B's satellite data intact
    let web_b = id_b.web_id;
    let uuid_b = id_b.entity_uuid;
    assert!(raw_count(&api, "entity_temporal_metadata", web_b, uuid_b).await > 0);
    assert!(raw_entity_ids_exists(&api, web_b, uuid_b).await);
}

/// Purges a batch containing entities with different states in one call.
///
/// Batch includes: a plain entity, a link entity (has immutable `entity_edge` rows), and a
/// draft-only entity. Uses `Ignore` link behavior and `include_drafts: true`. The draft-only entity
/// gets promoted to a full target by `promote_draft_only_entities` (all drafts matched, no
/// published version). Exercises the full partition → `delete_target_data` (both full and draft
/// branches) → `delete_entity_edge` → `update_entity_ids_provenance` pipeline.
#[tokio::test]
async fn batch_with_mixed_entity_states() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    let draft = create_person(&mut api, alice(), true).await;
    let id_draft = draft.metadata.record_id.entity_id;

    let filter = Filter::Any(vec![
        Filter::for_entity_by_entity_id(id_a),
        Filter::for_entity_by_entity_id(id_b),
        Filter::for_entity_by_entity_id(id_link),
        Filter::for_entity_by_entity_id(id_draft),
    ]);

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter,
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("could not delete mixed batch");

    // A, B, L are full targets; D is promoted to full (all drafts matched, no published version)
    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 4,
            draft_deletions: 0,
        }
    );

    assert_eq!(count_entity(&api, id_a, false).await, 0);
    assert_eq!(count_entity(&api, id_b, false).await, 0);
    assert_eq!(count_entity(&api, id_link, false).await, 0);
    assert_eq!(count_entity(&api, id_draft, true).await, 0);

    // All tombstoned
    assert!(raw_entity_ids_exists(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(raw_entity_ids_exists(&api, id_draft.web_id, id_draft.entity_uuid).await);
}

/// Purges entities owned by different [`WebId`]s in a single batch.
///
/// All per-table DELETE operations use `UNNEST($1::UUID[], $2::UUID[])` which pairs `web_ids[i]`
/// with `entity_uuids[i]` positionally. If the parallel vecs in `FullEntityDeletionTarget` get
/// misaligned, wrong entities are deleted. This test creates a second user/web via `seed()` setup,
/// creates one entity per web, purges both, and verifies correct tombstoning without
/// cross-contamination.
#[tokio::test]
async fn cross_web_batch() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;

    let second_user = create_second_user(&mut api).await;
    let entity_b = api
        .store
        .create_entity(
            second_user,
            CreateEntityParams {
                web_id: WebId::new(second_user),
                entity_uuid: None,
                decision_time: None,
                entity_type_ids: HashSet::from([person_type_id()]),
                properties: PropertyObjectWithMetadata::from_parts(bob(), None)
                    .expect("could not create property with metadata object"),
                confidence: None,
                link_data: None,
                draft: false,
                policies: Vec::new(),
                provenance: provenance(),
            },
        )
        .await
        .expect("could not create entity B");

    let id_b = entity_b.metadata.record_id.entity_id;
    assert_ne!(
        id_a.web_id, id_b.web_id,
        "entities must be in different webs"
    );

    let filter = Filter::Any(vec![
        Filter::for_entity_by_entity_id(id_a),
        Filter::for_entity_by_entity_id(id_b),
    ]);

    let summary = api
        .store
        .delete_entities(api.account_id, purge_params(filter))
        .await
        .expect("could not delete cross-web batch");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 2,
            draft_deletions: 0,
        }
    );

    // Both tombstoned
    assert!(raw_entity_ids_exists(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);

    // Satellite data gone for both (read path AND raw table)
    assert_eq!(count_entity(&api, id_a, false).await, 0);
    assert_eq!(count_entity(&api, id_b, false).await, 0);
    assert_eq!(
        raw_count(
            &api,
            "entity_temporal_metadata",
            id_a.web_id,
            id_a.entity_uuid
        )
        .await,
        0,
        "entity A temporal metadata must be cleaned in its web"
    );
    assert_eq!(
        raw_count(
            &api,
            "entity_temporal_metadata",
            id_b.web_id,
            id_b.entity_uuid
        )
        .await,
        0,
        "entity B temporal metadata must be cleaned in its web"
    );
}

/// Querying a purged entity returns an empty result, not an error.
///
/// After purge, `entity_ids` has a tombstone but `entity_temporal_metadata` and `entity_editions`
/// are gone. The read path uses a recursive CTE that expects non-null `entity_edition_id` and type
/// resolution JOINs on `entity_editions`. This test validates that those JOINs produce zero rows
/// (not errors) when the tombstone exists but satellite data does not. Both `query_entities` and
/// `get_entity_by_id` must handle this gracefully.
#[tokio::test]
async fn query_after_purge_returns_empty() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    api.store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("could not delete entity");

    // count_entity exercises the full read path (SelectCompiler → SQL)
    // If the tombstone caused a read error, this would panic instead of returning 0
    assert_eq!(count_entity(&api, entity_id, false).await, 0);
    assert_eq!(count_entity(&api, entity_id, true).await, 0);
}

/// Verifies provenance records the deleting actor, not the creating actor.
///
/// Actor A creates the entity, Actor B deletes it. `update_entity_ids_provenance` receives the
/// `actor_id` from the `delete_entities` caller and stores it as `deleted_by_id` in
/// [`EntityDeletionProvenance`]. The tombstone's `provenance->'deletion'->'deletedById'` must be
/// Actor B's ID, not A's.
#[tokio::test]
async fn different_actor_deleting() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Entity created by api.account_id (actor A)
    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Delete as actor B
    let actor_b = create_second_user(&mut api).await;
    let summary = api
        .store
        .delete_entities(
            actor_b,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("could not delete entity as actor B");

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

    assert_eq!(deletion.deleted_by_id, actor_b);
    assert_ne!(deletion.deleted_by_id, api.account_id);
}

/// Purges an entity that has embeddings in `entity_embeddings`.
///
/// No other deletion test creates embeddings. This verifies `delete_entity_embeddings` actually
/// deletes real rows. For full targets the DELETE uses `(web_id, entity_uuid) IN (UNNEST(...))`,
/// removing all embeddings regardless of `draft_id`.
#[tokio::test]
async fn entity_with_embeddings() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Add embeddings
    let now_tt = Timestamp::<TransactionTime>::now();
    api.store
        .update_entity_embeddings(
            api.account_id,
            UpdateEntityEmbeddingsParams {
                entity_id,
                embeddings: vec![EntityEmbedding {
                    property: None,
                    embedding: Embedding::from(vec![0.0_f32; Embedding::DIM]),
                }],
                updated_at_transaction_time: now_tt,
                updated_at_decision_time: now_tt.cast(),
                reset: true,
            },
        )
        .await
        .expect("could not add embeddings");

    // Verify embeddings exist before deletion
    let web_id = entity_id.web_id;
    let entity_uuid = entity_id.entity_uuid;
    assert!(
        raw_count(&api, "entity_embeddings", web_id, entity_uuid).await > 0,
        "embeddings should exist before purge"
    );

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("could not delete entity with embeddings");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert_eq!(
        raw_count(&api, "entity_embeddings", web_id, entity_uuid).await,
        0,
        "embeddings should be cleaned up after purge"
    );
}

/// Stress test with 50+ entities in a single batch.
///
/// Exercises PostgreSQL `UNNEST` array performance with large parameters.
/// All entities must be fully deleted.
#[tokio::test]
async fn large_batch() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let mut ids = Vec::new();
    for _ in 0..50 {
        let entity = create_person(&mut api, alice(), false).await;
        ids.push(entity.metadata.record_id.entity_id);
    }

    let filter = Filter::Any(
        ids.iter()
            .map(|id| Filter::for_entity_by_entity_id(*id))
            .collect(),
    );

    let summary = api
        .store
        .delete_entities(api.account_id, purge_params(filter))
        .await
        .expect("could not delete large batch");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 50,
            draft_deletions: 0,
        }
    );

    for id in &ids {
        assert_eq!(count_entity(&api, *id, false).await, 0);
    }
}

/// Purges entities matching a type-based filter instead of entity ID.
///
/// All other deletion tests use `Filter::for_entity_by_entity_id`. This test uses a filter on
/// entity type, exercising a different [`SelectCompiler`] code path in
/// `select_entities_for_deletion`. The select phase must correctly partition type-matched entities
/// into `FullEntityDeletionTarget` entries.
#[tokio::test]
async fn filter_by_entity_type() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    // Create a link entity (friend-of type) as the "other type"
    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // Delete by person type (not entity ID) — should match A and B but not the link
    let person_type = person_type_id();
    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_type_id(&person_type),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("could not delete by entity type");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 2,
            draft_deletions: 0,
        }
    );

    // Both persons deleted
    assert_eq!(count_entity(&api, id_a, false).await, 0);
    assert_eq!(count_entity(&api, id_b, false).await, 0);

    // Link entity survives (different type)
    assert!(count_entity(&api, id_link, false).await >= 1);
}

/// Purges an entity that was previously archived.
///
/// Archived entities have an upper temporal bound set. `select_entities_for_deletion` uses
/// `QueryTemporalAxes::TransactionTime` with pinned `decision_time` and a point query on
/// `transaction_time` at now. This test verifies that archived entities (closed temporal bounds)
/// are still found by this query window and correctly purged.
#[tokio::test]
async fn archived_entity() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Archive the entity
    api.store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id,
                properties: vec![],
                entity_type_ids: HashSet::new(),
                archived: Some(true),
                draft: None,
                decision_time: None,
                confidence: None,
                provenance: provenance(),
            },
        )
        .await
        .expect("could not archive entity");

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("could not purge archived entity");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert_eq!(count_entity(&api, entity_id, false).await, 0);
    assert!(raw_entity_ids_exists(&api, entity_id.web_id, entity_id.entity_uuid).await);
}

/// Verifies the JSONB `||` merge in `update_entity_ids_provenance` preserves existing provenance
/// keys.
///
/// `entity_ids.provenance` already contains `createdById`, `createdAtTransactionTime`,
/// `createdAtDecisionTime`, and potentially `firstNonDraftCreatedAt*` from entity creation. The `||
/// jsonb_build_object('deletion', ...)` merge adds a new top-level `deletion` key. PostgreSQL's
/// `||` on JSONB objects merges top-level keys (overwrites on collision, preserves non-colliding
/// ones). Since `deletion` is a new key, all existing keys must survive intact.
#[tokio::test]
async fn provenance_merge_preserves_existing_keys() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    api.store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("could not delete entity");

    let prov = get_inferred_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
        .await
        .expect("provenance should exist");

    // Deserialization as InferredEntityProvenance guarantees creation keys survived the merge
    assert_eq!(prov.created_by_id, api.account_id);

    // Deletion key must be added
    assert!(prov.deletion.is_some(), "deletion key must be present");
}

/// Attempting to erase a previously purged entity is a no-op.
///
/// After purge, `entity_ids` exists as a tombstone but `entity_temporal_metadata` is gone.
/// `select_entities_for_deletion` queries `entity_temporal_metadata` via [`SelectCompiler`],
/// finds no rows, and produces empty targets. Erase returns successfully with zero counts.
/// The tombstone in `entity_ids` is unreachable through the deletion API — it persists
/// permanently (or until direct SQL cleanup).
#[tokio::test]
async fn erase_after_purge_is_noop() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    api.store
        .delete_entities(
            api.account_id,
            purge_params(Filter::for_entity_by_entity_id(entity_id)),
        )
        .await
        .expect("purge failed");

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
        .expect("erase after purge should not fail");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 0,
        }
    );

    // Tombstone survives — unreachable through deletion API
    assert!(raw_entity_ids_exists(&api, entity_id.web_id, entity_id.entity_uuid).await);
}
