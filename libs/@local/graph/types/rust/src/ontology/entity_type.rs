use serde::{Deserialize, Serialize};
use type_system::ontology::{
    id::{OntologyTypeRecordId, VersionedUrl},
    provenance::OntologyOwnership,
};

use crate::Embedding;

/// An [`EntityTypeMetadata`] that has not yet been fully resolved.
///
/// [`EntityTypeMetadata`]: type_system::ontology::entity_type::EntityTypeMetadata
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialEntityTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub ownership: OntologyOwnership,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct EntityTypeEmbedding<'e> {
    pub entity_type_id: VersionedUrl,
    pub embedding: Embedding<'e>,
}
