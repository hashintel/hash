//! Semantic-graph validation errors.

use core::{error::Error, fmt};

/// A matrix violated a [`SemanticGraph`](super::SemanticGraph) invariant.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum SemanticValidationError {
    /// The matrix uses column compression.
    ColumnCompressed,
    /// The matrix is not square over the row domain.
    NotSquare { rows: usize, columns: usize },
    /// The row domain holds at most one row.
    InsufficientRows { rows: usize },
    /// A row references itself.
    SelfEdge { row: usize },
    /// A stored weight is not finite.
    NonFiniteWeight {
        row: usize,
        column: usize,
        weight: f32,
    },
    /// A stored weight lies outside `(0, 1]`.
    WeightOutOfRange {
        row: usize,
        column: usize,
        weight: f32,
    },
    /// The matrix stores an edge in one direction only.
    AsymmetricSupport { row: usize, column: usize },
    /// An edge's two stored weights differ.
    AsymmetricWeight {
        row: usize,
        column: usize,
        forward: f32,
        reverse: f32,
    },
}

impl fmt::Display for SemanticValidationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::ColumnCompressed => fmt.write_str("the weight matrix is compressed by column"),
            Self::NotSquare { rows, columns } => write!(
                fmt,
                "the weight matrix spans {rows} rows by {columns} columns",
            ),
            Self::InsufficientRows { rows } => {
                write!(fmt, "{rows} rows cannot carry a semantic graph")
            }
            Self::SelfEdge { row } => write!(fmt, "row {row} references itself"),
            Self::NonFiniteWeight {
                row,
                column,
                weight,
            } => write!(
                fmt,
                "the weight {weight} from row {row} to row {column} is not finite",
            ),
            Self::WeightOutOfRange {
                row,
                column,
                weight,
            } => write!(
                fmt,
                "the weight {weight} from row {row} to row {column} lies outside (0, 1]",
            ),
            Self::AsymmetricSupport { row, column } => write!(
                fmt,
                "the edge from row {row} to row {column} has no reverse entry",
            ),
            Self::AsymmetricWeight {
                row,
                column,
                forward,
                reverse,
            } => write!(
                fmt,
                "the edge between rows {row} and {column} stores {forward} forward but {reverse} \
                 in reverse",
            ),
        }
    }
}

impl Error for SemanticValidationError {}
