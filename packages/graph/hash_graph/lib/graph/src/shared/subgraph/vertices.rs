use std::collections::HashMap;

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::ToSchema;

use crate::{
    identifier::{EntityIdentifier, EntityVersion, OntologyTypeVersion},
    knowledge::PersistedEntity,
    ontology::{PersistedDataType, PersistedEntityType, PersistedPropertyType},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
pub enum OntologyVertex {
    DataType(PersistedDataType),
    PropertyType(PersistedPropertyType),
    EntityType(PersistedEntityType),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "kind", content = "inner")]
pub enum KnowledgeGraphVertex {
    Entity(PersistedEntity),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyVertices(HashMap<BaseUri, HashMap<OntologyTypeVersion, OntologyVertex>>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphVertices(
    HashMap<EntityIdentifier, HashMap<EntityVersion, KnowledgeGraphVertex>>,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
pub struct Vertices {
    #[serde(flatten)]
    ontology: OntologyVertices,
    #[serde(flatten)]
    knowledge_graph: KnowledgeGraphVertices,
}

impl Vertices {
    #[must_use]
    pub fn new() -> Self {
        Self {
            ontology: OntologyVertices(HashMap::new()),
            knowledge_graph: KnowledgeGraphVertices(HashMap::new()),
        }
    }

    pub fn extend(&mut self, other: Self) {
        self.ontology.0.extend(other.ontology.0.into_iter());
        self.knowledge_graph
            .0
            .extend(other.knowledge_graph.0.into_iter());
    }
}
