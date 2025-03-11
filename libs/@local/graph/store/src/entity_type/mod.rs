pub(crate) use self::query::EntityTypeQueryPathVisitor;
pub use self::{
    query::{EntityTypeQueryPath, EntityTypeQueryToken},
    store::{
        ArchiveEntityTypeParams, ClosedDataTypeDefinition, CountEntityTypesParams,
        CreateEntityTypeParams, EntityTypeResolveDefinitions, EntityTypeStore,
        GetClosedMultiEntityTypeParams, GetClosedMultiEntityTypeResponse,
        GetEntityTypeSubgraphParams, GetEntityTypeSubgraphResponse, GetEntityTypesParams,
        GetEntityTypesResponse, IncludeEntityTypeOption, IncludeResolvedEntityTypeOption,
        UnarchiveEntityTypeParams, UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
    },
};

mod query;
mod store;

use type_system::schema::EntityTypeWithMetadata;

use crate::filter::QueryRecord;

impl QueryRecord for EntityTypeWithMetadata {
    type QueryPath<'p> = EntityTypeQueryPath<'p>;
}
