use std::collections::{hash_map::Entry, HashMap, HashSet};

use crate::identifier::{knowledge::EntityEditionId, ontology::OntologyTypeEditionId};

mod edge;
mod kind;

pub use self::{
    edge::{KnowledgeGraphOutwardEdges, OntologyOutwardEdges, OutwardEdge},
    kind::{KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind},
};

#[derive(Default, Debug)]
pub struct Edges {
    ontology: HashMap<OntologyTypeEditionId, HashSet<OntologyOutwardEdges>>,
    knowledge_graph: HashMap<EntityEditionId, HashSet<KnowledgeGraphOutwardEdges>>,
}

impl Edges {
    #[must_use]
    pub fn into_utoipa(self) -> crate::api::utoipa::subgraph::Edges {
        crate::api::utoipa::subgraph::Edges {
            ontology: crate::api::utoipa::subgraph::OntologyRootedEdges(
                self.ontology
                    .into_iter()
                    .fold(HashMap::new(), |mut map, (id, edges)| {
                        let edges = edges.into_iter().collect();
                        match map.entry(id.base_id().clone()) {
                            Entry::Occupied(entry) => {
                                entry.into_mut().insert(id.version(), edges);
                            }
                            Entry::Vacant(entry) => {
                                entry.insert(HashMap::from([(id.version(), edges)]));
                            }
                        }
                        map
                    }),
            ),
            knowledge_graph: crate::api::utoipa::subgraph::KnowledgeGraphRootedEdges(
                self.knowledge_graph
                    .into_iter()
                    .fold(HashMap::new(), |mut map, (id, edges)| {
                        let edges = edges.into_iter().collect();
                        match map.entry(id.base_id()) {
                            Entry::Occupied(entry) => {
                                entry.into_mut().insert(id.version(), edges);
                            }
                            Entry::Vacant(entry) => {
                                entry.insert(HashMap::from([(id.version(), edges)]));
                            }
                        }
                        map
                    }),
            ),
        }
    }
}

pub enum Edge {
    Ontology {
        edition_id: OntologyTypeEditionId,
        outward_edge: OntologyOutwardEdges,
    },
    KnowledgeGraph {
        edition_id: EntityEditionId,
        outward_edge: KnowledgeGraphOutwardEdges,
    },
}

impl Edges {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Inserts an edge to the edge set.
    ///
    /// Returns whether the value was newly inserted. That is:
    ///
    /// - If the set did not previously contain this value, `true` is returned.
    /// - If the set already contained this value, `false` is returned.
    pub fn insert(&mut self, edge: Edge) -> bool {
        match edge {
            Edge::Ontology {
                edition_id,
                outward_edge,
            } => match self.ontology.entry(edition_id) {
                Entry::Occupied(entry) => entry.into_mut().insert(outward_edge),
                Entry::Vacant(entry) => {
                    entry.insert(HashSet::from([outward_edge]));
                    true
                }
            },
            Edge::KnowledgeGraph {
                edition_id,
                outward_edge,
            } => match self.knowledge_graph.entry(edition_id) {
                Entry::Occupied(entry) => entry.into_mut().insert(outward_edge),
                Entry::Vacant(entry) => {
                    entry.insert(HashSet::from([outward_edge]));
                    true
                }
            },
        }
    }

    pub fn extend(&mut self, other: Self) {
        for (edition_id, edges) in other.ontology {
            match self.ontology.entry(edition_id) {
                Entry::Occupied(entry) => entry.into_mut().extend(edges),
                Entry::Vacant(entry) => {
                    entry.insert(edges);
                }
            }
        }

        for (edition_id, edges) in other.knowledge_graph {
            match self.knowledge_graph.entry(edition_id) {
                Entry::Occupied(entry) => entry.into_mut().extend(edges),
                Entry::Vacant(entry) => {
                    entry.insert(edges);
                }
            }
        }
    }
}
