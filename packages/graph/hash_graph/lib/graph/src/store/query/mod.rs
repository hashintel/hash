mod filter;
mod old;

pub use self::{
    filter::{Filter, FilterExpression, Parameter},
    old::{
        Expression, ExpressionError, Literal, Path, PathSegment, Resolve, ResolveError, Version,
        UNIMPLEMENTED_LITERAL_OBJECT, UNIMPLEMENTED_WILDCARDS,
    },
};

/// A record stored in the [`store`].
///
/// [`store`]: crate::store
// TODO: Implement for `DataType`, `PropertyType`, etc. when `Path` is implemented
pub trait QueryRecord {
    type Path<'q>: TryFrom<Path>;
}
