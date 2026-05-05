use core::assert_matches;
use std::collections::HashSet;

use hash_graph_store::{
    entity::{
        DeleteEntitiesParams, DeletionScope, DeletionSummary, EntityStore as _,
        LinkDeletionBehavior, PatchEntityParams,
    },
    error::DeletionError,
    filter::Filter,
};

use crate::{
    DatabaseTestWrapper, alice, bob, count_entity, create_link, create_person, find_all_axes,
    get_deletion_provenance, has_any_live_temporal_row, has_archived_provenance, is_entity_live,
    provenance, raw_count, raw_count_archived_temporal_rows, raw_count_entity_edge,
    raw_count_entity_edge_any, raw_entity_ids_exists, seed,
};

/// Rejects purge with [`LinkDeletionBehavior::Error`] when incoming links exist.
///
/// Creates A, B, and link entity L (A→B). L has an immutable `entity_edge` row with `source=L,
/// target=B`. Purging B with `Error` behavior triggers `count_incoming_links`, which finds L's edge
/// targeting B (L is outside the deletion batch) and returns [`DeletionError::IncomingLinksExist`].
#[tokio::test]
async fn purge_error_rejects_with_incoming_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let _link = create_link(&mut api, id_a, id_b).await;

    let err = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect_err("purge with Error should fail when incoming links exist");

    assert_matches!(
        err.current_context(),
        DeletionError::IncomingLinksExist { count } if *count >= 1
    );

    // Entity B must be completely intact after the error (transaction rolled back)
    assert!(count_entity(&api, id_b, false).await >= 1);
    assert!(raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id_b.web_id, id_b.entity_uuid)
            .await
            .is_none()
    );
}

/// Succeeds with [`LinkDeletionBehavior::Ignore`] despite incoming links.
///
/// Creates A, B, and link entity L (A→B). Purges B with `Ignore` behavior — the link check is
/// skipped entirely. B's `entity_ids` row survives as a tombstone with deletion provenance. L's
/// `entity_edge` row (target=B) remains valid because the FK `entity_edge.target → entity_ids`
/// still points to B's tombstone.
#[tokio::test]
async fn purge_ignore_succeeds_with_incoming_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with Ignore should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
            links_archived: 0,
        }
    );

    // B is tombstoned
    assert!(raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id_b.web_id, id_b.entity_uuid)
            .await
            .is_some()
    );

    // L's entity_edge rows still exist (L is intact, its edges point to B's tombstone)
    assert!(raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await > 0);
}

/// Rejects erase when incoming links exist, regardless of link behavior.
///
/// [`DeletionScope::Erase`] always runs `count_incoming_links` because `delete_entity_ids` would
/// violate the FK `entity_edge.target → entity_ids` if incoming edges exist. The explicit check
/// provides a clean [`DeletionError::IncomingLinksExist`] instead of a raw PostgreSQL FK violation.
#[tokio::test]
async fn erase_rejects_with_incoming_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let _link = create_link(&mut api, id_a, id_b).await;

    let err = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Erase,
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect_err("erase should fail when incoming links exist");

    assert_matches!(
        err.current_context(),
        DeletionError::IncomingLinksExist { count } if *count >= 1
    );

    // Entity B must be completely intact after the error (transaction rolled back)
    assert!(count_entity(&api, id_b, false).await >= 1);
    assert!(raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id_b.web_id, id_b.entity_uuid)
            .await
            .is_none()
    );
}

