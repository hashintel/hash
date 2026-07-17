//! The shared error type for graph construction and combination.

use core::{error::Error, fmt};

/// An invalid k-NN result, graph structure, option, or `USearch` failure.
///
/// Row and offset fields locate the offending entry: `row` is the sampled row
/// whose data is invalid and `offset` is the position within that row (for
/// k-NN errors) or within the CSR value storage (for graph weight errors).
#[derive(Debug)]
pub enum GraphError {
    /// The k-NN shape is empty or has more neighbors than rows.
    InvalidKnnShape { rows: usize, neighbors: usize },
    /// The flat k-NN storage does not hold `rows * neighbors` entries.
    KnnLength {
        expected: usize,
        indices: usize,
        distances: usize,
    },
    /// The row count exceeds `u32` indices.
    TooManyRows(usize),
    /// The edge count exceeds `u32` pointers.
    TooManyEdges(usize),
    /// A neighbor or column index is not a valid row.
    NeighborOutOfBounds {
        row: usize,
        offset: usize,
        index: u32,
        rows: usize,
    },
    /// A row lists the same neighbor twice.
    DuplicateNeighbor { row: usize, index: u32 },
    /// A neighbor distance is NaN or infinite.
    NonFiniteDistance {
        row: usize,
        offset: usize,
        distance: f32,
    },
    /// A row's neighbor distances are not ascending.
    UnsortedDistances { row: usize, offset: usize },
    /// The local connectivity option is not finite and non-negative.
    InvalidLocalConnectivity(f32),
    /// The bandwidth option is not finite and positive.
    InvalidBandwidth(f32),
    /// Two graphs that must share a shape do not.
    GraphShape {
        left: (usize, usize),
        right: (usize, usize),
    },
    /// The graph row and column counts differ.
    NonSquareGraph { rows: usize, columns: usize },
    /// A stored weight is outside `[0, 1]` or not finite.
    InvalidGraphWeight { offset: usize, weight: f32 },
    /// The blend alpha is outside `[0, 1]`.
    InvalidAlpha(f32),
    /// Raw CSR storage does not describe a valid matrix.
    SparseStructure(String),
    /// A semantic graph option is zero.
    InvalidSemanticOption { name: &'static str, value: usize },
    /// `USearch` reported a failure.
    Index(cxx::Exception),
    /// `USearch` returned a different number of results than requested.
    SearchResultCount {
        row: usize,
        expected: usize,
        keys: usize,
        distances: usize,
    },
    /// `USearch` returned a key outside the sampled rows.
    IndexKeyOutOfBounds { row: usize, key: u64, rows: u32 },
}

impl fmt::Display for GraphError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidKnnShape { rows, neighbors } => write!(
                formatter,
                "invalid k-NN shape: {rows} rows with {neighbors} neighbors per row"
            ),
            Self::KnnLength {
                expected,
                indices,
                distances,
            } => write!(
                formatter,
                "invalid k-NN storage: expected {expected} entries, got {indices} indices and \
                 {distances} distances"
            ),
            Self::TooManyRows(rows) => {
                write!(
                    formatter,
                    "{rows} rows cannot be represented by u32 graph indices"
                )
            }
            Self::TooManyEdges(edges) => {
                write!(
                    formatter,
                    "{edges} edges cannot be represented by u32 graph pointers"
                )
            }
            Self::NeighborOutOfBounds {
                row,
                offset,
                index,
                rows,
            } => write!(
                formatter,
                "neighbor {offset} of row {row} has index {index}, outside {rows} rows"
            ),
            Self::DuplicateNeighbor { row, index } => {
                write!(
                    formatter,
                    "row {row} contains duplicate neighbor index {index}"
                )
            }
            Self::NonFiniteDistance {
                row,
                offset,
                distance,
            } => write!(
                formatter,
                "neighbor {offset} of row {row} has non-finite distance {distance}"
            ),
            Self::UnsortedDistances { row, offset } => write!(
                formatter,
                "neighbor distances for row {row} are not sorted at offset {offset}"
            ),
            Self::InvalidLocalConnectivity(value) => {
                write!(
                    formatter,
                    "local connectivity must be finite and non-negative, got {value}"
                )
            }
            Self::InvalidBandwidth(value) => {
                write!(
                    formatter,
                    "bandwidth must be finite and positive, got {value}"
                )
            }
            Self::GraphShape { left, right } => write!(
                formatter,
                "graph shapes differ: {} by {} and {} by {}",
                left.0, left.1, right.0, right.1
            ),
            Self::NonSquareGraph { rows, columns } => {
                write!(formatter, "graph must be square, got {rows} by {columns}")
            }
            Self::InvalidGraphWeight { offset, weight } => write!(
                formatter,
                "graph value at storage offset {offset} is outside [0, 1]: {weight}"
            ),
            Self::InvalidAlpha(alpha) => {
                write!(
                    formatter,
                    "graph blend alpha must be within [0, 1], got {alpha}"
                )
            }
            Self::SparseStructure(error) => write!(formatter, "invalid sparse graph: {error}"),
            Self::InvalidSemanticOption { name, value } => {
                write!(
                    formatter,
                    "semantic graph option {name} must be positive, got {value}"
                )
            }
            Self::Index(error) => write!(formatter, "USearch index operation failed: {error}"),
            Self::SearchResultCount {
                row,
                expected,
                keys,
                distances,
            } => write!(
                formatter,
                "USearch returned {keys} keys and {distances} distances for row {row}, expected \
                 {expected} of each"
            ),
            Self::IndexKeyOutOfBounds { row, key, rows } => write!(
                formatter,
                "USearch returned key {key} for row {row}, outside {rows} sampled rows"
            ),
        }
    }
}

impl Error for GraphError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Index(error) => Some(error),
            Self::InvalidKnnShape { .. }
            | Self::KnnLength { .. }
            | Self::TooManyRows(_)
            | Self::TooManyEdges(_)
            | Self::NeighborOutOfBounds { .. }
            | Self::DuplicateNeighbor { .. }
            | Self::NonFiniteDistance { .. }
            | Self::UnsortedDistances { .. }
            | Self::InvalidLocalConnectivity(_)
            | Self::InvalidBandwidth(_)
            | Self::GraphShape { .. }
            | Self::NonSquareGraph { .. }
            | Self::InvalidGraphWeight { .. }
            | Self::InvalidAlpha(_)
            | Self::SparseStructure(_)
            | Self::InvalidSemanticOption { .. }
            | Self::SearchResultCount { .. }
            | Self::IndexKeyOutOfBounds { .. } => None,
        }
    }
}

impl From<cxx::Exception> for GraphError {
    fn from(error: cxx::Exception) -> Self {
        Self::Index(error)
    }
}
