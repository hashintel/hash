use std::{
    collections::{hash_map::Entry, BTreeMap, HashMap, HashSet},
    fmt::Debug,
    hash::Hash,
};

use crate::identifier::{EdgeEndpointSet, EntityVertexId, OntologyTypeVertexId, VertexId};

mod edge;
mod kind;

pub use self::{
    edge::{KnowledgeGraphOutwardEdge, OntologyOutwardEdge, OutwardEdge},
    kind::{
        EdgeResolveDepths, GraphResolveDepths, KnowledgeGraphEdgeKind, OntologyEdgeKind,
        OutgoingEdgeResolveDepth, SharedEdgeKind,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct EdgeKind<K> {
    kind: K,
    reversed: bool,
}

pub struct AdjacencyList<V, K, E>
where
    V: VertexId,
    E: EdgeEndpointSet,
{
    #[expect(clippy::type_complexity)]
    edges: HashMap<V::BaseId, BTreeMap<V::RevisionId, HashMap<EdgeKind<K>, E>>>,
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
    ) -> bool
    where
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
            .entry(EdgeKind {
                kind: edge_kind,
                reversed,
            })
            .or_default()
            .insert(right_endpoint)
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
    pub ontology: HashMap<OntologyTypeVertexId, HashSet<OntologyOutwardEdge>>,
    pub knowledge_graph: HashMap<EntityVertexId, HashSet<KnowledgeGraphOutwardEdge>>,
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
}
