pub(crate) use self::query::DataTypeQueryPathVisitor;
pub use self::query::{DataTypeQueryPath, DataTypeQueryToken};

mod query;

use graph_types::ontology::DataTypeWithMetadata;

use crate::filter::QueryRecord;

impl QueryRecord for DataTypeWithMetadata {
    type QueryPath<'p> = DataTypeQueryPath<'p>;
}
