mod old;

use std::marker::PhantomData;

pub use self::old::{
    Expression, ExpressionError, Literal, Path, PathSegment, Resolve, ResolveError, Version,
    UNIMPLEMENTED_LITERAL_OBJECT, UNIMPLEMENTED_WILDCARDS,
};

/// A record stored in the [`store`].
///
/// [`store`]: crate::store
// TODO: Implement for `DataType`, `PropertyType`, etc. when `Path` is implemented
pub trait QueryRecord {
    type Path<'q>;
}

/// A query to read [`QueryRecord`]s from the [`store`].
///
/// [`store`]: crate::store
pub struct ReadQuery<'q, T: QueryRecord> {
    // TODO: Replace `PhantomData` with filters used for queries
    _filters: Vec<PhantomData<T::Path<'q>>>,
}