/// Purges a link entity and verifies ALL `entity_edge` rows are removed.
///
/// `entity_edge` stores bidirectional rows per link:
///
/// ```text
/// Link L: A(left) → B(right) produces 4 rows:
///   source=L, target=A, kind=has-left-entity,  direction=outgoing
///   source=A, target=L, kind=has-left-entity,  direction=incoming  ← reversed
///   source=L, target=B, kind=has-right-entity, direction=outgoing
///   source=B, target=L, kind=has-right-entity, direction=incoming  ← reversed
/// ```
///
/// `delete_entity_edge` must clean up both the outgoing rows (source=L) AND the reversed
/// incoming-direction rows (target=L). Without cleaning up the reversed rows:
/// - Purge: orphaned rows with FK to tombstone (data leak)
/// - Erase: FK violation when `entity_ids` is deleted
#[tokio::test]
async fn purge_link_entity_removes_all_edges() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // Verify edges exist before deletion
    assert_eq!(
        raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await,
        4
    );

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_link),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge link entity should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
            links_archived: 0,
        }
    );

    // All 4 entity_edge rows should be gone
    assert_eq!(
        raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await,
        0
    );

    // Endpoints are unaffected
    assert!(raw_entity_ids_exists(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id_a.web_id, id_a.entity_uuid)
            .await
            .is_none()
    );
    assert!(
        get_deletion_provenance(&api, id_b.web_id, id_b.entity_uuid)
            .await
            .is_none()
    );
}

/// Links within the deletion batch are excluded from the incoming-link count.
///
/// Creates A, B, and link L (A→B). Purges all three together with `Error` behavior.
/// `count_incoming_links` uses `(target_web_id, target_entity_uuid) IN (batch) AND (source_web_id,
/// source_entity_uuid) NOT IN (batch)`. Since L (the source of the edge to B) is also in the
/// deletion batch, L's edge is excluded from the count and B's deletion is not blocked.
///
/// **Note**: `entity_edge` stores reversed (incoming-direction) rows. For L in the batch, its
/// reversed rows have `source=A/B, target=L`. If A and B are also in the batch, those sources are
/// excluded from the count too. This test must include A+B+L in the batch to succeed.
#[tokio::test]
async fn self_referential_batch_not_counted() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(id_b),
                    Filter::for_entity_by_entity_id(id_link),
                ]),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("batch purge with all entities should succeed with Error behavior");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 3,
            draft_deletions: 0,
            links_archived: 0,
        }
    );
}

/// Draft-only deletion skips the incoming-link check entirely.
///
/// The link check in `execute_entity_deletion` is gated behind `!full_target.web_ids.is_empty()`.
/// This is safe because draft-only deletion never touches `entity_ids`, so `entity_edge` FKs to
/// `entity_ids` remain intact.
///
/// Setup: published entity B with a draft, and link L (A→B) with immutable `entity_edge` row.
/// Deleting B's draft with `include_drafts=true` and `Error` behavior produces only a
/// `DraftOnlyDeletionTarget` (the published version appears in `entities_with_remaining_data`,
/// preventing promotion). The full target is empty, so the link check is bypassed and deletion
/// succeeds. Published B and L's `entity_edge` survive.
#[tokio::test]
async fn draft_deletion_skips_link_check() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    // Create a draft of B
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

    let draft_entity_id = patched_b.metadata.record_id.entity_id;
    assert!(draft_entity_id.draft_id.is_some());

    // Create link L A→B (published)
    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // Delete B's draft with Error behavior — should succeed because full_target is empty
    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(draft_entity_id),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("draft-only deletion should skip link check and succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 1,
            links_archived: 0,
        }
    );

    // Published B still exists
    assert!(count_entity(&api, id_b, false).await >= 1);

    // Link L→B still valid
    assert!(raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await > 0);
}

