use alloc::borrow::Cow;
use core::{future::Future, marker::PhantomData};
use std::collections::HashSet;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::{
    action::ActionName, principal::actor::AuthenticatedActor,
};
use hash_graph_store::{
    entity::{EntityStore, HasPermissionForEntitiesParams},
    entity_type::{EntityTypeStore, HasPermissionForEntityTypesParams},
    subgraph::temporal_axes::{
        PinnedTemporalAxisUnresolved, QueryTemporalAxesUnresolved, VariableTemporalAxisUnresolved,
    },
};
use hash_graph_temporal_versioning::{
    DecisionTime, LimitedTemporalBound, TemporalBound, TemporalTagged as _, Timestamp,
    TransactionTime,
};
use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};

use super::{AuthorizedLink, LinkCandidate, LinkRejection, SnapshotError, authorize_link};
use crate::salt::{
    hash::ContentHash,
    manifest::{InputSnapshotManifest, KnowledgeDecisionTimePolicy},
    revision::AuthorizationRevision,
};

/// One bitemporal query policy pinned for every extraction and permission read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct SnapshotTemporalAxes {
    ontology_transaction_time: Timestamp<TransactionTime>,
    knowledge_transaction_time: Timestamp<TransactionTime>,
    knowledge_decision_time_policy: KnowledgeDecisionTimePolicy,
    entity_query: QueryTemporalAxesUnresolved,
    entity_type_query: QueryTemporalAxesUnresolved,
}

impl SnapshotTemporalAxes {
    /// Creates exact point-in-time permission queries from frozen input provenance.
    #[must_use]
    pub(crate) fn new(
        ontology_transaction_time: Timestamp<TransactionTime>,
        knowledge_transaction_time: Timestamp<TransactionTime>,
        knowledge_decision_time_policy: KnowledgeDecisionTimePolicy,
    ) -> Self {
        let knowledge_decision_time = match knowledge_decision_time_policy {
            KnowledgeDecisionTimePolicy::Pinned { timestamp } => timestamp,
            KnowledgeDecisionTimePolicy::LatestAtTransaction => knowledge_transaction_time.cast(),
        };
        Self {
            ontology_transaction_time,
            knowledge_transaction_time,
            knowledge_decision_time_policy,
            entity_query: point_query(knowledge_transaction_time, knowledge_decision_time),
            entity_type_query: point_query(
                ontology_transaction_time,
                ontology_transaction_time.cast(),
            ),
        }
    }

    /// Returns the exact knowledge-entity permission query.
    #[must_use]
    #[inline]
    pub(crate) const fn entity_query(&self) -> QueryTemporalAxesUnresolved {
        self.entity_query
    }

    /// Returns the exact ontology entity-type permission query.
    #[must_use]
    #[inline]
    pub(crate) const fn entity_type_query(&self) -> QueryTemporalAxesUnresolved {
        self.entity_type_query
    }

    /// Confirms that permission reads and extracted inputs name one snapshot.
    #[must_use]
    pub(crate) fn matches(&self, snapshot: &InputSnapshotManifest) -> bool {
        self.ontology_transaction_time == snapshot.ontology_transaction_time
            && self.knowledge_transaction_time == snapshot.knowledge_transaction_time
            && self.knowledge_decision_time_policy == snapshot.knowledge_decision_time_policy
    }
}

fn point_query(
    transaction_time: Timestamp<TransactionTime>,
    decision_time: Timestamp<DecisionTime>,
) -> QueryTemporalAxesUnresolved {
    QueryTemporalAxesUnresolved::DecisionTime {
        pinned: PinnedTemporalAxisUnresolved::new(Some(transaction_time)),
        variable: VariableTemporalAxisUnresolved::new(
            Some(TemporalBound::Inclusive(decision_time)),
            Some(LimitedTemporalBound::Inclusive(decision_time)),
        ),
    }
}

/// Counts fail-closed link exclusions without retaining inaccessible identity.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) struct LinkRejectionCounts {
    pub link_entity: usize,
    pub left_endpoint: usize,
    pub right_endpoint: usize,
    pub entity_type: usize,
}

impl LinkRejectionCounts {
    #[inline]
    const fn record(&mut self, rejection: LinkRejection) {
        match rejection {
            LinkRejection::LinkEntity => self.link_entity += 1,
            LinkRejection::LeftEndpoint => self.left_endpoint += 1,
            LinkRejection::RightEndpoint => self.right_endpoint += 1,
            LinkRejection::EntityType { .. } => self.entity_type += 1,
        }
    }
}

/// Permission-filtered links and aggregate exclusion evidence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AuthorizedSnapshot {
    links: Box<[AuthorizedLink]>,
    rejection_counts: LinkRejectionCounts,
    authorization_revision: AuthorizationRevision,
}

