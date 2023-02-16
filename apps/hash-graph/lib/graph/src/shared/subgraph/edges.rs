use std::collections::{hash_map::Entry, HashMap, HashSet};

use crate::identifier::{EntityVertexId, OntologyTypeVertexId};

mod edge;
mod kind;

pub use self::{
    edge::{KnowledgeGraphOutwardEdges, OntologyOutwardEdges, OutwardEdge},
    kind::{
        EdgeResolveDepths, GraphResolveDepths, KnowledgeGraphEdgeKind, OntologyEdgeKind,
        OutgoingEdgeResolveDepth, SharedEdgeKind,
    },
};

#[derive(Default, Debug)]
pub struct Edges {
    pub ontology: HashMap<OntologyTypeVertexId, HashSet<OntologyOutwardEdges>>,
    pub knowledge_graph: HashMap<EntityVertexId, HashSet<KnowledgeGraphOutwardEdges>>,
}

pub enum Edge {
    Ontology {
        vertex_id: OntologyTypeVertexId,
        outward_edge: OntologyOutwardEdges,
    },
    KnowledgeGraph {
        vertex_id: EntityVertexId,
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
                vertex_id,
                outward_edge,
            } => match self.ontology.entry(vertex_id) {
                Entry::Occupied(entry) => entry.into_mut().insert(outward_edge),
                Entry::Vacant(entry) => {
                    entry.insert(HashSet::from([outward_edge]));
                    true
                }
            },
            Edge::KnowledgeGraph {
                vertex_id,
                outward_edge,
            } => match self.knowledge_graph.entry(vertex_id) {
                Entry::Occupied(entry) => entry.into_mut().insert(outward_edge),
                Entry::Vacant(entry) => {
                    entry.insert(HashSet::from([outward_edge]));
                    true
                }
            },
        }
    }

    pub fn extend(&mut self, other: Self) {
        for (vertex_id, edges) in other.ontology {
            match self.ontology.entry(vertex_id) {
                Entry::Occupied(entry) => entry.into_mut().extend(edges),
                Entry::Vacant(entry) => {
                    entry.insert(edges);
                }
            }
        }

        for (vertex_id, edges) in other.knowledge_graph {
            match self.knowledge_graph.entry(vertex_id) {
                Entry::Occupied(entry) => entry.into_mut().extend(edges),
                Entry::Vacant(entry) => {
                    entry.insert(edges);
                }
            }
        }
    }
}
