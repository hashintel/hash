//! Semantic-neighbor construction and audit errors.

use core::{error::Error, fmt};

/// An invalid representation, neighbor result, backend operation, or audit.
#[derive(Debug)]
pub(crate) enum SemanticGraphError {
    EmptyCorpus,
    EmbeddingLength {
        actual: usize,
        dimensions: usize,
    },
    TooManyRows {
        rows: usize,
    },
    NonFiniteEmbedding {
        row: usize,
        component: usize,
    },
    EmbeddingNorm {
        row: usize,
        squared_norm: f64,
    },
    InvalidNeighborCount {
        rows: usize,
        neighbors: usize,
    },
    TooManyNeighborEntries {
        rows: usize,
        neighbors: usize,
    },
    NeighborStorageLength {
        expected: usize,
        indices: usize,
        distances: usize,
    },
    Index(cxx::Exception),
    IndexResultLength {
        requested: usize,
        keys: usize,
        distances: usize,
    },
    IndexKeyOverflow {
        key: u64,
    },
    SearchCount {
        row: usize,
        expected_at_least: usize,
        actual: usize,
    },
    NeighborOutOfBounds {
        row: usize,
        neighbor: u64,
        rows: usize,
    },
    NonFiniteDistance {
        row: usize,
        neighbor: u32,
        distance: f32,
    },
    DistanceOutOfRange {
        row: usize,
        neighbor: u32,
        distance: f32,
    },
    DuplicateNeighbor {
        row: usize,
        neighbor: u32,
    },
    SelfNeighbor {
        row: usize,
    },
    UnsortedNeighbors {
        row: usize,
        offset: usize,
    },
    AuditRowOutOfBounds {
        row: u32,
        rows: usize,
    },
    DuplicateAuditRow {
        row: u32,
    },
    AuditCandidateCount {
        rows: usize,
        candidates: usize,
    },
    AuditCandidateRow {
        row: u32,
        rows: usize,
    },
    DuplicateAuditCandidateRow {
        row: u32,
    },
    EmptyAuditSample,
    RecallBelowThreshold {
        actual: f64,
        required: f64,
    },
}

impl fmt::Display for SemanticGraphError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyCorpus => formatter.write_str("semantic corpus is empty"),
            Self::EmbeddingLength { actual, dimensions } => write!(
                formatter,
                "{actual} projector components do not form complete {dimensions}-component rows"
            ),
            Self::TooManyRows { rows } => {
                write!(formatter, "{rows} semantic rows exceed u32 indexing")
            }
            Self::NonFiniteEmbedding { row, component } => write!(
                formatter,
                "projector embedding row {row} component {component} is not finite"
            ),
            Self::EmbeddingNorm { row, squared_norm } => write!(
                formatter,
                "projector embedding row {row} has squared norm {squared_norm}, exceeding the \
                 normalized-prefix bound"
            ),
            Self::InvalidNeighborCount { rows, neighbors } => write!(
                formatter,
                "cannot store {neighbors} non-self neighbors for {rows} semantic rows"
            ),
            Self::TooManyNeighborEntries { rows, neighbors } => write!(
                formatter,
                "{rows} rows by {neighbors} neighbors exceed addressable storage"
            ),
            Self::NeighborStorageLength {
                expected,
                indices,
                distances,
            } => write!(
                formatter,
                "neighbor storage requires {expected} entries, found {indices} indices and \
                 {distances} distances"
            ),
            Self::Index(error) => write!(formatter, "semantic index operation failed: {error}"),
            Self::IndexResultLength {
                requested,
                keys,
                distances,
            } => write!(
                formatter,
                "semantic index returned {keys} keys and {distances} distances for {requested} \
                 requested neighbors"
            ),
            Self::IndexKeyOverflow { key } => {
                write!(
                    formatter,
                    "semantic index key {key} exceeds u32 row indexing"
                )
            }
            Self::SearchCount {
                row,
                expected_at_least,
                actual,
            } => write!(
                formatter,
                "search for row {row} returned {actual} usable neighbors; expected at least \
                 {expected_at_least}"
            ),
            Self::NeighborOutOfBounds {
                row,
                neighbor,
                rows,
            } => write!(
                formatter,
                "search for row {row} returned neighbor {neighbor}, outside {rows} rows"
            ),
            Self::NonFiniteDistance {
                row,
                neighbor,
                distance,
            } => write!(
                formatter,
                "search for row {row} returned non-finite distance {distance} for neighbor \
                 {neighbor}"
            ),
            Self::DistanceOutOfRange {
                row,
                neighbor,
                distance,
            } => write!(
                formatter,
                "search for row {row} returned cosine distance {distance} outside [0, 2] for \
                 neighbor {neighbor}"
            ),
            Self::DuplicateNeighbor { row, neighbor } => {
                write!(
                    formatter,
                    "search for row {row} returned neighbor {neighbor} more than once"
                )
            }
            Self::SelfNeighbor { row } => {
                write!(formatter, "semantic neighbor row {row} contains itself")
            }
            Self::UnsortedNeighbors { row, offset } => write!(
                formatter,
                "semantic neighbor row {row} is not sorted at offset {offset}"
            ),
            Self::AuditRowOutOfBounds { row, rows } => {
                write!(formatter, "audit row {row} is outside {rows} semantic rows")
            }
            Self::DuplicateAuditRow { row } => {
                write!(formatter, "semantic recall audit repeats row {row}")
            }
            Self::AuditCandidateCount { rows, candidates } => write!(
                formatter,
                "stratified semantic audit has {candidates} candidates for {rows} rows"
            ),
            Self::AuditCandidateRow { row, rows } => write!(
                formatter,
                "stratified semantic-audit candidate row {row} is outside {rows} rows"
            ),
            Self::DuplicateAuditCandidateRow { row } => write!(
                formatter,
                "stratified semantic-audit candidate row {row} appears more than once"
            ),
            Self::EmptyAuditSample => formatter.write_str("semantic recall audit sample is empty"),
            Self::RecallBelowThreshold { actual, required } => write!(
                formatter,
                "semantic ANN recall {actual:.6} is below required {required:.6}"
            ),
        }
    }
}

impl Error for SemanticGraphError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Index(error) => Some(error),
            Self::EmptyCorpus
            | Self::EmbeddingLength { .. }
            | Self::TooManyRows { .. }
            | Self::NonFiniteEmbedding { .. }
            | Self::EmbeddingNorm { .. }
            | Self::InvalidNeighborCount { .. }
            | Self::TooManyNeighborEntries { .. }
            | Self::NeighborStorageLength { .. }
            | Self::IndexResultLength { .. }
            | Self::IndexKeyOverflow { .. }
            | Self::SearchCount { .. }
            | Self::NeighborOutOfBounds { .. }
            | Self::NonFiniteDistance { .. }
            | Self::DistanceOutOfRange { .. }
            | Self::DuplicateNeighbor { .. }
            | Self::SelfNeighbor { .. }
            | Self::UnsortedNeighbors { .. }
            | Self::AuditRowOutOfBounds { .. }
            | Self::DuplicateAuditRow { .. }
            | Self::AuditCandidateCount { .. }
            | Self::AuditCandidateRow { .. }
            | Self::DuplicateAuditCandidateRow { .. }
            | Self::EmptyAuditSample
            | Self::RecallBelowThreshold { .. } => None,
        }
    }
}

impl From<cxx::Exception> for SemanticGraphError {
    #[inline]
    fn from(error: cxx::Exception) -> Self {
        Self::Index(error)
    }
}
