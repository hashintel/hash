use serde::{Deserialize, Serialize};
use type_system::{
    ontology::provenance::OntologyOwnership,
    url::{OntologyTypeRecordId, VersionedUrl},
};

use crate::Embedding;

/// An [`EntityTypeMetadata`] that has not yet been fully resolved.
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
