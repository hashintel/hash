use core::hash::Hash;

use crate::store::query::QueryPath;

pub trait QueryRecord: Sized + Send {
    type QueryPath<'p>: QueryPath + Send + Sync + Eq + Hash;
}