/// Verifies [`DeletionError::IncomingLinksExist`] reports the correct count.
///
/// Creates multiple distinct link entities pointing to the same target. `count_incoming_links`
/// returns `COUNT(*)` from `entity_edge` (as `i64` cast to `u64`). The `count` field in the error
/// must match the actual number of incoming `entity_edge` rows from sources outside the deletion
/// batch.
///
/// **Note**: each link L→B produces one outgoing edge (source=L, target=B). The count reflects
/// `entity_edge` rows, not link entities. Since one link produces one outgoing row targeting B,
/// 3 links should produce count=3.
#[tokio::test]
async fn incoming_link_count_is_accurate() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a1 = create_person(&mut api, alice(), false).await;
    let entity_a2 = create_person(&mut api, alice(), false).await;
    let entity_a3 = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a1 = entity_a1.metadata.record_id.entity_id;
    let id_a2 = entity_a2.metadata.record_id.entity_id;
    let id_a3 = entity_a3.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let _l1 = create_link(&mut api, id_a1, id_b).await;
    let _l2 = create_link(&mut api, id_a2, id_b).await;
    let _l3 = create_link(&mut api, id_a3, id_b).await;

    let err = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect_err("should fail with 3 incoming links");

    assert_matches!(
        err.current_context(),
        DeletionError::IncomingLinksExist { count: 3 }
    );
}

/// Handles a self-loop: entity A links to itself via link L.
///
/// L has `entity_edge` rows with `source=L, target=A` (outgoing) and `source=A, target=L`
/// (incoming/reversed). Deleting A alone with `Error`: L is outside the batch, L's outgoing edge
/// targets A → `count_incoming_links` finds it → blocked. Deleting A + L together with `Error`:
/// L is in the batch, so L's edge is excluded from the count → succeeds.
#[tokio::test]
async fn self_loop_link() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_a).await;
    let id_link = link.metadata.record_id.entity_id;

    // Purge A alone with Error → should fail (L targets A)
    let err = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect_err("purge A alone should fail with self-loop");

    assert_matches!(
        err.current_context(),
        DeletionError::IncomingLinksExist { .. }
    );

    // Purge A+L together with Error → should succeed
    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(id_link),
                ]),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge A+L together should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 2,
            draft_deletions: 0,
            links_archived: 0,
        }
    );
}

/// Handles a chain: A → B → C (via link entities L1 and L2).
///
/// L1 has `entity_edge` with `source=L1, target=B` (outgoing). L2 has `source=L2, target=C`.
/// Deleting B (middle) with `Error`: L1 is outside the batch, L1's edge to B counts → blocked.
/// Deleting B with `Ignore`: B is tombstoned, L1's `entity_edge` target → B's tombstone in
/// `entity_ids` (FK satisfied, dangling but valid reference).
#[tokio::test]
async fn chain_deletion() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let entity_c = create_person(&mut api, alice(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;
    let id_c = entity_c.metadata.record_id.entity_id;

    let l1 = create_link(&mut api, id_a, id_b).await;
    let _l2 = create_link(&mut api, id_b, id_c).await;
    let id_l1 = l1.metadata.record_id.entity_id;

    // Purge B alone with Error → fails (L1 points to B)
    let err = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect_err("purge B with Error should fail due to L1");

    assert_matches!(
        err.current_context(),
        DeletionError::IncomingLinksExist { .. }
    );

    // Purge B alone with Ignore → succeeds
    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge B with Ignore should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
            links_archived: 0,
        }
    );

    // L1's entity_edge rows still intact (pointing to tombstoned B)
    assert!(raw_count_entity_edge(&api, id_l1.web_id, id_l1.entity_uuid).await > 0);
}

/// Handles bidirectional links: A → B and B → A (two separate link entities).
///
/// L1 has `entity_edge` with `source=L1, target=B`. L2 has `source=L2, target=A`. Deleting A alone
/// with `Error`: L2 is outside the batch, L2's edge to A counts → blocked. Deleting A + B + L1 + L2
/// together with `Error`: all sources (L1, L2) are in the batch → `source NOT IN (batch)` excludes
/// both → count is 0 → succeeds.
#[tokio::test]
async fn bidirectional_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let l1 = create_link(&mut api, id_a, id_b).await;
    let l2 = create_link(&mut api, id_b, id_a).await;
    let id_l1 = l1.metadata.record_id.entity_id;
    let id_l2 = l2.metadata.record_id.entity_id;

    // Purge A alone with Error → fails (L2 targets A)
    let err = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect_err("purge A alone should fail with bidirectional links");

    assert_matches!(
        err.current_context(),
        DeletionError::IncomingLinksExist { .. }
    );

    // Purge A+B+L1+L2 together with Error → succeeds
    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(id_b),
                    Filter::for_entity_by_entity_id(id_l1),
                    Filter::for_entity_by_entity_id(id_l2),
                ]),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("batch purge of all bidirectional entities should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 4,
            draft_deletions: 0,
            links_archived: 0,
        }
    );
}

