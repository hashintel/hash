pub mod account;
pub mod knowledge;
pub mod ontology;
pub mod time;

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::ToSchema;

use crate::identifier::{
    knowledge::EntityId,
    ontology::OntologyTypeVersion,
    time::{ProjectedTime, Timestamp},
};

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EntityVertexId {
    base_id: EntityId,
    version: Timestamp<ProjectedTime>,
}

impl EntityVertexId {
    #[must_use]
    pub const fn new(base_id: EntityId, version: Timestamp<ProjectedTime>) -> Self {
        Self { base_id, version }
    }

    #[must_use]
    pub const fn base_id(&self) -> EntityId {
        self.base_id
    }

    #[must_use]
    pub const fn version(&self) -> Timestamp<ProjectedTime> {
        self.version
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OntologyTypeVertexId {
    base_id: BaseUri,
    version: OntologyTypeVersion,
}

impl OntologyTypeVertexId {
    #[must_use]
    pub const fn new(base_id: BaseUri, version: OntologyTypeVersion) -> Self {
        Self { base_id, version }
    }

    #[must_use]
    pub const fn base_id(&self) -> &BaseUri {
        &self.base_id
    }

    #[must_use]
    pub const fn version(&self) -> OntologyTypeVersion {
        self.version
    }
}

impl From<&VersionedUri> for OntologyTypeVertexId {
    fn from(uri: &VersionedUri) -> Self {
        Self {
            base_id: uri.base_uri().clone(),
            version: OntologyTypeVersion::new(uri.version()),
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
