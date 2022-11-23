mod vertex;

use std::collections::{hash_map::Entry, HashMap};

use serde::{Serialize, Serializer};

pub use self::vertex::*;
use crate::identifier::{
    knowledge::EntityEditionId, ontology::OntologyTypeEditionId, GraphElementEditionId,
};

#[derive(Default, Debug)]
pub struct Vertices {
    ontology: HashMap<OntologyTypeEditionId, OntologyVertex>,
    knowledge_graph: HashMap<EntityEditionId, KnowledgeGraphVertex>,
}

impl Serialize for Vertices {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        crate::api::utoipa::subgraph::Vertices {
            ontology: self
                .ontology
                .iter()
                .fold(HashMap::new(), |mut map, (id, vertex)| {
                    match map.entry(id.base_id()) {
                        Entry::Occupied(mut entry) => {
                            entry.get_mut().insert(id.version(), vertex);
                        }
                        Entry::Vacant(entry) => {
                            let mut map = HashMap::new();
                            map.insert(id.version(), vertex);
                            entry.insert(map);
                        }
                    }
                    map
                }),
            knowledge_graph: self.knowledge_graph.iter().fold(
                HashMap::new(),
                |mut map, (id, vertex)| {
                    match map.entry(id.base_id()) {
                        Entry::Occupied(mut entry) => {
                            entry.get_mut().insert(id.version(), vertex);
                        }
                        Entry::Vacant(entry) => {
                            let mut map = HashMap::new();
                            map.insert(id.version(), vertex);
                            entry.insert(map);
                        }
                    }
                    map
                },
            ),
        }
        .serialize(serializer)
    }
}

#[derive(Debug, PartialEq, Eq, Hash)]
pub enum VertexIdentifier {
    Ontology(OntologyTypeEditionId),
    Knowledge(EntityEditionId),
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
