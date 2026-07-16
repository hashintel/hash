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
pub(in crate::fit) struct ExtractedEntity {
    pub(in crate::fit) selected: EntityAtEdition,
    pub(in crate::fit) label: Option<Box<str>>,
    pub(in crate::fit) entity_types: Box<[VersionedUrl]>,
}

/// Deterministic relation-type decision for one current link edition.
#[derive(Debug, Clone)]
pub(in crate::fit) struct LinkTypeSelection {
    pub(in crate::fit) selected: VersionedUrl,
    pub(in crate::fit) candidates: Box<[VersionedUrl]>,
}

/// One induced relation whose link and endpoints all occur in the corpus.
#[derive(Debug, Clone)]
pub(in crate::fit) struct ExtractedLink {
    pub(in crate::fit) link: EntityAtEdition,
    pub(in crate::fit) left: EntityAtEdition,
    pub(in crate::fit) right: EntityAtEdition,
    pub(in crate::fit) relation_type: LinkTypeSelection,
    pub(in crate::fit) required_entity_types: Box<[VersionedUrl]>,
    pub(in crate::fit) confidence: RelationConfidence,
}

/// Local application identity of the short repeatable-read extraction.
#[derive(Debug, Copy, Clone)]
pub(in crate::fit) struct SnapshotEnvelope {
    pub(in crate::fit) transaction_time:
        hash_graph_temporal_versioning::Timestamp<hash_graph_temporal_versioning::TransactionTime>,
    pub(in crate::fit) store_snapshot_identity: ContentHash,
    pub(in crate::fit) ontology_hash: ContentHash,
    pub(in crate::fit) knowledge_hash: ContentHash,
    pub(in crate::fit) authorization_revision: ContentHash,
}

/// Complete bounded payload released after committing the extraction transaction.
#[derive(Debug)]
pub(in crate::fit) struct PostgresExtraction {
    pub(in crate::fit) entities: Box<[ExtractedEntity]>,
    pub(in crate::fit) canonical_embeddings: Box<[f32]>,
    pub(in crate::fit) links: Box<[ExtractedLink]>,
    pub(in crate::fit) envelope: SnapshotEnvelope,
    pub(in crate::fit) provenance_hash: ContentHash,
    pub(in crate::fit) ambiguous_link_type_count: usize,
}

impl ExtractedEntity {
    #[inline]
    pub(in crate::fit) const fn entity_id(&self) -> EntityId {
        self.selected.entity_id
    }

    #[inline]
    pub(in crate::fit) const fn edition_id(&self) -> EntityEditionId {
        self.selected.edition_id
    }
}
