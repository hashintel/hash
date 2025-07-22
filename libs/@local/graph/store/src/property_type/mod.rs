use type_system::ontology::PropertyTypeWithMetadata;

pub(crate) use self::query::PropertyTypeQueryPathVisitor;
pub use self::{
    query::{PropertyTypeQueryPath, PropertyTypeQueryToken},
    store::{
        ArchivePropertyTypeParams, CountPropertyTypesParams, CreatePropertyTypeParams,
        GetPropertyTypeSubgraphParams, GetPropertyTypeSubgraphResponse, GetPropertyTypesParams,
        GetPropertyTypesResponse, HasPermissionForPropertyTypesParams, PropertyTypeStore,
        UnarchivePropertyTypeParams, UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
    },
};

mod query;
mod store;

use crate::filter::QueryRecord;

impl QueryRecord for PropertyTypeWithMetadata {
    type QueryPath<'p> = PropertyTypeQueryPath<'p>;
}
