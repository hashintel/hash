//! The dataset's failure type.

use core::{error::Error, fmt};

/// A failure while reading from the graph store.
#[derive(Debug)]
pub enum PostgresDatasetError {
    /// The store rejected or aborted a query.
    Query(tokio_postgres::Error),
    /// A row referenced more type ordinals than the type table holds.
    Ordinal {
        /// The ordinal the row carried.
        value: i64,
    },
    /// Requested canonical embeddings that the store does not hold.
    MissingCanonicalEmbeddings {
        /// How many requested embeddings are absent.
        missing: usize,
    },
}

impl fmt::Display for PostgresDatasetError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Query(_) => fmt.write_str("graph store query failed"),
            Self::Ordinal { value } => {
                write!(fmt, "type ordinal {value} is not a valid row")
            }
            Self::MissingCanonicalEmbeddings { missing } => write!(
                fmt,
                "{missing} requested canonical embeddings are absent from the store"
            ),
        }
    }
}

impl Error for PostgresDatasetError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Query(error) => Some(error),
            Self::Ordinal { .. } | Self::MissingCanonicalEmbeddings { .. } => None,
        }
    }
}

impl From<tokio_postgres::Error> for PostgresDatasetError {
    #[inline]
    fn from(error: tokio_postgres::Error) -> Self {
        Self::Query(error)
    }
}
