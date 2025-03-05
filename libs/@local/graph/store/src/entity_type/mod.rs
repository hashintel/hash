pub(crate) use self::query::EntityTypeQueryPathVisitor;
pub use self::{
    query::{EntityTypeQueryPath, EntityTypeQueryToken},
    store::{
        ArchiveEntityTypeParams, ClosedDataTypeDefinition, CountEntityTypesParams,
        CreateEntityTypeParams, EntityTypeResolveDefinitions, EntityTypeStore,
        GetClosedMultiEntityTypesParams, GetClosedMultiEntityTypesResponse,
        GetEntityTypeSubgraphParams, GetEntityTypeSubgraphResponse, GetEntityTypesParams,
        GetEntityTypesResponse, IncludeEntityTypeOption, IncludeResolvedEntityTypeOption,
        UnarchiveEntityTypeParams, UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
    },
};

mod query;
mod store;

use hash_graph_types::ontology::EntityTypeWithMetadata;

use crate::filter::QueryRecord;

impl QueryRecord for EntityTypeWithMetadata {
    type QueryPath<'p> = EntityTypeQueryPath<'p>;
}