/// Erasing A+B+L together succeeds — in-batch link sources are excluded from the count.
///
/// Same setup as [`self_referential_batch_not_counted`] but with [`DeletionScope::Erase`] instead
/// of Purge. Erase always runs `count_incoming_links`; the batch-exclusion logic (`source NOT IN
/// batch`) must work here too. After erase, all three `entity_ids` rows are deleted (not
/// tombstoned) and no FK violation occurs because `delete_entity_edge` removes all edge rows
/// before `delete_entity_ids`.
#[tokio::test]
async fn erase_batch_excludes_in_batch_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(id_b),
                    Filter::for_entity_by_entity_id(id_link),
                ]),
                include_drafts: false,
                scope: DeletionScope::Erase,
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("erase batch with all entities should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 3,
            draft_deletions: 0,
            links_archived: 0,
        }
    );

    // All entity_ids rows erased (not tombstoned)
    assert!(!raw_entity_ids_exists(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(!raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
    assert!(!raw_entity_ids_exists(&api, id_link.web_id, id_link.entity_uuid).await);

    // All edge rows cleaned up
    assert_eq!(
        raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await,
        0
    );
}

/// Erasing a link entity alone succeeds — denormalized edges are not real incoming links.
///
/// `entity_edge` stores `direction = 'incoming'` rows (source=endpoint, target=L) as denormalized
/// copies for query optimization. `count_incoming_links` only counts `direction = 'outgoing'` edges
/// (real link relationships from other link entities). Since no other link entity points TO L,
/// the count is 0 and erase proceeds. `delete_entity_edge` cleans up all 4 rows (both outgoing
/// and incoming-direction) before `delete_entity_ids` removes L's row.
#[tokio::test]
async fn erase_link_entity_alone_succeeds() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // Verify 4 edges exist before erase
    assert_eq!(
        raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await,
        4
    );

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_link),
                include_drafts: false,
                scope: DeletionScope::Erase,
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("erase link entity alone should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
            links_archived: 0,
        }
    );

    // All 4 entity_edge rows cleaned up
    assert_eq!(
        raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await,
        0
    );

    // Link entity_ids row erased (not tombstoned)
    assert!(!raw_entity_ids_exists(&api, id_link.web_id, id_link.entity_uuid).await);

    // Endpoints unaffected
    assert!(raw_entity_ids_exists(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
}

// ---------------------------------------------------------------------------
// LinkDeletionBehavior::Archive
// ---------------------------------------------------------------------------

/// Purge with [`LinkDeletionBehavior::Archive`] archives incoming link entities instead of
/// rejecting or ignoring.
///
/// Creates A, B, and link entity L (A→B). Purges B with `Archive` behavior. L is outside the
/// deletion batch but has an outgoing edge `source=L, target=B` (has-right-entity). The
/// `archive_incoming_links` CTE finds L, closes its `decision_time` range (temporal archive),
/// and sets `archivedById` in provenance. B is tombstoned as usual.
#[tokio::test]
async fn purge_archive_archives_incoming_link() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // L should be live before deletion
    assert!(is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with Archive should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
            links_archived: 1,
        }
    );

    // B is tombstoned
    assert!(raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id_b.web_id, id_b.entity_uuid)
            .await
            .is_some()
    );

    // L is archived (not live, but has archivedById provenance)
    assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);
    assert!(has_archived_provenance(&api, id_link.web_id, id_link.entity_uuid).await);

    // L's entity_edge rows still exist (edges preserved for history)
    assert!(raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await > 0);

    // A is completely unaffected
    assert!(is_entity_live(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id_a.web_id, id_a.entity_uuid)
            .await
            .is_none()
    );
}

