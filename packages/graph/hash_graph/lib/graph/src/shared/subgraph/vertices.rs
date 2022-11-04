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
pub struct OntologyVertices(pub HashMap<BaseUri, HashMap<OntologyTypeVersion, OntologyVertex>>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphVertices(
    pub HashMap<EntityIdentifier, HashMap<EntityVersion, KnowledgeGraphVertex>>,
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
    pub fn new(
        ontology_vertices: OntologyVertices,
        knowledge_graph_vertices: KnowledgeGraphVertices,
    ) -> Self {
        Self {
            ontology: ontology_vertices,
            knowledge_graph: knowledge_graph_vertices,
        }
    }

    pub fn extend(&mut self, other: Self) {
        self.ontology.0.extend(other.ontology.0.into_iter());
        self.knowledge_graph
            .0
            .extend(other.knowledge_graph.0.into_iter());
    }
}
