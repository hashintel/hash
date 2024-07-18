pub mod edges;
pub mod identifier;
pub mod temporal_axes;
pub mod vertices;

use core::hash::Hash;
use std::collections::hash_map::{RandomState, RawEntryMut};

use self::{
    edges::{Edges, GraphResolveDepths},
    identifier::GraphElementVertexId,
    temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved, SubgraphTemporalAxes},
    vertices::Vertices,
};
use crate::{
    store::SubgraphRecord,
    subgraph::{
        edges::{EdgeDirection, EdgeKind},
        identifier::{EdgeEndpoint, VertexId},
    },
};

#[derive(Debug)]
pub struct Subgraph {
    pub roots: Vec<GraphElementVertexId>,
    pub vertices: Vertices,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
    pub temporal_axes: SubgraphTemporalAxes,
}

impl Subgraph {
    #[must_use]
    pub fn new(
        depths: GraphResolveDepths,
        initial_temporal_axes: QueryTemporalAxesUnresolved,
        resolved_temporal_axes: QueryTemporalAxes,
    ) -> Self {
        Self {
            roots: Vec::new(),
            vertices: Vertices::default(),
            edges: Edges::default(),
            depths,
            temporal_axes: SubgraphTemporalAxes {
                initial: initial_temporal_axes,
                resolved: resolved_temporal_axes,
            },
        }
    }

    fn vertex_entry_mut<R: SubgraphRecord>(
        &mut self,
        vertex_id: &R::VertexId,
    ) -> RawEntryMut<R::VertexId, R, RandomState> {
        vertex_id.subgraph_entry_mut(&mut self.vertices)
    }

    pub fn get_vertex<R: SubgraphRecord>(&self, vertex_id: &R::VertexId) -> Option<&R> {
        vertex_id.subgraph_entry(&self.vertices)
    }

    pub fn insert_vertex<R: SubgraphRecord>(&mut self, vertex_id: R::VertexId, record: R)
    where
        R::VertexId: Eq + Hash,
    {
        if let RawEntryMut::Vacant(entry) = self.vertex_entry_mut(&vertex_id) {
            entry.insert(vertex_id, record);
        }
    }

    pub fn insert_edge<L, E, R>(
        &mut self,
        left_endpoint: &L,
        edge_kind: E,
        direction: EdgeDirection,
        right_endpoint: R,
    ) where
        L: VertexId<BaseId: Eq + Clone + Hash, RevisionId: Ord>,
        R: EdgeEndpoint,
        E: EdgeKind<L, R, EdgeSet: Default> + Eq + Hash,
    {
        edge_kind.subgraph_entry_mut(&mut self.edges).insert(
            left_endpoint,
            edge_kind,
            direction,
            right_endpoint,
        );
    }
}