/// Archives multiple incoming link entities when several links target the deleted entity.
///
/// Creates 3 link entities (L1, L2, L3) all targeting B via separate source entities. Purging B
/// with `Archive` archives all three link entities in a single CTE execution.
#[tokio::test]
async fn purge_archive_multiple_incoming_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a1 = create_person(&mut api, alice(), false).await;
    let entity_a2 = create_person(&mut api, alice(), false).await;
    let entity_a3 = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a1 = entity_a1.metadata.record_id.entity_id;
    let id_a2 = entity_a2.metadata.record_id.entity_id;
    let id_a3 = entity_a3.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link_1 = create_link(&mut api, id_a1, id_b).await;
    let link_2 = create_link(&mut api, id_a2, id_b).await;
    let link_3 = create_link(&mut api, id_a3, id_b).await;
    let id_link_1 = link_1.metadata.record_id.entity_id;
    let id_link_2 = link_2.metadata.record_id.entity_id;
    let id_link_3 = link_3.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with Archive should succeed");

    assert_eq!(summary.full_entities, 1);

    // All three links are archived
    for id_link in [id_link_1, id_link_2, id_link_3] {
        assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);
        assert!(has_archived_provenance(&api, id_link.web_id, id_link.entity_uuid).await);
    }

    // Source entities unaffected
    for id_source in [id_a1, id_a2, id_a3] {
        assert!(is_entity_live(&api, id_source.web_id, id_source.entity_uuid).await);
    }
}

/// In-batch link entities are purged, not archived.
///
/// When A, B, and link L (A→B) are all in the deletion batch, L's source is in the batch so
/// `archive_incoming_links` excludes it (`source NOT IN batch`). L is purged directly along with
/// A and B.
#[tokio::test]
async fn purge_archive_batch_links_not_archived() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(id_b),
                    Filter::for_entity_by_entity_id(id_link),
                ]),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("batch purge with Archive should succeed");

    assert_eq!(summary.full_entities, 3);

    // L should NOT have archivedById — it was purged, not archived
    assert!(!has_archived_provenance(&api, id_link.web_id, id_link.entity_uuid).await);

    // All three are tombstoned with deletion provenance
    for id in [id_a, id_b, id_link] {
        assert!(
            get_deletion_provenance(&api, id.web_id, id.entity_uuid)
                .await
                .is_some()
        );
    }
}

/// Archive is a no-op when there are no incoming links from outside the batch.
#[tokio::test]
async fn purge_archive_no_incoming_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity = create_person(&mut api, alice(), false).await;
    let id = entity.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with Archive should succeed without incoming links");

    assert_eq!(summary.full_entities, 1);
    assert!(raw_entity_ids_exists(&api, id.web_id, id.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id.web_id, id.entity_uuid)
            .await
            .is_some()
    );
}

