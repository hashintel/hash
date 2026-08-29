pub mod edges;
pub mod identifier;
pub mod temporal_axes;
pub mod vertices;

mod record;

use core::hash::Hash;
use std::collections::hash_map::Entry;

use hash_graph_temporal_versioning::RightBoundedTemporalInterval;

pub use self::record::SubgraphRecord;
use self::{
    edges::Edges,
    identifier::{EntityVertexId, GraphElementVertexId},
    temporal_axes::{
        QueryTemporalAxes, QueryTemporalAxesUnresolved, SubgraphTemporalAxes, VariableAxis,
    },
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
        L: VertexId<BaseId: Eq + Clone + Hash, RevisionId: Ord + Clone>,
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

    /// Returns an iterator over all entities in the subgraph with their valid temporal intervals.
    ///
    /// This method intersects each entity's temporal metadata with the subgraph's resolved
    /// temporal axes, yielding only entities that have temporal overlap with the query window.
    /// Entities with no temporal overlap are filtered out.
    ///
    /// # Returns
    ///
    /// An iterator of tuples containing:
    /// - `EntityVertexId`: The identifier of the entity
    /// - `RightBoundedTemporalInterval<VariableAxis>`: The intersection of the entity's temporal
    ///   metadata with the subgraph's query axes
    pub fn entity_with_intervals(
        &self,
    ) -> impl Iterator<Item = (EntityVertexId, RightBoundedTemporalInterval<VariableAxis>)> {
        self.vertices
            .entities
            .iter()
            .filter_map(|(vertex_id, entity)| {
                self.temporal_axes
                    .resolved
                    .clone()
                    .intersect_variable_interval(&entity.metadata.temporal_versioning)
                    .map(|interval| (*vertex_id, interval))
            })
    }
}
