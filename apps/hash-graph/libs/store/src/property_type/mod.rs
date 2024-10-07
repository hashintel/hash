pub(crate) use self::query::PropertyTypeQueryPathVisitor;
pub use self::query::{PropertyTypeQueryPath, PropertyTypeQueryToken};

mod query;

use graph_types::ontology::PropertyTypeWithMetadata;

use crate::filter::QueryRecord;

impl QueryRecord for PropertyTypeWithMetadata {
    type QueryPath<'p> = PropertyTypeQueryPath<'p>;
}