/// Chain deletion (A → B → C): purging B archives both link entities L1 and L2.
///
/// L1 connects A (left) → B (right): outgoing edge `source=L1, target=B` (has-right-entity).
/// L2 connects B (left) → C (right): outgoing edge `source=L2, target=B` (has-left-entity).
/// Both have outgoing edges targeting B, and neither is in the deletion batch → both archived.
#[tokio::test]
async fn purge_archive_chain() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let entity_c = create_person(&mut api, alice(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;
    let id_c = entity_c.metadata.record_id.entity_id;

    let l1 = create_link(&mut api, id_a, id_b).await;
    let l2 = create_link(&mut api, id_b, id_c).await;
    let id_l1 = l1.metadata.record_id.entity_id;
    let id_l2 = l2.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge B with Archive should succeed");

    assert_eq!(summary.full_entities, 1);

    // Both L1 and L2 archived (both have outgoing edges targeting B)
    for id_link in [id_l1, id_l2] {
        assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);
        assert!(has_archived_provenance(&api, id_link.web_id, id_link.entity_uuid).await);
    }

    // A and C are unaffected
    assert!(is_entity_live(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(is_entity_live(&api, id_c.web_id, id_c.entity_uuid).await);
}

/// Self-loop with Archive: entity A linked to itself via L. Purging A archives L.
///
/// L has outgoing edges `source=L, target=A` for both left and right endpoints. L is not in
/// the deletion batch (only A is), so `archive_incoming_links` finds and archives L. A is then
/// tombstoned. L's `entity_edge` rows remain, pointing to A's tombstone.
#[tokio::test]
async fn purge_archive_self_loop() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_a).await;
    let id_link = link.metadata.record_id.entity_id;

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge A with Archive should succeed");

    assert_eq!(summary.full_entities, 1);

    // L is archived (not purged — it's a separate entity outside the batch)
    assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);
    assert!(has_archived_provenance(&api, id_link.web_id, id_link.entity_uuid).await);

    // A is tombstoned
    assert!(raw_entity_ids_exists(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id_a.web_id, id_a.entity_uuid)
            .await
            .is_some()
    );
}

/// Archives both published and draft versions of incoming link entities.
///
/// Link targets are immutable — `entity_edge` is written once at link creation and never
/// updated. A draft of a link entity references the same endpoints as the published version.
/// Both versions must be archived because both reference the now-tombstoned target.
///
/// Creates A, B, link L (A→B), then creates a draft of L. Purges B with `Archive`. Verifies
/// that L has no live temporal metadata rows at all (neither published nor draft).
#[tokio::test]
async fn purge_archive_includes_draft_link_versions() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // Create a draft of the link entity
    let draft_link = api
        .store
        .patch_entity(
            api.account_id,
            PatchEntityParams {
                entity_id: id_link,
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
        .expect("could not create draft of link entity");

    let id_draft_link = draft_link.metadata.record_id.entity_id;
    assert!(id_draft_link.draft_id.is_some());

    // Both published and draft rows should be live before deletion
    assert!(is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);
    assert!(has_any_live_temporal_row(&api, id_link.web_id, id_link.entity_uuid).await);

    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with Archive should succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
            links_archived: 1,
        }
    );

    // Both published AND draft versions of L must be archived — no live rows left
    assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);
    assert!(!has_any_live_temporal_row(&api, id_link.web_id, id_link.entity_uuid).await);

    // Both versions should have archivedById provenance
    assert!(has_archived_provenance(&api, id_link.web_id, id_link.entity_uuid).await);

    // L's entity_edge rows remain (edges reference tombstoned B, FK satisfied)
    assert!(raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await > 0);
}

// ---------------------------------------------------------------------------
// Archive → Erase interaction
// ---------------------------------------------------------------------------

/// Erase rejects when archived incoming links exist.
///
/// Creates A→B via link L. Purges A with `Archive` → L is archived (not live). Then attempts
/// to erase B. Even though L is archived, its `entity_edge` rows still reference B. Erasing B
/// would delete its `entity_ids` row, violating those FKs. `count_incoming_link_edges(None)`
/// counts all edges regardless of temporal state, so erase correctly rejects.
#[tokio::test]
async fn erase_rejects_archived_incoming_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // Purge A with Archive → L gets archived
    api.store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge A with Archive should succeed");

    assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);
    assert!(raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await > 0);
    assert!(is_entity_live(&api, id_b.web_id, id_b.entity_uuid).await);

    // Erase B — should fail because archived L still has edges to B
    let err = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Erase,
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect_err("erase should reject because archived link still references B");

    assert_matches!(err.current_context(), DeletionError::IncomingLinksExist { count } if *count == 1);
    assert!(is_entity_live(&api, id_b.web_id, id_b.entity_uuid).await);
}

