//! Condition-ladder rejection errors.

use core::{error::Error, fmt};

use crate::math::NonNegative;

/// A rejected condition schedule.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ConditionsError {
    /// Fewer than two rungs: nothing to compare across.
    TooFew {
        /// Rungs offered.
        count: usize,
    },
    /// The first rung is not the exact zero-condition value `0.0`.
    BaselineNotZero {
        /// The offered first rung.
        value: NonNegative,
    },
    /// A rung does not exceed its predecessor.
    Unordered {
        /// Position of the rejected rung.
        index: usize,
        /// The predecessor it fails to exceed.
        previous: NonNegative,
        /// The offered value.
        value: NonNegative,
    },
}

impl fmt::Display for ConditionsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::TooFew { count } => {
                write!(
                    fmt,
                    "a condition schedule needs at least two rungs, got {count}"
                )
            }
            Self::BaselineNotZero { value } => {
                write!(
                    fmt,
                    "the first rung must be the exact zero-condition value 0.0, got {value}"
                )
            }
            Self::Unordered {
                index,
                previous,
                value,
            } => {
                write!(
                    fmt,
                    "rung {index} ({value}) does not exceed its predecessor ({previous})"
                )
            }
        }
    }
}

impl Error for ConditionsError {}

/// A rejected ladder measurement input.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum LadderError {
    /// The field count does not match the schedule.
    FieldCount {
        /// Rungs in the schedule.
        conditions: usize,
        /// Fields offered.
        fields: usize,
    },
    /// A field's row count differs from the baseline field's.
    RowMismatch {
        /// Position of the rejected field.
        index: usize,
        /// The rejected field's row count.
        rows: usize,
        /// The baseline field's row count.
        expected: usize,
    },
    /// A rung's field has no Procrustes alignment onto the compared field.
    ///
    /// Its points are coincident or the covariance cancels exactly.
    Degenerate {
        /// Position of the unalignable field.
        index: usize,
        /// Position of the compared field.
        against: usize,
    },
}

impl fmt::Display for LadderError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::FieldCount { conditions, fields } => {
                write!(
                    fmt,
                    "the schedule has {conditions} rungs but {fields} fields were offered"
                )
            }
            Self::RowMismatch {
                index,
                rows,
                expected,
            } => {
                write!(
                    fmt,
                    "field {index} has {rows} rows; the baseline has {expected}"
                )
            }
            Self::Degenerate { index, against } => {
                write!(
                    fmt,
                    "field {index} has no similarity alignment onto field {against}"
                )
            }
        }
    }
}

impl Error for LadderError {}

/// A rejected canonical selection.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum CanonicalError {
    /// The requested value is not a rung of the measured ladder.
    UnknownRung {
        /// The requested condition.
        value: NonNegative,
    },
}

impl fmt::Display for CanonicalError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Self::UnknownRung { value } => {
                write!(fmt, "condition {value} is not a rung of the ladder")
            }
        }
    }
}

impl Error for CanonicalError {}
