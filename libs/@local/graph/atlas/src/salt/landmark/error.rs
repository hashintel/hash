use core::{error::Error, fmt};

use super::select::Stratum;

/// Invalid landmark selection input or an unsatisfied capacity constraint.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum LandmarkError {
    EmptyCorpus,
    InvalidRetainedFraction {
        value: f64,
    },
    InvalidSamplingWeight {
        index: usize,
        value: f64,
    },
    DuplicateRow {
        row: u32,
    },
    DuplicateMinimum {
        stratum: Stratum,
    },
    MinimumExceedsCapacity {
        requested: usize,
        capacity: usize,
    },
    InsufficientSubgroup {
        stratum: Stratum,
        required: usize,
        available: usize,
    },
}

impl fmt::Display for LandmarkError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyCorpus => formatter.write_str("landmark corpus is empty"),
            Self::InvalidRetainedFraction { value } => write!(
                formatter,
                "retained landmark fraction must be finite and lie in [0, 1], got {value}"
            ),
            Self::InvalidSamplingWeight { index, value } => write!(
                formatter,
                "landmark candidate {index} has non-positive or non-finite sampling weight {value}"
            ),
            Self::DuplicateRow { row } => {
                write!(formatter, "generation row {row} occurs more than once")
            }
            Self::DuplicateMinimum { stratum } => {
                write!(
                    formatter,
                    "subgroup minimum for {stratum} is declared more than once"
                )
            }
            Self::MinimumExceedsCapacity {
                requested,
                capacity,
            } => write!(
                formatter,
                "subgroup minimums request {requested} slots but landmark capacity is {capacity}"
            ),
            Self::InsufficientSubgroup {
                stratum,
                required,
                available,
            } => write!(
                formatter,
                "subgroup {stratum} requires {required} landmarks but has {available} candidates"
            ),
        }
    }
}

impl Error for LandmarkError {}
