pub mod edges;
pub mod identifier;
pub mod query;
pub mod temporal_axes;
pub mod vertices;

use std::collections::{
    hash_map::{RandomState, RawEntryMut},
    HashSet,
};

use error_stack::Result;

use self::{
    edges::{Edges, GraphResolveDepths},
    identifier::GraphElementVertexId,
    temporal_axes::{QueryTemporalAxes, QueryTemporalAxesUnresolved, SubgraphTemporalAxes},
    vertices::{VertexIndex, Vertices},
};
use crate::store::{crud::Read, QueryError, Record};

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
        vertex_id.vertices_entry_mut(&mut self.vertices)
    }

    pub fn get_vertex<R: Record>(&self, vertex_id: &R::VertexId) -> Option<&R> {
        vertex_id.vertices_entry(&self.vertices)
    }

    pub fn insert<R: Record>(&mut self, vertex_id: &R::VertexId, record: R) -> Option<R> {
        match self.vertex_entry_mut(vertex_id) {
            RawEntryMut::Occupied(mut entry) => Some(entry.insert(record)),
            RawEntryMut::Vacant(entry) => {
                entry.insert(vertex_id.clone(), record);
                None
            }
        }
    }

    /// Looks up a single [`Record`] in the subgraph or reads it from the [`Store`] and inserts it
    /// if it is not yet in the subgraph.
    ///
    /// # Errors
    ///
    /// - Returns an error if the [`Record`] could not be read from the [`Store`].
    ///
    /// [`Store`]: crate::store::Store
    pub async fn get_or_read<'r, R: Record + Sync + 'r>(
        &'r mut self,
        store: &impl Read<R>,
        vertex_id: &R::VertexId,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<&'r R, QueryError> {
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
