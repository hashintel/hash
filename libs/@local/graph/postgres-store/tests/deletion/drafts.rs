use std::collections::HashSet;

use hash_graph_store::{
    entity::{
        DeleteEntitiesParams, DeletionScope, DeletionSummary, EntityStore as _,
        LinkDeletionBehavior, PatchEntityParams,
    },
    filter::Filter,
};
use type_system::knowledge::entity::EntityId;

use crate::{
    DatabaseTestWrapper, alice, bob, count_entity, create_person, get_deletion_provenance,
    provenance, raw_count_by_draft_id, raw_count_entity_edge, seed,
};

/// Promotes a draft-only entity to a full delete when all drafts are matched.
///
/// Entity created with `draft: true` and never published. With `include_drafts: true`,
/// `select_entities_for_deletion` puts the entity in the draft-only bucket. Then
/// `promote_draft_only_entities` queries `entity_temporal_metadata` (across ALL temporal history,
/// no time restriction) for rows where `draft_id IS NULL OR NOT (draft_id = ANY(matched_drafts))`.
/// Since there's no published version and no unmatched drafts, the query returns nothing → draft
/// vec is cleared → entity becomes a full target → `entity_ids` gets tombstone provenance via
/// `update_entity_ids_provenance`.
#[tokio::test]
async fn draft_only_entity_promoted_to_full_delete() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), true).await;
    let entity_id = entity.metadata.record_id.entity_id;
    let base_id = EntityId {
        web_id: entity_id.web_id,
        entity_uuid: entity_id.entity_uuid,
        draft_id: None,
    };

    assert!(count_entity(&api, base_id, true).await >= 1);
    assert_eq!(count_entity(&api, base_id, false).await, 0);

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(base_id),
                include_drafts: true,
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

    assert_eq!(count_entity(&api, base_id, true).await, 0);
    assert!(
        get_deletion_provenance(&api, base_id.web_id, base_id.entity_uuid)
            .await
            .is_some()
    );
}

/// Deletes only the draft of an entity that also has a published version.
///
/// The published version's temporal row has `draft_id IS NULL`, which matches the first branch of
/// the promotion query (`draft_id IS NULL OR NOT (draft_id = ANY(...))`). This puts the entity in
/// `entities_with_remaining_data`, preventing promotion. The entity stays as a
/// `DraftOnlyDeletionTarget`. Only `delete_target_data(Drafts)` runs — deleting the draft's
/// temporal metadata, edition, and draft row by `draft_id`. `entity_ids` is untouched and receives
/// no deletion provenance. The published version remains fully queryable.
#[tokio::test]
async fn draft_of_published_entity_preserves_published() {
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
    let draft_id = draft_entity_id
        .draft_id
        .expect("patch should produce draft_id");

    assert!(count_entity(&api, entity_id, false).await >= 1);
    assert!(count_entity(&api, entity_id, true).await >= 2);

    // Delete filtering by the specific draft_id
    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(draft_entity_id),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("draft deletion should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 1,
        }
    );

    // Published survives
    assert!(count_entity(&api, entity_id, false).await >= 1);
    assert_eq!(
        count_entity(&api, entity_id, true).await,
        count_entity(&api, entity_id, false).await
    );

    // Draft temporal metadata gone
    assert_eq!(
        raw_count_by_draft_id(&api, "entity_temporal_metadata", draft_id).await,
        0
    );

    // No tombstone (draft-only target)
    assert!(
        get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
            .await
            .is_none()
    );
}

/// Skips draft entities when `include_drafts` is false.
///
/// [`SelectCompiler`] adds `draft_id IS NULL` when `include_drafts=false`. A draft-only entity has
/// all temporal rows with `draft_id IS NOT NULL`, so none match. Note that
/// `Filter::for_entity_by_entity_id` with `draft_id: None` does NOT add a `draft_id IS NULL`
/// constraint itself — the restriction comes entirely from `include_drafts`.
#[tokio::test]
async fn include_drafts_false_skips_drafts() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), true).await;
    let entity_id = entity.metadata.record_id.entity_id;
    let base_id = EntityId {
        web_id: entity_id.web_id,
        entity_uuid: entity_id.entity_uuid,
        draft_id: None,
    };

    assert!(count_entity(&api, base_id, true).await >= 1);
    assert_eq!(count_entity(&api, base_id, false).await, 0);

    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(base_id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("delete should succeed (noop)");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 0,
        }
    );

    // Draft still exists
    assert!(count_entity(&api, base_id, true).await >= 1);
}

