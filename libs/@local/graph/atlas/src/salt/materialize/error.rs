use core::{error::Error, fmt};

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
