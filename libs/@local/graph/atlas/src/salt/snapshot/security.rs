use std::collections::HashSet;

use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};
use uuid::Uuid;

use super::{AuthorizedLink, AuthorizedSnapshot};
use crate::salt::{
    hash::{ContentHash, ContentHasher},
    manifest::RelationSecurityMode,
};

/// Frozen type and instance admission for relation-driven coordinates.
///
/// Type admission and instance admission remain separate. The type set records
/// the result of deny overrides and the safety ladder. Instance sets record the
/// generation audience's public and atlas-safe predicates. Their content hashes
/// are derived here, so the manifest can bind the exact policy and resulting
/// edge snapshot rather than a caller-provided label.
#[derive(Debug, Clone)]
pub(crate) struct RelationSecurityPolicy {
    mode: RelationSecurityMode,
    admitted_types: HashSet<VersionedUrl>,
    denied_types: HashSet<VersionedUrl>,
    public_entities: HashSet<EntityId>,
    public_links: HashSet<EntityId>,
    safe_links: HashSet<EntityId>,
    allow_list_hash: ContentHash,
}

impl RelationSecurityPolicy {
    /// Freezes one generation-wide relation security decision.
    ///
    /// Under `atlas-safe-links`, deny overrides win and a link must have an
    /// admitted type and satisfy the instance safety predicate. Under
    /// `public-links-only`, only the exact public-instance predicate applies.
    /// `all-snapshot-links` retains every visibility-authorized snapshot link.
    #[must_use]
    pub(super) fn new(
        mode: RelationSecurityMode,
        admitted_types: HashSet<VersionedUrl>,
        denied_types: HashSet<VersionedUrl>,
        public_entities: HashSet<EntityId>,
        public_links: HashSet<EntityId>,
        safe_links: HashSet<EntityId>,
    ) -> Self {
        let allow_list_hash = type_policy_hash(&admitted_types, &denied_types);
        Self {
            mode,
            admitted_types,
            denied_types,
            public_entities,
            public_links,
            safe_links,
            allow_list_hash,
        }
    }

    #[cfg(test)]
    #[must_use]
    pub(crate) fn for_test(
        mode: RelationSecurityMode,
        admitted_types: HashSet<VersionedUrl>,
        denied_types: HashSet<VersionedUrl>,
        public_entities: HashSet<EntityId>,
        public_links: HashSet<EntityId>,
        safe_links: HashSet<EntityId>,
    ) -> Self {
        Self::new(
            mode,
            admitted_types,
            denied_types,
            public_entities,
            public_links,
            safe_links,
        )
    }

    /// Returns the selected coordinate-influence mode.
    #[must_use]
    #[inline]
    pub(crate) const fn mode(&self) -> RelationSecurityMode {
        self.mode
    }

    /// Returns the canonical deny and type-admission identity.
    #[must_use]
    #[inline]
    pub(crate) const fn allow_list_hash(&self) -> ContentHash {
        self.allow_list_hash
    }

    #[inline]
    fn admits(&self, link: &AuthorizedLink) -> bool {
        let candidate = link.candidate();
        match self.mode {
            RelationSecurityMode::PublicLinksOnly => {
                self.public_links.contains(&candidate.link.entity_id)
                    && self.public_entities.contains(&candidate.left.entity_id)
                    && self.public_entities.contains(&candidate.right.entity_id)
            }
            RelationSecurityMode::AtlasSafeLinks => {
                !self.denied_types.contains(&candidate.relation_type)
                    && self.admitted_types.contains(&candidate.relation_type)
                    && self.safe_links.contains(&candidate.link.entity_id)
            }
            RelationSecurityMode::AllSnapshotLinks => true,
        }
    }
}

/// A link permitted to influence one generation's coordinates.
#[derive(Debug, Clone)]
pub(crate) struct GeometryAuthorizedLink {
    link: AuthorizedLink,
}

impl GeometryAuthorizedLink {
    #[must_use]
    #[inline]
    pub(super) const fn candidate(&self) -> &super::LinkCandidate {
        self.link.candidate()
    }

    #[must_use]
    #[inline]
    pub(crate) const fn link_entity(&self) -> EntityId {
        self.link.candidate().link.entity_id
    }

    #[must_use]
    #[inline]
    pub(crate) const fn left_entity(&self) -> EntityId {
        self.link.candidate().left.entity_id
    }

    #[must_use]
    #[inline]
    pub(crate) const fn right_entity(&self) -> EntityId {
        self.link.candidate().right.entity_id
    }

    #[must_use]
    #[inline]
    pub(crate) const fn relation_type(&self) -> &VersionedUrl {
        &self.link.candidate().relation_type
    }
}

/// Security-filtered relation instances and their canonical identity.
#[derive(Debug, Clone)]
pub(crate) struct GeometrySnapshot {
    mode: RelationSecurityMode,
    allow_list_hash: ContentHash,
    links: Vec<GeometryAuthorizedLink>,
    content_hash: ContentHash,
}

impl GeometrySnapshot {
    /// Borrows coordinate-influencing links in frozen snapshot order.
    #[must_use]
    #[inline]
    pub(crate) fn links(&self) -> &[GeometryAuthorizedLink] {
        &self.links
    }

