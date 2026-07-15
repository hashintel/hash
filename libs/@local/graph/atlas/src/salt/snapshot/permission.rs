use std::{borrow::Cow, collections::HashSet};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::{
    action::ActionName, principal::actor::AuthenticatedActor,
};
use hash_graph_store::{
    entity::{EntityStore, HasPermissionForEntitiesParams},
    entity_type::{EntityTypeStore, HasPermissionForEntityTypesParams},
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_temporal_versioning::Timestamp;
use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};

use super::{AuthorizedLink, LinkCandidate, LinkRejection, SnapshotError, authorize_link};

/// One bitemporal query policy pinned for every extraction and permission read.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SnapshotTemporalAxes(QueryTemporalAxesUnresolved);

impl SnapshotTemporalAxes {
    /// Resolves every omitted bound against one shared timestamp.
    #[must_use]
    pub(crate) fn new(axes: QueryTemporalAxesUnresolved) -> Self {
        Self(axes.pin_with(Timestamp::now()))
    }

    /// Returns the pinned query policy for one store call.
    #[must_use]
    #[inline]
    pub(crate) const fn query(self) -> QueryTemporalAxesUnresolved {
        self.0
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
    fn record(&mut self, rejection: LinkRejection) {
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

    #[cfg(test)]
    pub(crate) fn from_authorized_links(links: Vec<AuthorizedLink>) -> Self {
        Self {
            links: links.into_boxed_slice(),
            rejection_counts: LinkRejectionCounts::default(),
        }
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
/// This returns an error when either permission store query fails.
pub(crate) async fn authorize_snapshot<Store>(
    store: &Store,
    actor: AuthenticatedActor,
    temporal_axes: SnapshotTemporalAxes,
    candidates: &[LinkCandidate],
) -> Result<AuthorizedSnapshot, Report<SnapshotError>>
where
    Store: EntityStore + EntityTypeStore + Sync,
{
    if candidates.is_empty() {
        return Ok(AuthorizedSnapshot {
            links: Box::new([]),
            rejection_counts: LinkRejectionCounts::default(),
        });
    }

    let temporal_axes = temporal_axes.query();
    let (entity_ids, entity_type_ids) = permission_inputs(candidates);
    let entity_permissions = store
        .has_permission_for_entities(
            actor,
            HasPermissionForEntitiesParams {
                action: ActionName::ViewEntity,
                entity_ids: Cow::Borrowed(&entity_ids),
                temporal_axes,
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
                temporal_axes,
            },
        )
        .await
        .change_context(SnapshotError::EntityTypePermission)?;

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
    })
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
