use serde::{Deserialize, Serialize};
use type_system::ontology::{
    id::{OntologyTypeRecordId, VersionedUrl},
    provenance::OntologyOwnership,
};

use crate::Embedding;

/// A [`PropertyTypeMetadata`] that has not yet been fully resolved.
///
/// [`PropertyTypeMetadata`]: type_system::ontology::property_type::PropertyTypeMetadata
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialPropertyTypeMetadata {
    pub record_id: OntologyTypeRecordId,
    pub ownership: OntologyOwnership,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "utoipa", derive(utoipa::ToSchema))]
#[serde(rename_all = "camelCase")]
pub struct PropertyTypeEmbedding<'e> {
    pub property_type_id: VersionedUrl,
    pub embedding: Embedding<'e>,
}
