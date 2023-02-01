pub mod account;
pub mod knowledge;
pub mod ontology;
pub mod time;

use serde::{Deserialize, Serialize};
use type_system::uri::BaseUri;
use utoipa::ToSchema;

use crate::identifier::{
    knowledge::EntityId,
    ontology::OntologyTypeEditionId,
    time::{ProjectedTime, Timestamp},
};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum GraphElementId {
    Ontology(BaseUri),
    KnowledgeGraph(EntityId),
}

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

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, ToSchema)]
#[serde(untagged)]
pub enum GraphElementVertexId {
    Ontology(OntologyTypeEditionId),
    KnowledgeGraph(EntityVertexId),
}

impl From<OntologyTypeEditionId> for GraphElementVertexId {
    fn from(id: OntologyTypeEditionId) -> Self {
        Self::Ontology(id)
    }
}

impl From<EntityVertexId> for GraphElementVertexId {
    fn from(id: EntityVertexId) -> Self {
        Self::KnowledgeGraph(id)
    }
}
