//! Pure link visibility admission.

use std::collections::{HashMap, HashSet};

use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityId},
    ontology::VersionedUrl,
};

/// One entity identity pinned to the edition selected by the data snapshot.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct EntityAtEdition {
    pub entity_id: EntityId,
    pub edition_id: EntityEditionId,
}

/// Link topology and metadata required by downstream relation processing.
#[derive(Debug, Clone, PartialEq, Eq)]
#[expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "sibling snapshot stages share immutable candidate internals within this boundary"
)]
pub(crate) struct LinkCandidate {
    pub(super) link: EntityAtEdition,
    pub(super) left: EntityAtEdition,
    pub(super) right: EntityAtEdition,
    pub(super) relation_type: VersionedUrl,
    pub(super) required_entity_types: Box<[VersionedUrl]>,
}

impl LinkCandidate {
    /// Freezes one extracted link and its store-resolved type closure.
    ///
    /// `required_entity_types` must come from the same extraction snapshot as
    /// the selected entity editions. Authorization verifies every member before
    /// the link can enter an [`AuthorizedSnapshot`](super::AuthorizedSnapshot).
    #[must_use]
    pub(crate) const fn new(
        link: EntityAtEdition,
        left: EntityAtEdition,
        right: EntityAtEdition,
        relation_type: VersionedUrl,
        required_entity_types: Box<[VersionedUrl]>,
    ) -> Self {
        Self {
            link,
            left,
            right,
            relation_type,
            required_entity_types,
        }
    }

    #[cfg(test)]
    #[must_use]
    pub(crate) fn for_test(
        link: EntityAtEdition,
        left: EntityAtEdition,
        right: EntityAtEdition,
        relation_type: &VersionedUrl,
        required_entity_types: &[VersionedUrl],
    ) -> Self {
        Self::new(
            link,
            left,
            right,
            relation_type.clone(),
            required_entity_types.into(),
        )
    }
}

/// A link candidate proven visible under one permission result set.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AuthorizedLink(LinkCandidate);

impl AuthorizedLink {
    /// Returns the admitted candidate.
    #[must_use]
    #[inline]
    pub(crate) const fn candidate(&self) -> &LinkCandidate {
        &self.0
    }
}

/// First missing permission required to admit a link.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum LinkRejection {
    LinkEntity,
    LeftEndpoint,
    RightEndpoint,
    EntityType { index: usize },
}

/// Applies fail-closed visibility checks to one link candidate.
///
/// `permitted_entities` is the direct output shape of
/// `EntityStore::has_permission_for_entities`; selected editions must match,
/// not merely entity identities. `permitted_entity_types` is the output shape
/// of `EntityTypeStore::has_permission_for_entity_types`.
pub(crate) fn authorize_link(
    candidate: LinkCandidate,
    permitted_entities: &HashMap<EntityId, Vec<EntityEditionId>>,
    permitted_entity_types: &HashSet<VersionedUrl>,
) -> Result<AuthorizedLink, LinkRejection> {
    if !edition_is_visible(candidate.link, permitted_entities) {
        return Err(LinkRejection::LinkEntity);
    }
    if !edition_is_visible(candidate.left, permitted_entities) {
        return Err(LinkRejection::LeftEndpoint);
    }
    if !edition_is_visible(candidate.right, permitted_entities) {
        return Err(LinkRejection::RightEndpoint);
    }
    if let Some(index) = candidate
        .required_entity_types
        .iter()
        .position(|entity_type| !permitted_entity_types.contains(entity_type))
    {
        return Err(LinkRejection::EntityType { index });
    }
    Ok(AuthorizedLink(candidate))
}

#[inline]
fn edition_is_visible(
    entity: EntityAtEdition,
    permitted: &HashMap<EntityId, Vec<EntityEditionId>>,
) -> bool {
    permitted
        .get(&entity.entity_id)
        .is_some_and(|editions| editions.contains(&entity.edition_id))
}