impl AuthorizedSnapshot {
    /// Borrows admitted links in candidate order.
    #[must_use]
    #[inline]
    pub(crate) fn links(&self) -> &[AuthorizedLink] {
        &self.links
    }

    /// Returns aggregate fail-closed exclusion counts.
    #[must_use]
    #[inline]
    pub(crate) const fn rejection_counts(&self) -> LinkRejectionCounts {
        self.rejection_counts
    }

    /// Returns the authorization revision observed around every permission read.
    #[must_use]
    #[inline]
    pub(crate) const fn authorization_revision(&self) -> AuthorizationRevision {
        self.authorization_revision
    }

    #[cfg(test)]
    pub(crate) fn from_authorized_links(
        links: Vec<AuthorizedLink>,
        authorization_revision: AuthorizationRevision,
    ) -> Self {
        Self {
            links: links.into_boxed_slice(),
            rejection_counts: LinkRejectionCounts::default(),
            authorization_revision,
        }
    }
}

/// Supplies a monotonic identity for the authorization state used by permission reads.
pub(crate) trait AuthorizationRevisionProvider: Sync {
    /// Reads the current authorization revision.
    ///
    /// Implementations must return a content identity that changes whenever a
    /// permission decision may change.
    fn authorization_revision(
        &self,
    ) -> impl Future<Output = Result<AuthorizationRevision, SnapshotError>> + Send;
}

/// Callback-backed adapter for a production authorization revision service.
pub(crate) struct AuthorizationRevisionProviderAdapter<Read, ReadFuture> {
    read: Read,
    _future: PhantomData<fn() -> ReadFuture>,
}

impl<Read, ReadFuture> AuthorizationRevisionProviderAdapter<Read, ReadFuture>
where
    Read: Fn() -> ReadFuture,
{
    /// Binds one asynchronous revision callback.
    #[must_use]
    pub(crate) const fn new(read: Read) -> Self {
        Self {
            read,
            _future: PhantomData,
        }
    }
}

impl<Read, ReadFuture> AuthorizationRevisionProvider
    for AuthorizationRevisionProviderAdapter<Read, ReadFuture>
where
    Read: Fn() -> ReadFuture + Sync,
    ReadFuture: Future<Output = Result<AuthorizationRevision, SnapshotError>> + Send,
{
    fn authorization_revision(
        &self,
    ) -> impl Future<Output = Result<AuthorizationRevision, SnapshotError>> + Send {
        (self.read)()
    }
}

/// Batches existing entity and entity-type permission APIs over link inputs.
///
/// Entity authorization is pinned to `temporal_axes` and checks the exact
/// edition selected by extraction. The result never retains inaccessible graph
/// identities: excluded candidates contribute only to aggregate reason counts.
///
/// # Errors
///
/// This returns an error when either permission store query fails or when the
/// authorization revision changes around those queries.
pub(crate) async fn authorize_snapshot<Store, Revisions>(
    store: &Store,
    revisions: &Revisions,
    actor: AuthenticatedActor,
    temporal_axes: &SnapshotTemporalAxes,
    candidates: &[LinkCandidate],
) -> Result<AuthorizedSnapshot, Report<SnapshotError>>
where
    Store: EntityStore + EntityTypeStore + Sync,
    Revisions: AuthorizationRevisionProvider,
{
    let before = revisions
        .authorization_revision()
        .await
        .map_err(Report::new)?;
    validate_revision(before)?;
    if candidates.is_empty() {
        return Ok(AuthorizedSnapshot {
            links: Box::new([]),
            rejection_counts: LinkRejectionCounts::default(),
            authorization_revision: before,
        });
    }

    let (entity_ids, entity_type_ids) = permission_inputs(candidates);
    let entity_permissions = store
        .has_permission_for_entities(
            actor,
            HasPermissionForEntitiesParams {
                action: ActionName::ViewEntity,
                entity_ids: Cow::Borrowed(&entity_ids),
                temporal_axes: temporal_axes.entity_query(),
                include_drafts: false,
            },
        )
        .await
        .change_context(SnapshotError::EntityPermission)?;
    let entity_type_permissions = store
        .has_permission_for_entity_types(
            actor,
            HasPermissionForEntityTypesParams {
                action: ActionName::ViewEntityType,
                entity_type_ids: Cow::Borrowed(&entity_type_ids),
                temporal_axes: temporal_axes.entity_type_query(),
            },
        )
        .await
        .change_context(SnapshotError::EntityTypePermission)?;
    let after = revisions
        .authorization_revision()
        .await
        .map_err(Report::new)?;
    ensure_unchanged(before, after)?;

    let mut links = Vec::with_capacity(candidates.len());
    let mut rejection_counts = LinkRejectionCounts::default();
    for candidate in candidates.iter().cloned() {
        match authorize_link(candidate, &entity_permissions, &entity_type_permissions) {
            Ok(link) => links.push(link),
            Err(rejection) => rejection_counts.record(rejection),
        }
    }
    Ok(AuthorizedSnapshot {
        links: links.into_boxed_slice(),
        rejection_counts,
        authorization_revision: before,
    })
}

