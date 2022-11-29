mod vertex;

use std::collections::HashMap;

pub use self::vertex::*;
use crate::identifier::{
    knowledge::EntityEditionId, ontology::OntologyTypeEditionId, GraphElementEditionId,
};

#[derive(Default, Debug)]
pub struct Vertices {
    pub ontology: HashMap<OntologyTypeEditionId, OntologyVertex>,
    pub knowledge_graph: HashMap<EntityEditionId, KnowledgeGraphVertex>,
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