    /// Returns the identity of the mode, policy, and admitted instances.
    #[must_use]
    #[inline]
    pub(crate) const fn content_hash(&self) -> ContentHash {
        self.content_hash
    }

    /// Returns the enforced coordinate-influence mode.
    #[must_use]
    #[inline]
    pub(crate) const fn mode(&self) -> RelationSecurityMode {
        self.mode
    }

    /// Returns the internally derived type-policy identity.
    #[must_use]
    #[inline]
    pub(crate) const fn allow_list_hash(&self) -> ContentHash {
        self.allow_list_hash
    }
}

/// Applies the frozen relation security policy to an authorized snapshot.
#[must_use]
pub(crate) fn authorize_relation_geometry(
    snapshot: &AuthorizedSnapshot,
    policy: &RelationSecurityPolicy,
) -> GeometrySnapshot {
    authorize_relation_links(snapshot.links(), policy)
}

fn authorize_relation_links(
    candidates: &[AuthorizedLink],
    policy: &RelationSecurityPolicy,
) -> GeometrySnapshot {
    let mut links = candidates
        .iter()
        .filter(|link| policy.admits(link))
        .cloned()
        .map(|link| GeometryAuthorizedLink { link })
        .collect::<Vec<_>>();
    links.sort_unstable_by(|left, right| {
        let left = left.candidate();
        let right = right.candidate();
        entity_key(left.link.entity_id)
            .cmp(&entity_key(right.link.entity_id))
            .then_with(|| {
                left.link
                    .edition_id
                    .as_uuid()
                    .cmp(right.link.edition_id.as_uuid())
            })
            .then_with(|| entity_key(left.left.entity_id).cmp(&entity_key(right.left.entity_id)))
            .then_with(|| {
                left.left
                    .edition_id
                    .as_uuid()
                    .cmp(right.left.edition_id.as_uuid())
            })
            .then_with(|| entity_key(left.right.entity_id).cmp(&entity_key(right.right.entity_id)))
            .then_with(|| {
                left.right
                    .edition_id
                    .as_uuid()
                    .cmp(right.right.edition_id.as_uuid())
            })
            .then_with(|| left.relation_type.cmp(&right.relation_type))
    });
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.geometry-snapshot.v1");
    hasher.update(&[security_mode_discriminant(policy.mode)]);
    hasher.update(policy.allow_list_hash.as_bytes());
    for link in &links {
        let candidate = link.candidate();
        hash_entity(&mut hasher, candidate.link.entity_id);
        hash_entity(&mut hasher, candidate.left.entity_id);
        hash_entity(&mut hasher, candidate.right.entity_id);
        hasher.update(candidate.relation_type.to_string().as_bytes());
        hasher.update(candidate.link.edition_id.as_uuid().as_bytes());
        hasher.update(candidate.left.edition_id.as_uuid().as_bytes());
        hasher.update(candidate.right.edition_id.as_uuid().as_bytes());
    }
    GeometrySnapshot {
        mode: policy.mode,
        allow_list_hash: policy.allow_list_hash,
        links,
        content_hash: hasher.finish(),
    }
}

#[cfg(test)]
pub(super) fn authorize_relation_links_for_test(
    links: &[AuthorizedLink],
    policy: &RelationSecurityPolicy,
) -> GeometrySnapshot {
    authorize_relation_links(links, policy)
}

fn type_policy_hash(
    admitted_types: &HashSet<VersionedUrl>,
    denied_types: &HashSet<VersionedUrl>,
) -> ContentHash {
    let mut admitted = admitted_types
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    let mut denied = denied_types
        .iter()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    admitted.sort_unstable();
    denied.sort_unstable();
    let mut hasher = ContentHasher::new(b"hash.graph.atlas.salt.relation-security-types.v1");
    for relation_type in admitted {
        hasher.update(&[1]);
        hasher.update(relation_type.as_bytes());
    }
    for relation_type in denied {
        hasher.update(&[0]);
        hasher.update(relation_type.as_bytes());
    }
    hasher.finish()
}

#[inline]
fn hash_entity(hasher: &mut ContentHasher, entity: EntityId) {
    hasher.update(&entity_key(entity));
}

fn entity_key(entity: EntityId) -> [u8; 49] {
    let mut key = [0_u8; 49];
    let web_id: Uuid = entity.web_id.into();
    let entity_uuid: Uuid = entity.entity_uuid.into();
    key[..16].copy_from_slice(web_id.as_bytes());
    key[16..32].copy_from_slice(entity_uuid.as_bytes());
    if let Some(draft_id) = entity.draft_id {
        let draft_id: Uuid = draft_id.into();
        key[32] = 1;
        key[33..].copy_from_slice(draft_id.as_bytes());
    }
    key
}

#[inline]
const fn security_mode_discriminant(mode: RelationSecurityMode) -> u8 {
    match mode {
        RelationSecurityMode::PublicLinksOnly => 0,
        RelationSecurityMode::AtlasSafeLinks => 1,
        RelationSecurityMode::AllSnapshotLinks => 2,
    }
}
