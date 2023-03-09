mod edge;
mod endpoint;
mod kind;

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fmt::Debug,
    hash::Hash,
};

pub use self::{
    edge::OutwardEdge,
    kind::{
        EdgeKind, EdgeResolveDepths, GraphResolveDepths, KnowledgeGraphEdgeKind, OntologyEdgeKind,
        OutgoingEdgeResolveDepth, SharedEdgeKind,
    },
};
use crate::subgraph::{
    edges::endpoint::{EdgeEndpointSet, EntityIdWithIntervalSet},
    identifier::{EntityVertexId, OntologyTypeVertexId, VertexId},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct EdgeData<K> {
    kind: K,
    reversed: bool,
}

pub struct AdjacencyList<V, K, E>
where
    V: VertexId,
    E: EdgeEndpointSet,
{
    #[expect(clippy::type_complexity)]
    edges: HashMap<V::BaseId, BTreeMap<V::RevisionId, HashMap<EdgeData<K>, E>>>,
}

impl<V, K, E> AdjacencyList<V, K, E>
where
    V: VertexId,
    V::BaseId: Clone,
    E: EdgeEndpointSet,
{
    pub fn insert(
        &mut self,
        vertex_id: &V,
        edge_kind: K,
        reversed: bool,
        right_endpoint: E::EdgeEndpoint,
    ) where
        V::BaseId: Hash + Eq + Clone,
        V::RevisionId: Ord,
        K: Hash + Eq,
        E: Default,
    {
        let vertex_base_id = vertex_id.base_id();
        self.edges
            .raw_entry_mut()
            .from_key(vertex_base_id)
            .or_insert_with(|| (vertex_base_id.clone(), BTreeMap::new()))
            .1
            .entry(vertex_id.revision_id())
            .or_default()
            .entry(EdgeData {
                kind: edge_kind,
                reversed,
            })
            .or_default()
            .insert(right_endpoint);
    }

    pub fn into_flattened<O>(
        self,
    ) -> impl Iterator<Item = (V::BaseId, BTreeMap<V::RevisionId, Vec<O>>)>
    where
        V::RevisionId: Ord,
        K: Copy,
        O: From<OutwardEdge<K, E::EdgeEndpoint>>,
    {
        self.edges.into_iter().map(|(base_id, versions)| {
            (
                base_id,
                versions
                    .into_iter()
                    .map(|(version, edges)| {
                        (
                            version,
                            edges
                                .into_iter()
                                .flat_map(move |(edge, targets)| {
                                    targets.into_iter().map(move |right_endpoint| {
                                        OutwardEdge {
                                            kind: edge.kind,
                                            reversed: edge.reversed,
                                            right_endpoint,
                                        }
                                        .into()
                                    })
                                })
                                .collect(),
                        )
                    })
                    .collect(),
            )
        })
    }
}

impl<V, K, E> Default for AdjacencyList<V, K, E>
where
    V: VertexId,
    E: EdgeEndpointSet,
{
    fn default() -> Self {
        Self {
            edges: HashMap::new(),
        }
    }
}

impl<V, K, E> Debug for AdjacencyList<V, K, E>
where
    V: VertexId,
    V::BaseId: Debug,
    V::RevisionId: Debug,
    K: Debug,
    E: EdgeEndpointSet + Debug,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AdjacencyList")
            .field("edges", &self.edges)
            .finish()
    }
}

#[derive(Default, Debug)]
pub struct Edges {
    pub ontology_to_ontology:
        AdjacencyList<OntologyTypeVertexId, OntologyEdgeKind, HashSet<OntologyTypeVertexId>>,
    pub ontology_to_knowledge:
        AdjacencyList<OntologyTypeVertexId, SharedEdgeKind, EntityIdWithIntervalSet>,
    pub knowledge_to_ontology:
        AdjacencyList<EntityVertexId, SharedEdgeKind, HashSet<OntologyTypeVertexId>>,
    pub knowledge_to_knowledge:
        AdjacencyList<EntityVertexId, KnowledgeGraphEdgeKind, EntityIdWithIntervalSet>,
}

pub enum Edge {
    Ontology {
        vertex_id: OntologyTypeVertexId,
        outward_edge: OntologyOutwardEdge,
    },
    KnowledgeGraph {
        vertex_id: EntityVertexId,
        outward_edge: KnowledgeGraphOutwardEdge,
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
    pub fn insert(&mut self, edge: Edge) {
        match edge {
            Edge::Ontology {
                vertex_id,
                outward_edge,
            } => match outward_edge {
                OntologyOutwardEdge::ToOntology(OutwardEdge {
                    kind,
                    reversed,
                    right_endpoint,
                }) => self
                    .ontology_to_ontology
                    .insert(&vertex_id, kind, reversed, right_endpoint),
                OntologyOutwardEdge::ToKnowledgeGraph(OutwardEdge {
                    kind,
                    reversed,
                    right_endpoint,
                }) => self
                    .ontology_to_knowledge
                    .insert(&vertex_id, kind, reversed, right_endpoint),
            },
            Edge::KnowledgeGraph {
                vertex_id,
                outward_edge,
            } => match outward_edge {
                KnowledgeGraphOutwardEdge::ToOntology(OutwardEdge {
                    kind,
                    reversed,
                    right_endpoint,
                }) => self
                    .knowledge_to_ontology
                    .insert(&vertex_id, kind, reversed, right_endpoint),
                KnowledgeGraphOutwardEdge::ToKnowledgeGraph(OutwardEdge {
                    kind,
                    reversed,
                    right_endpoint,
                }) => {
                    self.knowledge_to_knowledge
                        .insert(&vertex_id, kind, reversed, right_endpoint);
                }
            },
        }
    }
}
