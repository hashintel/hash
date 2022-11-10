mod vertex;

use std::collections::HashMap;

use serde::Serialize;
use type_system::uri::BaseUri;
use utoipa::{ToSchema};

pub use self::vertex::*;
use crate::identifier::{
    knowledge::{EntityId, EntityVersion},
    ontology::OntologyTypeVersion,
    GraphElementEditionId,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct OntologyVertices(pub HashMap<BaseUri, HashMap<OntologyTypeVersion, OntologyVertex>>);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(transparent)]
pub struct KnowledgeGraphVertices(
    pub HashMap<EntityId, HashMap<EntityVersion, KnowledgeGraphVertex>>,
);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
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

    #[must_use]
    pub fn remove(&mut self, identifier: &GraphElementEditionId) -> Option<Vertex> {
        match identifier {
            GraphElementEditionId::Ontology(type_edition_id) => self
                .ontology
                .0
                .get_mut(type_edition_id.base_id())
                .and_then(|inner| {
                    inner
                        .remove(&type_edition_id.version())
                        .map(Vertex::Ontology)
                }),
            GraphElementEditionId::KnowledgeGraph(entity_edition_id) => self
                .knowledge_graph
                .0
                .get_mut(&entity_edition_id.base_id())
                .and_then(|inner| {
                    inner
                        .remove(&entity_edition_id.version())
                        .map(Vertex::KnowledgeGraph)
                }),
        }
    }
}
