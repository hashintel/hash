use std::collections::HashMap;

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::ToSchema;

use crate::{
    identifier::{
        EntityIdentifier, EntityVersion, GraphElementEditionIdentifier, OntologyTypeVersion,
    },
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
#[serde(rename_all = "camelCase")]
#[serde(untagged)]
pub enum Vertex {
    Ontology(OntologyVertex),
    KnowledgeGraph(KnowledgeGraphVertex),
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
    pub const fn new(
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

    pub fn remove(&mut self, identifier: &GraphElementEditionIdentifier) -> Option<Vertex> {
        match identifier {
            GraphElementEditionIdentifier::OntologyElementEditionId(versioned_uri) => self
                .ontology
                .0
                .get_mut(versioned_uri.base_uri())
                .and_then(|inner| inner.remove(&versioned_uri.version()).map(Vertex::Ontology)),
            GraphElementEditionIdentifier::KnowledgeGraphElementEditionId(
                entity_edition_identifier,
            ) => self
                .knowledge_graph
                .0
                .get_mut(&entity_edition_identifier.entity_identifier())
                .and_then(|inner| {
                    inner
                        .remove(&entity_edition_identifier.version())
                        .map(Vertex::KnowledgeGraph)
                }),
        }
    }
}
