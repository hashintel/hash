use crate::{identifier::time::TimeAxis, store::query::QueryPath, subgraph::identifier::VertexId};

/// A record stored in the [`store`].
///
/// [`store`]: crate::store
pub trait Record: Sized + Send {
    type VertexId: VertexId<Record = Self> + Send + Sync;
    type QueryPath<'p>: QueryPath + Send + Sync;

    fn vertex_id(&self, time_axis: TimeAxis) -> Self::VertexId;
}