/// Does not promote when only some drafts of an entity are matched.
///
/// A published entity has 2 drafts. The filter only matches 1 draft.
/// `promote_draft_only_entities` finds remaining data via
/// `draft_id IS NULL OR NOT (draft_id = ANY(matched_drafts))` — the published row's `draft_id IS
/// NULL` already prevents promotion, and the unmatched draft further blocks it. Only the matched
/// draft's temporal/edition/draft rows are deleted via `DraftOnlyDeletionTarget`. The published
/// version, unmatched draft, and `entity_ids` survive without deletion provenance.
#[tokio::test]
async fn partial_draft_match_not_promoted() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Published entity
    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Create 2 drafts by patching the published entity twice
    let patched_1 = api
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
        .expect("could not create first draft");

    let draft_entity_id_1 = patched_1.metadata.record_id.entity_id;
    let draft_id_1 = draft_entity_id_1
        .draft_id
        .expect("first patch should produce draft_id");

    let patched_2 = api
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
        .expect("could not create second draft");

    let draft_id_2 = patched_2
        .metadata
        .record_id
        .entity_id
        .draft_id
        .expect("second patch should produce draft_id");

    assert_ne!(draft_id_1, draft_id_2);
    // Published + 2 drafts
    assert!(count_entity(&api, entity_id, true).await >= 3);

    // Delete only draft_id_1
    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(draft_entity_id_1),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("partial draft deletion should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 1,
        }
    );

    assert_eq!(
        raw_count_by_draft_id(&api, "entity_temporal_metadata", draft_id_1).await,
        0
    );
    assert!(raw_count_by_draft_id(&api, "entity_temporal_metadata", draft_id_2).await > 0);

    // Published version + unmatched draft survive
    assert!(count_entity(&api, entity_id, false).await >= 1);
    assert!(count_entity(&api, entity_id, true).await >= 2);

    // Not promoted → no tombstone
    assert!(
        get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
            .await
            .is_none()
    );
}

/// Upgrades to full delete when both published and draft rows match.
///
/// Requires `include_drafts: true` so [`SelectCompiler`] does NOT add `draft_id IS NULL`. The
/// filter uses `Filter::for_entity_by_entity_id` with `draft_id: None`, which matches on `(web_id,
/// entity_uuid)` only — returning both published and draft rows. The `HashMap` partitioning handles
/// this: a draft row arrives as `Vacant + Some(draft_id)` → `vec![draft_id]`, then the published
/// row arrives as `Occupied + None` → `entry.clear()` → empty vec = full target. Both published and
/// draft data are removed; `entity_ids` is tombstoned.
#[tokio::test]
async fn published_and_draft_matched_becomes_full_delete() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Create a draft
    api.store
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

    assert!(count_entity(&api, entity_id, false).await >= 1);
    assert!(count_entity(&api, entity_id, true).await >= 2);

    // Delete with include_drafts=true, filter by entity UUID (no draft_id) → matches both
    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(entity_id),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("full delete should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    assert_eq!(count_entity(&api, entity_id, true).await, 0);
    assert_eq!(count_entity(&api, entity_id, false).await, 0);
    assert!(
        get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
            .await
            .is_some()
    );
}

/// Handles full and draft-only targets simultaneously in a single call.
///
/// Entity A (published, matched by filter) produces a full target. Entity B (published + draft,
/// only draft matched) produces a draft-only target (published version blocks promotion). Both
/// branches of `delete_target_data` execute in the same `execute_entity_deletion` call. A gets
/// tombstoned with provenance, B's draft is removed but B's published version and `entity_ids`
/// survive without deletion provenance.
#[tokio::test]
async fn mixed_full_and_draft_targets() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Entity A: published, will be fully deleted
    let entity_a = create_person(&mut api, alice(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;

    // Entity B: published + draft, only draft will be deleted
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_b = entity_b.metadata.record_id.entity_id;

    let patched_b = api
        .store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: id_b,
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
        .expect("could not create draft of B");

    let b_draft_entity_id = patched_b.metadata.record_id.entity_id;

    // Filter: A (full match via entity UUID) + B's specific draft
    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(b_draft_entity_id),
                ]),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("mixed deletion should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 1,
        }
    );

    // A: fully deleted with tombstone
    assert_eq!(count_entity(&api, id_a, false).await, 0);
    assert!(
        get_deletion_provenance(&api, id_a.web_id, id_a.entity_uuid)
            .await
            .is_some()
    );

    // B: published survives, draft gone, no tombstone
    assert!(count_entity(&api, id_b, false).await >= 1);
    assert_eq!(
        count_entity(&api, id_b, true).await,
        count_entity(&api, id_b, false).await
    );
    assert!(
        get_deletion_provenance(&api, id_b.web_id, id_b.entity_uuid)
            .await
            .is_none()
    );
}

