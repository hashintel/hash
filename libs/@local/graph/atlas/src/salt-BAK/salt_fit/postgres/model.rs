#![expect(
    clippy::field_scoped_visibility_modifiers,
    reason = "private extraction records are shared only among sibling fit modules"
)]

use type_system::{
    knowledge::entity::id::{EntityEditionId, EntityId},
    ontology::VersionedUrl,
};

use crate::salt::{ContentHash, EntityAtEdition, RelationConfidence};

/// Row metadata kept beside the flat canonical representation matrix.
#[derive(Debug, Clone)]
pub(in crate::salt_fit) struct ExtractedEntity {
    pub(in crate::salt_fit) selected: EntityAtEdition,
    pub(in crate::salt_fit) label: Option<Box<str>>,
    pub(in crate::salt_fit) entity_types: Box<[VersionedUrl]>,
}

/// Deterministic relation-type decision for one current link edition.
#[derive(Debug, Clone)]
pub(in crate::salt_fit) struct LinkTypeSelection {
    pub(in crate::salt_fit) selected: VersionedUrl,
    pub(in crate::salt_fit) candidates: Box<[VersionedUrl]>,
}

/// One induced relation whose link and endpoints all occur in the corpus.
#[derive(Debug, Clone)]
pub(in crate::salt_fit) struct ExtractedLink {
    pub(in crate::salt_fit) link: EntityAtEdition,
    pub(in crate::salt_fit) left: EntityAtEdition,
    pub(in crate::salt_fit) right: EntityAtEdition,
    pub(in crate::salt_fit) relation_type: LinkTypeSelection,
    pub(in crate::salt_fit) required_entity_types: Box<[VersionedUrl]>,
    pub(in crate::salt_fit) confidence: RelationConfidence,
}

/// Local application identity of the short repeatable-read extraction.
#[derive(Debug, Copy, Clone)]
pub(in crate::salt_fit) struct SnapshotEnvelope {
    pub(in crate::salt_fit) transaction_time:
        hash_graph_temporal_versioning::Timestamp<hash_graph_temporal_versioning::TransactionTime>,
    pub(in crate::salt_fit) store_snapshot_identity: ContentHash,
    pub(in crate::salt_fit) ontology_hash: ContentHash,
    pub(in crate::salt_fit) knowledge_hash: ContentHash,
    pub(in crate::salt_fit) authorization_revision: ContentHash,
}

/// Complete bounded payload released after committing the extraction transaction.
#[derive(Debug)]
pub(in crate::salt_fit) struct PostgresExtraction {
    pub(in crate::salt_fit) available_entity_count: usize,
    pub(in crate::salt_fit) available_link_count: usize,
    pub(in crate::salt_fit) entities: Box<[ExtractedEntity]>,
    pub(in crate::salt_fit) canonical_embeddings: Box<[f32]>,
    pub(in crate::salt_fit) links: Box<[ExtractedLink]>,
    pub(in crate::salt_fit) envelope: SnapshotEnvelope,
    pub(in crate::salt_fit) provenance_hash: ContentHash,
    pub(in crate::salt_fit) ambiguous_link_type_count: usize,
    pub(in crate::salt_fit) resource_preflight:
        crate::salt_fit::resource::FitResourcePreflightObservation,
}

impl ExtractedEntity {
    #[inline]
    pub(in crate::salt_fit) const fn entity_id(&self) -> EntityId {
        self.selected.entity_id
    }

    #[inline]
    pub(in crate::salt_fit) const fn edition_id(&self) -> EntityEditionId {
        self.selected.edition_id
    }
}
