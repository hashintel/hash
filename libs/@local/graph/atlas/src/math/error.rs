//! The refusal a finiteness scan hands back, shared by every consumer that proves a point set.
//!
//! [`FinitePointCloud::new`] and [`KdTree::build`] both scan a point slice and refuse the first
//! offender, and one error type keeps their refusals interchangeable at every boundary that
//! propagates either.
//!
//! [`FinitePointCloud::new`]: super::FinitePointCloud::new
//! [`KdTree::build`]: super::KdTree::build

use core::{error::Error, fmt};

use hashql_core::id::Id;

/// A refused point, a NaN or infinite component at the named id.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct NonFinitePoint<I> {
    /// The first id whose point is non-finite.
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
