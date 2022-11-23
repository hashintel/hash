mod vertex;

use std::collections::{hash_map::Entry, HashMap};

pub use self::vertex::*;
use crate::identifier::{
    knowledge::EntityEditionId, ontology::OntologyTypeEditionId, GraphElementEditionId,
};

#[derive(Default, Debug)]
pub struct Vertices {
    ontology: HashMap<OntologyTypeEditionId, OntologyVertex>,
    knowledge_graph: HashMap<EntityEditionId, KnowledgeGraphVertex>,
}

impl Vertices {
    #[must_use]
    pub fn into_utoipa(self) -> crate::api::utoipa::subgraph::Vertices {
        crate::api::utoipa::subgraph::Vertices {
            ontology: crate::api::utoipa::subgraph::OntologyVertices(
                self.ontology
                    .into_iter()
                    .fold(HashMap::new(), |mut map, (id, vertex)| {
                        match map.entry(id.base_id().clone()) {
                            Entry::Occupied(entry) => {
                                entry.into_mut().insert(id.version(), vertex);
                            }
                            Entry::Vacant(entry) => {
                                entry.insert(HashMap::from([(id.version(), vertex)]));
                            }
                        }
                        map
                    }),
            ),
            knowledge_graph: crate::api::utoipa::subgraph::KnowledgeGraphVertices(
                self.knowledge_graph
                    .into_iter()
                    .fold(HashMap::new(), |mut map, (id, vertex)| {
                        match map.entry(id.base_id()) {
                            Entry::Occupied(entry) => {
                                entry.into_mut().insert(id.version(), vertex);
                            }
                            Entry::Vacant(entry) => {
                                entry.insert(HashMap::from([(id.version(), vertex)]));
                            }
                        }
                        map
                    }),
            ),
        }
    }
}

impl Vertices {
    #[must_use]
    pub const fn new(
        ontology_vertices: HashMap<OntologyTypeEditionId, OntologyVertex>,
        knowledge_graph_vertices: HashMap<EntityEditionId, KnowledgeGraphVertex>,
    ) -> Self {
        Self {
            ontology: ontology_vertices,
            knowledge_graph: knowledge_graph_vertices,
        }
    }

    pub fn extend(&mut self, other: Self) {
        self.ontology.extend(other.ontology);
        self.knowledge_graph.extend(other.knowledge_graph);
    }

    #[must_use]
    pub fn remove(&mut self, identifier: &GraphElementEditionId) -> Option<Vertex> {
        match identifier {
            GraphElementEditionId::Ontology(type_edition_id) => self
                .ontology
                .remove(type_edition_id)
                .map(|element| Vertex::Ontology(Box::new(element))),
            GraphElementEditionId::KnowledgeGraph(entity_edition_id) => self
                .knowledge_graph
                .remove(entity_edition_id)
                .map(|element| Vertex::KnowledgeGraph(Box::new(element))),
        }
    }
}
