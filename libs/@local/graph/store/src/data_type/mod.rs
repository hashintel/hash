pub(crate) use self::query::DataTypeQueryPathVisitor;
pub use self::{
    query::{DataTypeQueryPath, DataTypeQueryToken},
    store::{
        ArchiveDataTypeParams, CountDataTypesParams, CreateDataTypeParams,
        DataTypeConversionTargets, DataTypeStore, FindDataTypeConversionTargetsParams,
        FindDataTypeConversionTargetsResponse, HasPermissionForDataTypesParams,
        QueryDataTypeSubgraphParams, QueryDataTypeSubgraphResponse, QueryDataTypesParams,
        QueryDataTypesResponse, UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams,
        UpdateDataTypesParams,
    },
};

mod query;
mod store;

use type_system::ontology::DataTypeWithMetadata;

use crate::filter::QueryRecord;

impl QueryRecord for DataTypeWithMetadata {
    type QueryPath<'p> = DataTypeQueryPath<'p>;
}