/// Purge+Error ignores archived links — only live links block deletion.
///
/// Creates A→B via link L. Archives L by purging A with `Archive`. Then purges B with `Error`
/// behavior. Since `count_incoming_link_edges(Some(timestamps))` only counts live links, and L
/// is archived, the count is 0 and purge succeeds.
#[tokio::test]
async fn purge_error_ignores_archived_links() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // Archive L by purging A
    api.store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge A with Archive should succeed");

    assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);

    // Purge B with Error — succeeds because L is archived (not live)
    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge B with Error should succeed - archived links are ignored");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 1,
            draft_deletions: 0,
            links_archived: 0,
        }
    );

    assert!(
        get_deletion_provenance(&api, id_b.web_id, id_b.entity_uuid)
            .await
            .is_some()
    );
}

// ---------------------------------------------------------------------------
// Archive CTE correctness
// ---------------------------------------------------------------------------

/// Archive CTE creates historical temporal rows with closed `decision_time`.
///
/// Before archive: L has 1 temporal row (current, open on both axes).
/// After archive: L has 2 temporal rows:
/// - Current (open `transaction_time`): `decision_time` closed at archive timestamp
/// - Historical (closed `transaction_time`): preserves the pre-archive open `decision_time`
#[tokio::test]
async fn archive_creates_historical_temporal_rows() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, entity_a.metadata.record_id.entity_id, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    let rows_before = raw_count(
        &api,
        "entity_temporal_metadata",
        id_link.web_id,
        id_link.entity_uuid,
    )
    .await;
    assert_eq!(rows_before, 1);

    api.store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with Archive should succeed");

    let rows_after = raw_count(
        &api,
        "entity_temporal_metadata",
        id_link.web_id,
        id_link.entity_uuid,
    )
    .await;
    assert_eq!(rows_after, 2, "current archived + historical row");

    let archived_rows =
        raw_count_archived_temporal_rows(&api, id_link.web_id, id_link.entity_uuid).await;
    assert_eq!(archived_rows, 1, "exactly 1 row with closed decision_time");

    assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);
    assert!(raw_entity_ids_exists(&api, id_link.web_id, id_link.entity_uuid).await);
    assert!(
        get_deletion_provenance(&api, id_link.web_id, id_link.entity_uuid)
            .await
            .is_none(),
        "archived, not deleted"
    );
}

// ---------------------------------------------------------------------------
// temporal_axes controlling entity finding
// ---------------------------------------------------------------------------

/// Broad temporal axes find archived entities that `live_only_axes` miss.
///
/// After archiving link L, `live_only_axes()` won't find it for deletion (returns 0 entities).
/// `find_all_axes()` (unbounded decision time) finds the archived entity via its temporal
/// metadata rows (which still exist, just with closed `decision_time`).
#[tokio::test]
async fn broad_temporal_axes_find_archived_entities() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, entity_a.metadata.record_id.entity_id, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // Archive L by purging B
    api.store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with Archive should succeed");

    // live_only won't find archived L
    let summary_live = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_link),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with live_only should be a noop");

    assert_eq!(summary_live.full_entities, 0);

    // find_all_axes WILL find archived L
    let summary_all = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_link),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
                temporal_axes: find_all_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge with find_all_axes should find the archived entity");

    assert_eq!(summary_all.full_entities, 1);
    assert!(
        get_deletion_provenance(&api, id_link.web_id, id_link.entity_uuid)
            .await
            .is_some()
    );
}

