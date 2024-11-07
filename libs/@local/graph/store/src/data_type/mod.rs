pub(crate) use self::query::DataTypeQueryPathVisitor;
pub use self::{
    query::{DataTypeQueryPath, DataTypeQueryToken},
    store::{
        ArchiveDataTypeParams, CountDataTypesParams, CreateDataTypeParams, DataTypeStore,
        GetDataTypeSubgraphParams, GetDataTypeSubgraphResponse, GetDataTypesParams,
        GetDataTypesResponse, UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams,
        UpdateDataTypesParams,
    },
};

mod query;
mod store;

use hash_graph_types::ontology::DataTypeWithMetadata;

use crate::filter::QueryRecord;

impl QueryRecord for DataTypeWithMetadata {
    type QueryPath<'p> = DataTypeQueryPath<'p>;
}
