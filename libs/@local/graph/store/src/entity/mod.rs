#[cfg(feature = "utoipa")]
pub use self::store::CreateEntityRequest;
pub use self::{
    query::{
        EntityQueryCursor, EntityQueryPath, EntityQuerySorting, EntityQuerySortingRecord,
        EntityQuerySortingToken, EntityQueryToken,
    },
    store::{
        ClosedMultiEntityTypeMap, CountEntitiesParams, CreateEntityParams, DiffEntityParams,
        DiffEntityResult, EntityStore, EntityValidationType, GetEntitiesParams,
        GetEntitiesResponse, GetEntitySubgraphParams, GetEntitySubgraphResponse, PatchEntityParams,
        QueryConversion, UpdateEntityEmbeddingsParams, ValidateEntityComponents,
        ValidateEntityError, ValidateEntityParams,
    },
};

mod query;
mod store;

use hash_graph_types::knowledge::entity::Entity;

use crate::filter::QueryRecord;

impl QueryRecord for Entity {
    type QueryPath<'p> = EntityQueryPath<'p>;
}
