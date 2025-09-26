pub mod edges;
pub mod identifier;
pub mod temporal_axes;
pub mod vertices;

mod record;

use core::hash::Hash;
use std::collections::hash_map::Entry;

pub use self::record::SubgraphRecord;
use self::{
    edges::Edges,
    identifier::GraphElementVertexId,
    temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved, SubgraphTemporalAxes},
    vertices::Vertices,
};
use crate::subgraph::{
    edges::{EdgeDirection, EdgeKind},
    identifier::{EdgeEndpoint, VertexId},
};

#[derive(Debug)]
pub struct Subgraph {
    pub roots: Vec<GraphElementVertexId>,
    pub vertices: Vertices,
    pub edges: Edges,
    pub temporal_axes: SubgraphTemporalAxes,
}

impl Subgraph {
    #[must_use]
    pub fn new(
        initial_temporal_axes: QueryTemporalAxesUnresolved,
        resolved_temporal_axes: QueryTemporalAxes,
    ) -> Self {
        Self {
            roots: Vec::new(),
            vertices: Vertices::default(),
            edges: Edges::default(),
            temporal_axes: SubgraphTemporalAxes {
                initial: initial_temporal_axes,
                resolved: resolved_temporal_axes,
            },
        }
    }

    fn vertex_entry_mut<R: SubgraphRecord>(
        &mut self,
        vertex_id: R::VertexId,
    ) -> Entry<'_, R::VertexId, R> {
        vertex_id.subgraph_entry_mut(&mut self.vertices)
    }

    pub fn get_vertex<R: SubgraphRecord>(&self, vertex_id: &R::VertexId) -> Option<&R> {
        vertex_id.subgraph_entry(&self.vertices)
    }

    pub fn insert_vertex<R: SubgraphRecord>(&mut self, vertex_id: R::VertexId, record: R)
    where
        R::VertexId: Eq + Hash,
    {
        if let Entry::Vacant(entry) = self.vertex_entry_mut(vertex_id) {
            entry.insert(record);
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
