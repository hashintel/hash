use crate::{
    identifier::time::TimeAxis,
    store::query::{Filter, QueryPath},
    subgraph::SubgraphIndex,
};

/// A record stored in the [`store`].
///
/// [`store`]: crate::store
pub trait Record: Sized + Send {
    type VertexId: SubgraphIndex<Self> + Send + Sync;
    type QueryPath<'p>: QueryPath + Send + Sync;

    fn vertex_id(&self, time_axis: TimeAxis) -> Self::VertexId;

    fn create_filter_for_vertex_id(vertex_id: &Self::VertexId) -> Filter<Self>;
}
