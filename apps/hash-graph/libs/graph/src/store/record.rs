use std::hash::Hash;

use temporal_versioning::TimeAxis;

use crate::{store::query::QueryPath, subgraph::identifier::VertexId};

pub trait QueryRecord: Sized + Send {
    type QueryPath<'p>: QueryPath + Send + Sync + Eq + Hash;
}

/// A record persisted in the [`store`].
///
/// [`store`]: crate::store
// TODO: Split trait into subgraph part and query part
//   see https://linear.app/hash/issue/H-754
pub trait SubgraphRecord: QueryRecord {
    type VertexId: VertexId<Record = Self> + Send + Sync;

    fn vertex_id(&self, time_axis: TimeAxis) -> Self::VertexId;
}
