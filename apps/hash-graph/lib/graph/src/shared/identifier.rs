pub mod account;
pub mod knowledge;
pub mod ontology;
pub mod time;

use serde::Serialize;
use type_system::uri::{BaseUri, VersionedUri};
use utoipa::ToSchema;

use crate::identifier::{
    knowledge::EntityId,
    ontology::OntologyTypeVersion,
    time::{Timestamp, VariableAxis},
};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityVertexId {
    pub base_id: EntityId,
    pub version: Timestamp<VariableAxis>,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeVertexId {
    pub base_id: BaseUri,
    pub version: OntologyTypeVersion,
}

impl From<VersionedUri> for OntologyTypeVertexId {
    fn from(uri: VersionedUri) -> Self {
        Self {
            base_id: uri.base_uri,
            version: OntologyTypeVersion::new(uri.version),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(untagged)]
pub enum GraphElementVertexId {
    Ontology(OntologyTypeVertexId),
    KnowledgeGraph(EntityVertexId),
}

impl From<OntologyTypeVertexId> for GraphElementVertexId {
    fn from(id: OntologyTypeVertexId) -> Self {
        Self::Ontology(id)
    }
}

impl From<EntityVertexId> for GraphElementVertexId {
    fn from(id: EntityVertexId) -> Self {
        Self::KnowledgeGraph(id)
    }
}
