use std::{
    collections::{
        hash_map::{RandomState, RawEntryMut},
        HashSet,
    },
    fmt::Debug,
    hash::Hash,
};

use edges::Edges;
use error_stack::Result;

use crate::{
    identifier::time::{TimeProjection, UnresolvedTimeProjection},
    shared::identifier::GraphElementVertexId,
    store::{crud::Read, QueryError, Record},
    subgraph::{edges::GraphResolveDepths, vertices::Vertices},
};

pub mod edges;
pub mod query;
pub mod vertices;

#[derive(Debug)]
pub struct Subgraph {
    pub roots: HashSet<GraphElementVertexId>,
    pub vertices: Vertices,
    pub edges: Edges,
    pub depths: GraphResolveDepths,
    pub time_projection: UnresolvedTimeProjection,
    pub resolved_time_projection: TimeProjection,
}

impl Subgraph {
    #[must_use]
    pub fn new(
        depths: GraphResolveDepths,
        time_projection: UnresolvedTimeProjection,
        resolved_time_projection: TimeProjection,
    ) -> Self {
        Self {
            roots: HashSet::new(),
            vertices: Vertices::default(),
            edges: Edges::default(),
            depths,
            time_projection,
            resolved_time_projection,
        }
    }

    fn entry<R: Record>(
        &mut self,
        vertex_id: &impl SubgraphIndex<R>,
    ) -> RawEntryMut<R::VertexId, R, RandomState> {
        vertex_id.subgraph_vertex_entry(self)
    }

    pub fn insert<R: Record>(&mut self, vertex_id: &R::VertexId, record: R) -> Option<R> {
        match self.entry(vertex_id) {
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
        time_projection: &TimeProjection,
    ) -> Result<&'r R, QueryError> {
        Ok(match self.entry(vertex_id) {
            RawEntryMut::Occupied(entry) => entry.into_mut(),
            RawEntryMut::Vacant(entry) => {
                entry
                    .insert(
                        vertex_id.clone(),
                        store
                            .read_one(&R::create_filter_for_vertex_id(vertex_id), time_projection)
                            .await?,
                    )
                    .1
            }
        })
    }
}

/// Used for index operations on a mutable [`Subgraph`].
///
/// Depending on `R`, the index operation will be performed on the respective collection of the
/// subgraph.
pub trait SubgraphIndex<R: Record>: Clone + Eq + Hash + Into<GraphElementVertexId> {
    /// Returns a mutable reference to the [`Record`] vertex in the subgraph.
    fn subgraph_vertex_entry<'a>(
        &self,
        subgraph: &'a mut Subgraph,
    ) -> RawEntryMut<'a, R::VertexId, R, RandomState>;
}
