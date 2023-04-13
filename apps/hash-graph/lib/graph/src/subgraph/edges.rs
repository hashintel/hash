mod edge;
mod endpoint;
mod kind;

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fmt::Debug,
    hash::Hash,
};

pub use self::{
    edge::{EdgeDirection, OutwardEdge},
    kind::{
        EdgeKind, EdgeResolveDepths, GraphResolveDepths, KnowledgeGraphEdgeKind, OntologyEdgeKind,
        OutgoingEdgeResolveDepth, SharedEdgeKind,
    },
};
use crate::subgraph::{
    edges::endpoint::{EdgeEndpointSet, EntityIdWithIntervalSet},
    identifier::{
        DataTypeVertexId, EntityTypeVertexId, EntityVertexId, PropertyTypeVertexId, VertexId,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
struct EdgeData<K> {
    kind: K,
    direction: EdgeDirection,
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
        direction: EdgeDirection,
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
                direction,
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
                                            direction: edge.direction,
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
    pub entity_to_entity:
        AdjacencyList<EntityVertexId, KnowledgeGraphEdgeKind, EntityIdWithIntervalSet>,
    pub entity_to_entity_type:
        AdjacencyList<EntityVertexId, SharedEdgeKind, HashSet<EntityTypeVertexId>>,
    pub entity_type_to_entity_type:
        AdjacencyList<EntityTypeVertexId, OntologyEdgeKind, HashSet<EntityTypeVertexId>>,
    pub entity_type_to_property_type:
        AdjacencyList<EntityTypeVertexId, OntologyEdgeKind, HashSet<PropertyTypeVertexId>>,
    pub property_type_to_property_type:
        AdjacencyList<PropertyTypeVertexId, OntologyEdgeKind, HashSet<PropertyTypeVertexId>>,
    pub property_type_to_data_type:
        AdjacencyList<PropertyTypeVertexId, OntologyEdgeKind, HashSet<DataTypeVertexId>>,
}