/// Verifies the empty-target guards when only one target type has data.
///
/// Create a published entity with a draft. Delete only the draft with `include_drafts: true` — the
/// published version blocks promotion, so `FullEntityDeletionTarget` is empty and
/// `DraftOnlyDeletionTarget` has the draft. The guards `!full_target.web_ids.is_empty()` and
/// `!draft_target.draft_ids.is_empty()` must correctly skip the empty branch without errors. In
/// particular, the empty full target must not trigger `delete_entity_edge`, `count_incoming_links`,
/// or `update_entity_ids_provenance`.
#[tokio::test]
async fn empty_target_guards() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

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
    let draft_id = draft_entity_id.draft_id.expect("should be draft");

    // Delete only the draft with Error behavior (full target is empty → link check skipped)
    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(draft_entity_id),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                decision_time: None,
            },
        )
        .await
        .expect("draft-only deletion should succeed even with Error behavior");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 1,
        }
    );

    assert!(count_entity(&api, entity_id, false).await >= 1);
    assert_eq!(
        raw_count_by_draft_id(&api, "entity_temporal_metadata", draft_id).await,
        0
    );
    assert!(
        get_deletion_provenance(&api, entity_id.web_id, entity_id.entity_uuid)
            .await
            .is_none()
    );
}

/// Draft link entity's `entity_edge` row survives draft-only deletion.
///
/// A published link entity L(A→B) has a draft created via `patch_entity(draft: Some(true))`.
/// `delete_entity_edge` only runs for full targets, so deleting just the draft leaves
/// `entity_edge` intact (the published link still exists). Deleting the published entity
/// afterwards triggers full deletion which cleans up the edge rows.
#[tokio::test]
async fn draft_link_entity_edge_survives() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    // Create published link entity L A→B
    let link = crate::create_link(&mut api, id_a, id_b).await;
    let link_entity_id = link.metadata.record_id.entity_id;
    assert!(link_entity_id.draft_id.is_none());

    // Create a draft of the link entity
    let patched_link = api
        .store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: link_entity_id,
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
        .expect("could not create draft of link");

    let draft_link_entity_id = patched_link.metadata.record_id.entity_id;
    assert!(draft_link_entity_id.draft_id.is_some());

    assert!(
        raw_count_entity_edge(&api, link_entity_id.web_id, link_entity_id.entity_uuid).await > 0
    );

    // Step 1: Delete only the draft → edge survives
    let summary1 = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(draft_link_entity_id),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("deleting draft should succeed");

    assert_eq!(
        summary1,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 1,
        }
    );

    // Edge survives (draft-only deletion, published link still exists)
    assert!(
        raw_count_entity_edge(&api, link_entity_id.web_id, link_entity_id.entity_uuid).await > 0
    );
    assert!(count_entity(&api, link_entity_id, false).await >= 1);

    // Step 2: Delete the published entity → full deletion, edge cleaned up
    let summary2 = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(link_entity_id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("deleting published link should succeed");

    assert_eq!(
        summary2,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
        }
    );

    // Edge cleaned up (full target deletion)
    assert_eq!(
        raw_count_entity_edge(&api, link_entity_id.web_id, link_entity_id.entity_uuid).await,
        0
    );
    assert_eq!(count_entity(&api, link_entity_id, true).await, 0);
}

/// `DeletionSummary.draft_deletions` counts individual draft IDs, not entities.
///
/// A published entity has 2 drafts. With `include_drafts: true` and a filter matching both
/// drafts specifically, `DraftOnlyDeletionTarget.draft_ids` has 2 entries. The published version
/// blocks promotion, so `DeletionSummary.draft_deletions` must be 2 (the number of draft records
/// deleted), not 1 (the number of entities affected), and `full_entities` must be 0.
#[tokio::test]
async fn summary_counts_draft_ids_not_entities() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    // Published entity
    let entity = create_person(&mut api, alice(), false).await;
    let entity_id = entity.metadata.record_id.entity_id;

    // Create 2 drafts by patching the published entity twice
    let patched_1 = api
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
        .expect("could not create first draft");

    let draft_entity_id_1 = patched_1.metadata.record_id.entity_id;
    let draft_id_1 = draft_entity_id_1
        .draft_id
        .expect("first patch should produce draft_id");

    let patched_2 = api
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
        .expect("could not create second draft");

    let draft_entity_id_2 = patched_2.metadata.record_id.entity_id;
    let draft_id_2 = draft_entity_id_2
        .draft_id
        .expect("second patch should produce draft_id");

    assert_ne!(draft_id_1, draft_id_2);
    // Published + 2 drafts
    assert!(count_entity(&api, entity_id, true).await >= 3);

    // Delete both drafts (but not the published version)
    let summary = api
        .store
        .delete_entities(
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(draft_entity_id_1),
                    Filter::for_entity_by_entity_id(draft_entity_id_2),
                ]),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                decision_time: None,
            },
        )
        .await
        .expect("deleting 2 drafts should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 2,
        }
    );

    // Published version survives
    assert!(count_entity(&api, entity_id, false).await >= 1);
    // No drafts remain
    assert_eq!(
        count_entity(&api, entity_id, true).await,
        count_entity(&api, entity_id, false).await
    );
}
