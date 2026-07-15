use core::{error::Error, fmt};

use crate::salt::storage::mmap::ArtifactWriteError;

/// An invalid importance-ranking input or grid schedule.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ImportanceError {
    Empty,
    NonFiniteBounds {
        axis: usize,
    },
    DegenerateBounds {
        axis: usize,
    },
    EmptyGridSchedule,
    InvalidGridDepth {
        index: usize,
        depth: u8,
    },
    UnorderedGridDepth {
        index: usize,
        previous: u8,
        depth: u8,
    },
    NonFiniteCoordinate {
        row: usize,
        axis: usize,
        value: f64,
    },
    CoordinateOutOfBounds {
        row: usize,
        axis: usize,
        value: f64,
    },
    NonFinitePriority {
        row: usize,
        importance: f64,
        semantic: f64,
    },
    DuplicateRow {
        row: u32,
    },
    BucketOverflow {
        buckets: usize,
    },
}

impl fmt::Display for ImportanceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => formatter.write_str("importance ranking requires at least one point"),
            Self::NonFiniteBounds { axis } => {
                write!(formatter, "coordinate bounds on axis {axis} must be finite")
            }
            Self::DegenerateBounds { axis } => write!(
                formatter,
                "coordinate bounds on axis {axis} must have positive extent"
            ),
            Self::EmptyGridSchedule => {
                formatter.write_str("importance ranking requires at least one grid depth")
            }
            Self::InvalidGridDepth { index, depth } => write!(
                formatter,
                "grid depth at index {index} is {depth}; depths must be at most 16"
            ),
            Self::UnorderedGridDepth {
                index,
                previous,
                depth,
            } => write!(
                formatter,
                "grid depth at index {index} is {depth}, which does not follow {previous} in \
                 strictly increasing order"
            ),
            Self::NonFiniteCoordinate { row, axis, value } => write!(
                formatter,
                "coordinate at row {row}, axis {axis} is non-finite: {value}"
            ),
            Self::CoordinateOutOfBounds { row, axis, value } => write!(
                formatter,
                "coordinate at row {row}, axis {axis} lies outside the configured bounds: {value}"
            ),
            Self::NonFinitePriority {
                row,
                importance,
                semantic,
            } => write!(
                formatter,
                "priority at row {row} must be finite: importance={importance}, \
                 semantic={semantic}"
            ),
            Self::DuplicateRow { row } => write!(
                formatter,
                "generation row {row} appears more than once in importance input"
            ),
            Self::BucketOverflow { buckets } => write!(
                formatter,
                "{buckets} importance buckets cannot be represented by u16"
            ),
        }
    }
}

impl Error for ImportanceError {}

/// Invalid base-artifact rows or failed immutable publication.
#[derive(Debug)]
pub(crate) enum BaseArtifactError {
    Empty,
    PriorityRows {
        identities: usize,
        coordinates: usize,
        importance: usize,
        semantic: usize,
    },
    RowCount {
        identities: usize,
        coordinates: usize,
        ranked: usize,
    },
    DuplicateRow {
        row: u32,
    },
    MissingRow {
        row: u32,
    },
    UnknownRow {
        row: u32,
        row_count: usize,
    },
    UnorderedBucket {
        index: usize,
        previous: u16,
        actual: u16,
    },
    NonFiniteCoordinate {
        row: u32,
        axis: usize,
        value: f64,
    },
    CoordinateOverflow {
        row: u32,
        axis: usize,
        value: f64,
    },
    Importance(ImportanceError),
    Artifact(ArtifactWriteError),
}

impl fmt::Display for BaseArtifactError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => formatter.write_str("base artifact cannot be empty"),
            Self::PriorityRows {
                identities,
                coordinates,
                importance,
                semantic,
            } => write!(
                formatter,
                "canonical materialization has {identities} identities, {coordinates} \
                 coordinates, {importance} importance values, and {semantic} semantic priorities"
            ),
            Self::RowCount {
                identities,
                coordinates,
                ranked,
            } => write!(
                formatter,
                "base artifact has {identities} identities, {coordinates} coordinates, and \
                 {ranked} ranked rows"
            ),
            Self::DuplicateRow { row } => {
                write!(formatter, "base artifact repeats generation row {row}")
            }
            Self::MissingRow { row } => {
                write!(formatter, "base artifact omits generation row {row}")
            }
            Self::UnknownRow { row, row_count } => write!(
                formatter,
                "base artifact references generation row {row}, outside row count {row_count}"
            ),
            Self::UnorderedBucket {
                index,
                previous,
                actual,
            } => write!(
                formatter,
                "base artifact bucket {actual} at index {index} follows bucket {previous}"
            ),
            Self::NonFiniteCoordinate { row, axis, value } => write!(
                formatter,
                "base coordinate row {row}, axis {axis} is non-finite: {value}"
            ),
            Self::CoordinateOverflow { row, axis, value } => write!(
                formatter,
                "base coordinate row {row}, axis {axis} cannot be represented as f32: {value}"
            ),
            Self::Importance(error) => error.fmt(formatter),
            Self::Artifact(error) => error.fmt(formatter),
        }
    }
}

impl Error for BaseArtifactError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Importance(error) => Some(error),
            Self::Artifact(error) => Some(error),
            Self::Empty
            | Self::PriorityRows { .. }
            | Self::RowCount { .. }
            | Self::DuplicateRow { .. }
            | Self::MissingRow { .. }
            | Self::UnknownRow { .. }
            | Self::UnorderedBucket { .. }
            | Self::NonFiniteCoordinate { .. }
            | Self::CoordinateOverflow { .. } => None,
        }
    }
}

impl From<ArtifactWriteError> for BaseArtifactError {
    #[inline]
    fn from(error: ArtifactWriteError) -> Self {
        Self::Artifact(error)
    }
}
