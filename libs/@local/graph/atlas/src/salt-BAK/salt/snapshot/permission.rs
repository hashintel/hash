use alloc::borrow::Cow;
use core::{future::Future, marker::PhantomData};
use std::collections::{HashMap, HashSet};

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

use super::{
    AuthorizedLink, EntityAtEdition, LinkCandidate, LinkRejection, SnapshotError, authorize_link,
};
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
    store_snapshot_identity: ContentHash,
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
        store_snapshot_identity: ContentHash,
    ) -> Self {
        let knowledge_decision_time = match knowledge_decision_time_policy {
            KnowledgeDecisionTimePolicy::Pinned { timestamp } => timestamp,
            KnowledgeDecisionTimePolicy::LatestAtTransaction => knowledge_transaction_time.cast(),
        };
        Self {
            ontology_transaction_time,
            knowledge_transaction_time,
            knowledge_decision_time_policy,
            store_snapshot_identity,
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

    /// Returns the store-issued repeatable-read transaction identity.
    #[must_use]
    #[inline]
    pub(crate) const fn store_snapshot_identity(&self) -> ContentHash {
        self.store_snapshot_identity
    }

    /// Confirms that permission reads and extracted inputs name one snapshot.
    #[must_use]
    pub(crate) fn matches(&self, snapshot: &InputSnapshotManifest) -> bool {
        self.ontology_transaction_time == snapshot.ontology_transaction_time
            && self.knowledge_transaction_time == snapshot.knowledge_transaction_time
            && self.knowledge_decision_time_policy == snapshot.knowledge_decision_time_policy
            && self.store_snapshot_identity == snapshot.store_snapshot_identity
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

/// Coordinates activation with the authorization revision linearization point.
///
/// Implementations must atomically confirm that `expected` is current and
/// prevent every permission-relevant revision change until the returned lease
/// is dropped. A read-then-return implementation does not satisfy this
/// contract: the lease must be backed by an authorization-owned lock,
/// transaction, or equivalent compare-and-swap protocol.
pub(crate) trait AuthorizationActivationLeaseProvider: Sync {
    /// Owned capability that keeps the authorization revision stable.
    type ActivationLease: Send;

    /// Acquires a lease over the expected authorization revision.
    fn acquire_activation_lease(
        &self,
        expected: AuthorizationRevision,
    ) -> impl Future<Output = Result<Self::ActivationLease, SnapshotError>> + Send;
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

/// Callback-backed provider that can also lease the activation interval.
///
/// The acquisition callback must delegate to an authorization service that
/// owns permission revisions; returning an uncoordinated marker would violate
/// [`AuthorizationActivationLeaseProvider`]'s contract.
pub(crate) struct CoordinatedAuthorizationProviderAdapter<
    Read,
    ReadFuture,
    Acquire,
    AcquireFuture,
    Lease,
> {
    read: Read,
    acquire: Acquire,
    _read_future: PhantomData<fn() -> ReadFuture>,
    _acquire_future: PhantomData<fn() -> AcquireFuture>,
    _lease: PhantomData<fn() -> Lease>,
}

impl<Read, ReadFuture, Acquire, AcquireFuture, Lease>
    CoordinatedAuthorizationProviderAdapter<Read, ReadFuture, Acquire, AcquireFuture, Lease>
{
    /// Binds revision reads and atomic activation-lease acquisition.
    #[must_use]
    pub(crate) const fn new(read: Read, acquire: Acquire) -> Self {
        Self {
            read,
            acquire,
            _read_future: PhantomData,
            _acquire_future: PhantomData,
            _lease: PhantomData,
        }
    }
}

impl<Read, ReadFuture, Acquire, AcquireFuture, Lease> AuthorizationRevisionProvider
    for CoordinatedAuthorizationProviderAdapter<Read, ReadFuture, Acquire, AcquireFuture, Lease>
where
    Read: Fn() -> ReadFuture + Sync,
    ReadFuture: Future<Output = Result<AuthorizationRevision, SnapshotError>> + Send,
    Acquire: Sync,
    AcquireFuture: Send,
    Lease: Send,
{
    fn authorization_revision(
        &self,
    ) -> impl Future<Output = Result<AuthorizationRevision, SnapshotError>> + Send {
        (self.read)()
    }
}

impl<Read, ReadFuture, Acquire, AcquireFuture, Lease> AuthorizationActivationLeaseProvider
    for CoordinatedAuthorizationProviderAdapter<Read, ReadFuture, Acquire, AcquireFuture, Lease>
where
    Read: Sync,
    ReadFuture: Send,
    Acquire: Fn(AuthorizationRevision) -> AcquireFuture + Sync,
    AcquireFuture: Future<Output = Result<Lease, SnapshotError>> + Send,
    Lease: Send,
{
    type ActivationLease = Lease;

    fn acquire_activation_lease(
        &self,
        expected: AuthorizationRevision,
    ) -> impl Future<Output = Result<Self::ActivationLease, SnapshotError>> + Send {
        (self.acquire)(expected)
    }
}

/// Batches existing entity and entity-type permission APIs over link inputs.
///
/// Entity authorization is pinned to `temporal_axes` and checks the exact
/// edition selected by extraction. Every representation-row edition is
/// mandatory; inaccessible link candidates are omitted and represented only by
/// aggregate reason counts.
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
    representation_editions: &[EntityAtEdition],
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
    let (entity_ids, entity_type_ids) = permission_inputs(representation_editions, candidates);
    let entity_permissions = if entity_ids.is_empty() {
        HashMap::new()
    } else {
        store
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
            .change_context(SnapshotError::EntityPermission)?
    };
    let entity_type_permissions = if entity_type_ids.is_empty() {
        HashSet::new()
    } else {
        store
            .has_permission_for_entity_types(
                actor,
                HasPermissionForEntityTypesParams {
                    action: ActionName::ViewEntityType,
                    entity_type_ids: Cow::Borrowed(&entity_type_ids),
                    temporal_axes: temporal_axes.entity_type_query(),
                },
            )
            .await
            .change_context(SnapshotError::EntityTypePermission)?
    };
    let after = revisions
        .authorization_revision()
        .await
        .map_err(Report::new)?;
    ensure_unchanged(before, after)?;

    ensure_corpus_visible(representation_editions, &entity_permissions)?;
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

fn permission_inputs(
    representation_editions: &[EntityAtEdition],
    candidates: &[LinkCandidate],
) -> (Vec<EntityId>, Vec<VersionedUrl>) {
    let mut entity_ids = Vec::with_capacity(
        candidates
            .len()
            .saturating_mul(3)
            .saturating_add(representation_editions.len()),
    );
    let mut seen_entities = HashSet::with_capacity(entity_ids.capacity());
    let required_type_count = candidates
        .iter()
        .map(|candidate| candidate.required_entity_types.len())
        .fold(0_usize, usize::saturating_add);
    let mut entity_type_ids = Vec::with_capacity(required_type_count);
    let mut seen_entity_types = HashSet::with_capacity(required_type_count);

    for selected in representation_editions {
        if seen_entities.insert(selected.entity_id) {
            entity_ids.push(selected.entity_id);
        }
    }
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

#[inline]
fn edition_is_visible(
    entity: EntityAtEdition,
    permitted: &HashMap<EntityId, Vec<type_system::knowledge::entity::id::EntityEditionId>>,
) -> bool {
    permitted
        .get(&entity.entity_id)
        .is_some_and(|editions| editions.contains(&entity.edition_id))
}

fn ensure_corpus_visible(
    selected_editions: &[EntityAtEdition],
    permitted: &HashMap<EntityId, Vec<type_system::knowledge::entity::id::EntityEditionId>>,
) -> Result<(), Report<SnapshotError>> {
    for (row, selected) in selected_editions.iter().enumerate() {
        if !edition_is_visible(*selected, permitted) {
            return Err(Report::new(SnapshotError::CorpusPermission { row }));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use type_system::{
        knowledge::entity::id::{EntityEditionId, EntityUuid},
        principal::actor_group::WebId,
    };
    use uuid::Uuid;

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

    #[test]
    fn every_representation_row_requires_its_exact_selected_edition() {
        let selected = EntityAtEdition {
            entity_id: EntityId {
                web_id: WebId::new(Uuid::from_u128(1)),
                entity_uuid: EntityUuid::new(Uuid::from_u128(2)),
                draft_id: None,
            },
            edition_id: EntityEditionId::new(Uuid::from_u128(3)),
        };
        let wrong_edition = EntityEditionId::new(Uuid::from_u128(4));
        let permitted = HashMap::from([(selected.entity_id, vec![wrong_edition])]);

        assert!(matches!(
            ensure_corpus_visible(&[selected], &permitted)
                .expect_err("a different visible edition must not authorize the corpus row")
                .current_context(),
            SnapshotError::CorpusPermission { row: 0 }
        ));
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

    #[tokio::test]
    async fn coordinated_adapter_returns_an_authority_owned_activation_lease() {
        struct TestAuthorityLease(std::sync::Arc<std::sync::atomic::AtomicBool>);
        impl Drop for TestAuthorityLease {
            fn drop(&mut self) {
                self.0.store(false, std::sync::atomic::Ordering::Release);
            }
        }

        let expected = AuthorizationRevision::new(ContentHash::digest(b"coordinated-revision"));
        let leased = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let acquire_leased = std::sync::Arc::clone(&leased);
        let adapter = CoordinatedAuthorizationProviderAdapter::new(
            move || core::future::ready(Ok(expected)),
            move |requested| {
                let acquired = requested == expected
                    && acquire_leased
                        .compare_exchange(
                            false,
                            true,
                            std::sync::atomic::Ordering::Acquire,
                            std::sync::atomic::Ordering::Relaxed,
                        )
                        .is_ok();
                core::future::ready(if acquired {
                    Ok(TestAuthorityLease(std::sync::Arc::clone(&acquire_leased)))
                } else {
                    Err(SnapshotError::AuthorizationRevision)
                })
            },
        );

        let observed = adapter
            .authorization_revision()
            .await
            .expect("revision should be observable");
        let lease = adapter
            .acquire_activation_lease(observed)
            .await
            .expect("authority should lease the observed revision");
        assert!(leased.load(std::sync::atomic::Ordering::Acquire));
        drop(lease);
        assert!(!leased.load(std::sync::atomic::Ordering::Acquire));
    }

    #[test]
    fn temporal_axes_bind_permission_queries_to_input_provenance() {
        let ontology = Timestamp::<TransactionTime>::from_unix_timestamp(10);
        let knowledge = Timestamp::<TransactionTime>::from_unix_timestamp(20);
        let decision = Timestamp::<DecisionTime>::from_unix_timestamp(15);
        let policy = KnowledgeDecisionTimePolicy::Pinned {
            timestamp: decision,
        };
        let store_snapshot = ContentHash::digest(b"store-snapshot");
        let axes = SnapshotTemporalAxes::new(ontology, knowledge, policy, store_snapshot);
        let mut snapshot = InputSnapshotManifest {
            ontology_transaction_time: ontology,
            knowledge_transaction_time: knowledge,
            knowledge_decision_time_policy: policy,
            ontology_hash: ContentHash::digest(b"ontology"),
            knowledge_hash: ContentHash::digest(b"knowledge"),
            store_snapshot_identity: store_snapshot,
            authorization_revision: AuthorizationRevision::new(ContentHash::digest(b"revision")),
            extraction_receipt_hash: ContentHash::digest(b"extraction-receipt"),
            frozen_input_hash: ContentHash::digest(b"frozen-input"),
        };

        assert!(axes.matches(&snapshot));
        snapshot.store_snapshot_identity = ContentHash::digest(b"different-store-snapshot");
        assert!(!axes.matches(&snapshot));
        snapshot.store_snapshot_identity = store_snapshot;
        snapshot.knowledge_transaction_time = Timestamp::<TransactionTime>::from_unix_timestamp(21);
        assert!(!axes.matches(&snapshot));
    }
}
