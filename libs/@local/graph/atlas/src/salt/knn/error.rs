use core::{error::Error, fmt};

use super::table::KnnValidationError;

/// Building or spot-checking against a backend failed.
#[derive(Debug)]
pub enum KnnError<N, E> {
    /// The backend reported an error.
    Backend(E),
    /// The assembled table violates a [`Knn`](super::table::Knn) invariant.
    Invalid(KnnValidationError),
    /// The row domain exceeds the table's `u32` column encoding.
    TooManyRows { rows: usize },
    /// The requested table shape overflows the entry count.
    TooManyEntries { rows: usize, neighbours: usize },
    /// A sampling budget cannot size a sample.
    SampleBudget { margin: f64, confidence: f64 },
    /// Constructed lists are narrower than the table's stored width.
    ListsWidth { width: usize, neighbours: usize },
    /// A search returned a different neighbour count than the table stores per row.
    SearchCount {
        row: N,
        expected: usize,
        actual: usize,
    },
    /// A search returned the same neighbour twice.
    DuplicateNeighbour { row: N, neighbour: u64 },
    /// A search returned a row outside the generation's row domain.
    NeighbourOutOfBounds { row: N, neighbour: u64, rows: usize },
}

impl<N, E> KnnError<N, E> {
    /// Maps the rows the error names into another row domain, and the backend error with them.
    pub(crate) fn map_rows<M, F>(
        self,
        row: impl FnOnce(N) -> M,
        backend: impl FnOnce(E) -> F,
    ) -> KnnError<M, F> {
        match self {
            Self::Backend(error) => KnnError::Backend(backend(error)),
            Self::Invalid(invalid) => KnnError::Invalid(invalid),
            Self::TooManyRows { rows } => KnnError::TooManyRows { rows },
            Self::TooManyEntries { rows, neighbours } => {
                KnnError::TooManyEntries { rows, neighbours }
            }
            Self::SampleBudget { margin, confidence } => {
                KnnError::SampleBudget { margin, confidence }
            }
            Self::ListsWidth { width, neighbours } => KnnError::ListsWidth { width, neighbours },
            Self::SearchCount {
                row: searched,
                expected,
                actual,
            } => KnnError::SearchCount {
                row: row(searched),
                expected,
                actual,
            },
            Self::DuplicateNeighbour {
                row: searched,
                neighbour,
            } => KnnError::DuplicateNeighbour {
                row: row(searched),
                neighbour,
            },
            Self::NeighbourOutOfBounds {
                row: searched,
                neighbour,
                rows,
            } => KnnError::NeighbourOutOfBounds {
                row: row(searched),
                neighbour,
                rows,
            },
        }
    }
}

impl<N, E> From<KnnValidationError> for KnnError<N, E> {
    fn from(invalid: KnnValidationError) -> Self {
        Self::Invalid(invalid)
    }
}

impl<N: fmt::Display, E: fmt::Display> fmt::Display for KnnError<N, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Backend(error) => write!(fmt, "the search backend failed: {error}"),
            Self::Invalid(invalid) => invalid.fmt(fmt),
            Self::TooManyRows { rows } => {
                write!(fmt, "{rows} rows exceed the table's u32 column encoding")
            }
            Self::TooManyEntries { rows, neighbours } => write!(
                fmt,
                "{rows} rows with {neighbours} neighbours each overflow the entry count",
            ),
            Self::SampleBudget { margin, confidence } => write!(
                fmt,
                "a margin of {margin} at confidence {confidence} does not size a sample; the \
                 margin must be positive and finite and the confidence strictly inside (0, 1)",
            ),
            Self::ListsWidth { width, neighbours } => write!(
                fmt,
                "{width}-wide neighbour lists cannot fill a table storing {neighbours} per row",
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

impl<N: fmt::Debug + fmt::Display, E: Error + 'static> Error for KnnError<N, E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Backend(error) => Some(error),
            Self::Invalid(invalid) => Some(invalid),
            Self::TooManyRows { .. }
            | Self::TooManyEntries { .. }
            | Self::SampleBudget { .. }
            | Self::ListsWidth { .. }
            | Self::SearchCount { .. }
            | Self::DuplicateNeighbour { .. }
            | Self::NeighbourOutOfBounds { .. } => None,
        }
    }
}
