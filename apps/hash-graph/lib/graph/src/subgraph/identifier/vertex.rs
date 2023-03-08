use serde::Serialize;
use type_system::url::{BaseUrl, VersionedUrl};
use utoipa::ToSchema;

use crate::identifier::{
    knowledge::EntityId,
    ontology::OntologyTypeVersion,
    time::{Timestamp, VariableAxis},
};

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeVertexId {
    pub base_id: BaseUrl,
    pub revision_id: OntologyTypeVersion,
}

impl From<VersionedUrl> for OntologyTypeVertexId {
    fn from(url: VersionedUrl) -> Self {
        Self {
            base_id: url.base_url,
            revision_id: OntologyTypeVersion::new(url.version),
        }
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityVertexId {
    pub base_id: EntityId,
    pub revision_id: Timestamp<VariableAxis>,
}
