pub use self::query::{EntityQueryPath, EntityQuerySortingToken, EntityQueryToken};

mod query;

use hash_graph_types::knowledge::entity::Entity;

use crate::filter::QueryRecord;

impl QueryRecord for Entity {
    type QueryPath<'p> = EntityQueryPath<'p>;
}
