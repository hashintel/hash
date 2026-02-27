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
    DatabaseTestWrapper, alice, bob, count_entity, create_link, create_person,
    get_deletion_provenance, provenance, raw_count_entity_edge, raw_count_entity_edge_any,
    raw_entity_ids_exists, seed,
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Erase,
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_link),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
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
            api.account_id,
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
        .expect("draft-only deletion should skip link check and succeed");

    assert_eq!(
        summary,
        DeletionSummary {
            full_entities: 0,
            draft_deletions: 1,
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(id_link),
                ]),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_b),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Ignore,
                },
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_a),
                include_drafts: false,
                scope: DeletionScope::Purge {
                    link_behavior: LinkDeletionBehavior::Error,
                },
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
            api.account_id,
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::Any(vec![
                    Filter::for_entity_by_entity_id(id_a),
                    Filter::for_entity_by_entity_id(id_b),
                    Filter::for_entity_by_entity_id(id_link),
                ]),
                include_drafts: false,
                scope: DeletionScope::Erase,
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
            api.account_id,
            DeleteEntitiesParams {
                filter: Filter::for_entity_by_entity_id(id_link),
                include_drafts: false,
                scope: DeletionScope::Erase,
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