fn ensure_unchanged(
    before: AuthorizationRevision,
    after: AuthorizationRevision,
) -> Result<(), Report<SnapshotError>> {
    validate_revision(before)?;
    validate_revision(after)?;
    if before == after {
        Ok(())
    } else {
        Err(Report::new(SnapshotError::AuthorizationRevisionChanged {
            before,
            after,
        }))
    }
}

fn validate_revision(revision: AuthorizationRevision) -> Result<(), Report<SnapshotError>> {
    if revision.content_hash() == ContentHash::from_bytes([0; 32]) {
        Err(Report::new(SnapshotError::AuthorizationRevision))
    } else {
        Ok(())
    }
}

fn permission_inputs(candidates: &[LinkCandidate]) -> (Vec<EntityId>, Vec<VersionedUrl>) {
    let mut entity_ids = Vec::with_capacity(candidates.len().saturating_mul(3));
    let mut seen_entities = HashSet::with_capacity(entity_ids.capacity());
    let required_type_count = candidates
        .iter()
        .map(|candidate| candidate.required_entity_types.len())
        .sum();
    let mut entity_type_ids = Vec::with_capacity(required_type_count);
    let mut seen_entity_types = HashSet::with_capacity(required_type_count);

    for candidate in candidates {
        for entity in [candidate.link, candidate.left, candidate.right] {
            if seen_entities.insert(entity.entity_id) {
                entity_ids.push(entity.entity_id);
            }
        }
        for entity_type in &candidate.required_entity_types {
            if seen_entity_types.insert(entity_type.clone()) {
                entity_type_ids.push(entity_type.clone());
            }
        }
    }
    (entity_ids, entity_type_ids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn changing_authorization_revision_fails_closed() {
        let before = AuthorizationRevision::new(ContentHash::digest(b"before"));
        let after = AuthorizationRevision::new(ContentHash::digest(b"after"));

        assert!(matches!(
            ensure_unchanged(before, after)
                .expect_err("revision drift must reject the snapshot")
                .current_context(),
            SnapshotError::AuthorizationRevisionChanged {
                before: actual_before,
                after: actual_after,
            } if *actual_before == before && *actual_after == after
        ));
    }

    #[test]
    fn zero_authorization_revision_fails_closed() {
        let zero = AuthorizationRevision::new(ContentHash::from_bytes([0; 32]));

        assert_eq!(
            validate_revision(zero)
                .expect_err("an unspecified revision must be rejected")
                .current_context(),
            &SnapshotError::AuthorizationRevision
        );
    }

    #[tokio::test]
    async fn callback_revision_adapter_supplies_a_verified_revision() {
        let expected = AuthorizationRevision::new(ContentHash::digest(b"adapter-revision"));
        let adapter =
            AuthorizationRevisionProviderAdapter::new(move || core::future::ready(Ok(expected)));

        assert_eq!(
            adapter
                .authorization_revision()
                .await
                .expect("adapter callback should succeed"),
            expected
        );
    }

    #[test]
    fn temporal_axes_bind_permission_queries_to_input_provenance() {
        let ontology = Timestamp::<TransactionTime>::from_unix_timestamp(10);
        let knowledge = Timestamp::<TransactionTime>::from_unix_timestamp(20);
        let decision = Timestamp::<DecisionTime>::from_unix_timestamp(15);
        let policy = KnowledgeDecisionTimePolicy::Pinned {
            timestamp: decision,
        };
        let axes = SnapshotTemporalAxes::new(ontology, knowledge, policy);
        let mut snapshot = InputSnapshotManifest {
            ontology_transaction_time: ontology,
            knowledge_transaction_time: knowledge,
            knowledge_decision_time_policy: policy,
            ontology_hash: ContentHash::digest(b"ontology"),
            knowledge_hash: ContentHash::digest(b"knowledge"),
            authorization_revision: AuthorizationRevision::new(ContentHash::digest(b"revision")),
            frozen_input_hash: ContentHash::digest(b"frozen-input"),
        };

        assert!(axes.matches(&snapshot));
        snapshot.knowledge_transaction_time = Timestamp::<TransactionTime>::from_unix_timestamp(21);
        assert!(!axes.matches(&snapshot));
    }
}
