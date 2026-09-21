use core::{error::Error, fmt};

use hashql_core::id::Id;

/// A point containing a NaN or infinite coordinate, identified by its row ID.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct NonFinitePoint<I> {
    /// The first ID whose point is non-finite.
    pub id: I,
}

impl<I> fmt::Display for NonFinitePoint<I>
where
    I: Id,
{
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self { id } = self;

        write!(fmt, "the point at id={id} has a NaN or infinite component")
    }
}

impl<I> Error for NonFinitePoint<I> where I: Id {}
