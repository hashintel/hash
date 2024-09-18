pub(crate) use self::query::EntityTypeQueryPathVisitor;
pub use self::query::{EntityTypeQueryPath, EntityTypeQueryToken};

mod query;

use graph_types::ontology::EntityTypeWithMetadata;

use crate::filter::QueryRecord;

impl QueryRecord for EntityTypeWithMetadata {
    type QueryPath<'p> = EntityTypeQueryPath<'p>;
}