/// User-deletion → `resetGraph` end-to-end scenario.
///
/// The scenario that originally triggered the `entity_is_of_type` FK violation:
/// 1. Create A, B, and link L (A→B)
/// 2. "User deletion": Purge A with `Archive` → L archived, A tombstoned
/// 3. "resetGraph": Erase all with `find_all_axes()` → finds archived L and live B in one batch.
///    Since L is in the batch, erase doesn't count it as external → succeeds.
// TODO: Erase cannot find previously-purged tombstones (BE-466)
//   https://linear.app/hash/issue/BE-466
#[tokio::test]
#[ignore = "Erase cannot find previously-purged tombstones (BE-466)"]
async fn user_deletion_then_reset_graph() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a = entity_a.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link = create_link(&mut api, id_a, id_b).await;
    let id_link = link.metadata.record_id.entity_id;

    // "User deletion": purge A with Archive
    api.store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: true,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("user deletion should succeed");

    assert!(!is_entity_live(&api, id_link.web_id, id_link.entity_uuid).await);

    // "resetGraph": erase all with broad temporal axes
    let summary = api
        .store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(id_b),
                    Filter::for_entity_by_entity_id(id_link),
                ]),
                include_drafts: true,
                scope: DeletionScope::Erase,
                temporal_axes: find_all_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("resetGraph should succeed");

    // B and L found and erased (A was already tombstoned, no temporal_metadata left)
    assert!(summary.full_entities >= 2);

    // Everything gone
    assert!(!raw_entity_ids_exists(&api, id_a.web_id, id_a.entity_uuid).await);
    assert!(!raw_entity_ids_exists(&api, id_b.web_id, id_b.entity_uuid).await);
    assert!(!raw_entity_ids_exists(&api, id_link.web_id, id_link.entity_uuid).await);
    assert_eq!(
        raw_count(
            &api,
            "entity_temporal_metadata",
            id_link.web_id,
            id_link.entity_uuid
        )
        .await,
        0
    );
    assert_eq!(
        raw_count_entity_edge_any(&api, id_link.web_id, id_link.entity_uuid).await,
        0
    );
}

/// Double archive is a no-op — already-archived links don't get extra temporal rows.
///
/// L1 (A1→B) and L2 (A2→B) both target B. Purge A1 with Archive → L1 archived. Then purge A2
/// with Archive → L2 archived. L1 was already archived and should NOT get additional temporal
/// rows from the second archive CTE (its `decision_time` is already closed, so the
/// `upper_inf(decision_time)` filter excludes it).
#[tokio::test]
async fn archive_already_archived_link_is_noop() {
    let mut database = DatabaseTestWrapper::new().await;
    let mut api = seed(&mut database).await;

    let entity_a1 = create_person(&mut api, alice(), false).await;
    let entity_a2 = create_person(&mut api, alice(), false).await;
    let entity_b = create_person(&mut api, bob(), false).await;
    let id_a1 = entity_a1.metadata.record_id.entity_id;
    let id_a2 = entity_a2.metadata.record_id.entity_id;
    let id_b = entity_b.metadata.record_id.entity_id;

    let link_1 = create_link(&mut api, id_a1, id_b).await;
    let link_2 = create_link(&mut api, id_a2, id_b).await;
    let link_id_1 = link_1.metadata.record_id.entity_id;
    let link_id_2 = link_2.metadata.record_id.entity_id;

    // Purge A1 with Archive -> L1 archived
    api.store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a1),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge A1 should succeed");

    assert!(!is_entity_live(&api, link_id_1.web_id, link_id_1.entity_uuid).await);
    assert!(is_entity_live(&api, link_id_2.web_id, link_id_2.entity_uuid).await);

    let link_1_rows_after_first = raw_count(
        &api,
        "entity_temporal_metadata",
        link_id_1.web_id,
        link_id_1.entity_uuid,
    )
    .await;

    // Purge A2 with Archive -> L2 archived, L1 untouched
    api.store
        .delete_entities(
            api.account_id.into(),
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a2),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Archive,
                },
                temporal_axes: crate::live_only_axes(),
                decision_time: None,
            },
        )
        .await
        .expect("purge A2 should succeed");

    assert!(!is_entity_live(&api, link_id_2.web_id, link_id_2.entity_uuid).await);

    let link_1_rows_after_second = raw_count(
        &api,
        "entity_temporal_metadata",
        link_id_1.web_id,
        link_id_1.entity_uuid,
    )
    .await;
    assert_eq!(
        link_1_rows_after_first, link_1_rows_after_second,
        "already-archived L1 must not get additional temporal rows"
    );
}
