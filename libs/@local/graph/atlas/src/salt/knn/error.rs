use core::{error::Error, fmt};

use super::table::InvalidKnn;

/// Building or spot-checking against a backend failed.
#[derive(Debug)]
pub(crate) enum KnnError<E> {
    /// The backend reported an error.
    Backend(E),
    /// The assembled table violates a [`Knn`](super::table::Knn)
    /// invariant.
    Invalid(InvalidKnn),
    /// The requested table shape overflows the entry count.
    TooManyEntries { rows: usize, neighbours: usize },
    /// A search returned a different neighbour count than the table
    /// stores per row.
    SearchCount {
        row: usize,
        expected: usize,
        actual: usize,
    },
    /// A search returned the same neighbour twice.
    DuplicateNeighbour { row: usize, neighbour: u64 },
    /// A search returned a row outside the generation's row domain.
    NeighbourOutOfBounds {
        row: usize,
        neighbour: u64,
        rows: usize,
    },
}

impl<E> From<InvalidKnn> for KnnError<E> {
    fn from(invalid: InvalidKnn) -> Self {
        Self::Invalid(invalid)
    }
}

impl<E: fmt::Display> fmt::Display for KnnError<E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Backend(error) => write!(fmt, "the search backend failed: {error}"),
            Self::Invalid(invalid) => invalid.fmt(fmt),
            Self::TooManyEntries { rows, neighbours } => write!(
                fmt,
                "{rows} rows with {neighbours} neighbours each overflow the entry count",
            ),
            Self::SearchCount {
                row,
                expected,
                actual,
            } => write!(
                fmt,
                "the search for row {row} returned {actual} neighbours where the table stores \
                 {expected}",
            ),
            Self::DuplicateNeighbour { row, neighbour } => write!(
                fmt,
                "the search for row {row} returned neighbour {neighbour} twice",
            ),
            Self::NeighbourOutOfBounds {
                row,
                neighbour,
                rows,
            } => write!(
                fmt,
                "the search for row {row} returned neighbour {neighbour} outside the {rows}-row \
                 domain",
            ),
        }
    }
}

impl<E: Error + 'static> Error for KnnError<E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Backend(error) => Some(error),
            Self::Invalid(invalid) => Some(invalid),
            Self::TooManyEntries { .. }
            | Self::SearchCount { .. }
            | Self::DuplicateNeighbour { .. }
            | Self::NeighbourOutOfBounds { .. } => None,
        }
    }
}
