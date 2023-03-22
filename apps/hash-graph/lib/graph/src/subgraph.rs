pub mod edges;
pub mod identifier;
pub mod query;
pub mod temporal_axes;
pub mod vertices;

use std::{
    collections::{
        hash_map::{RandomState, RawEntryMut},
        HashSet,
    },
    hash::Hash,
};

use error_stack::Result;

use self::{
    edges::{Edges, GraphResolveDepths},
    identifier::GraphElementVertexId,
    temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved, SubgraphTemporalAxes},
    vertices::Vertices,
};
use crate::{
    store::{crud::Read, QueryError, Record},
    subgraph::{
        edges::{EdgeDirection, EdgeKind},
        identifier::{EdgeEndpoint, VertexId},
    },
};

#[derive(Debug)]
pub struct Subgraph {
    pub roots: HashSet<GraphElementVertexId>,
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
            roots: HashSet::new(),
            vertices: Vertices::default(),
            edges: Edges::default(),
            depths,
            temporal_axes: SubgraphTemporalAxes {
                initial: initial_temporal_axes,
                resolved: resolved_temporal_axes,
            },
        }
    }

    fn vertex_entry_mut<R: Record>(
        &mut self,
        vertex_id: &R::VertexId,
    ) -> RawEntryMut<R::VertexId, R, RandomState> {
        vertex_id.subgraph_entry_mut(&mut self.vertices)
    }

    pub fn get_vertex<R: Record>(&self, vertex_id: &R::VertexId) -> Option<&R> {
        vertex_id.subgraph_entry(&self.vertices)
    }

    pub fn insert_vertex<R: Record>(&mut self, vertex_id: &R::VertexId, record: R) -> Option<R>
    where
        R::VertexId: Eq + Clone + Hash,
    {
        match self.vertex_entry_mut(vertex_id) {
            RawEntryMut::Occupied(mut entry) => Some(entry.insert(record)),
            RawEntryMut::Vacant(entry) => {
                entry.insert(vertex_id.clone(), record);
                None
            }
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

    /// Looks up a single [`Record`] in the subgraph or reads it from the [`Store`] and inserts it
    /// if it is not yet in the subgraph.
    ///
    /// # Errors
    ///
    /// - Returns an error if the [`Record`] could not be read from the [`Store`].
    ///
    /// [`Store`]: crate::store::Store
    pub async fn get_or_read<'r, R>(
        &'r mut self,
        store: &impl Read<R>,
        vertex_id: &R::VertexId,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<&'r R, QueryError>
    where
        R: Record + 'r,
        R::VertexId: Eq + Clone + Hash,
    {
        Ok(match self.vertex_entry_mut(vertex_id) {
            RawEntryMut::Occupied(entry) => entry.into_mut(),
            RawEntryMut::Vacant(entry) => {
                entry
                    .insert(
                        vertex_id.clone(),
                        store
                            .read_one(&R::create_filter_for_vertex_id(vertex_id), temporal_axes)
                            .await?,
                    )
                    .1
            }
        })
    }
}
