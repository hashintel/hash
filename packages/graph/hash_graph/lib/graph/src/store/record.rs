use crate::{
    store::query::{Filter, QueryPath},
    subgraph::SubgraphIndex,
};

/// A record stored in the [`store`].
///
/// [`store`]: crate::store
pub trait Record: Sized + Send {
    type EditionId;
    type VertexId: SubgraphIndex<Self> + Send + Sync;
    type QueryPath<'p>: QueryPath + Send + Sync;

    fn edition_id(&self) -> &Self::EditionId;

    fn vertex_id(&self) -> Self::VertexId;

    fn create_filter_for_vertex_id(edition_id: &Self::VertexId) -> Filter<Self>;
}
