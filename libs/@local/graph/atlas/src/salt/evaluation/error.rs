use core::{error::Error, fmt};

/// An invalid relation-condition ladder or canonical selection.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum EvaluationError {
    InvalidDomain {
        minimum: f64,
        maximum: f64,
    },
    TooFewCandidates {
        count: usize,
    },
    TooManyCandidates {
        count: usize,
        maximum: usize,
    },
    NonFiniteCondition {
        index: usize,
        value: f64,
    },
    ConditionOutOfDomain {
        index: usize,
        value: f64,
    },
    UnorderedCondition {
        index: usize,
        previous: f64,
        value: f64,
    },
    UnknownCanonical {
        value: f64,
    },
    FailedCanonicalEvidence {
        value: f64,
        criterion: &'static str,
    },
}

impl fmt::Display for EvaluationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidDomain { minimum, maximum } => write!(
                formatter,
                "relation-condition domain must have finite minimum below maximum, got \
                 [{minimum}, {maximum}]"
            ),
            Self::TooFewCandidates { count } => write!(
                formatter,
                "relation-condition ladder requires at least two candidates, got {count}"
            ),
            Self::TooManyCandidates { count, maximum } => write!(
                formatter,
                "relation-condition ladder has {count} candidates; capacity is {maximum}"
            ),
            Self::NonFiniteCondition { index, value } => {
                write!(
                    formatter,
                    "relation condition at index {index} is non-finite: {value}"
                )
            }
            Self::ConditionOutOfDomain { index, value } => write!(
                formatter,
                "relation condition at index {index} lies outside its domain: {value}"
            ),
            Self::UnorderedCondition {
                index,
                previous,
                value,
            } => write!(
                formatter,
                "relation condition at index {index} is {value}, which does not strictly follow \
                 {previous}"
            ),
            Self::UnknownCanonical { value } => write!(
                formatter,
                "canonical relation condition {value} is absent from the evaluated ladder"
            ),
            Self::FailedCanonicalEvidence { value, criterion } => write!(
                formatter,
                "relation condition {value} failed canonical-selection criterion {criterion}"
            ),
        }
    }
}

impl Error for EvaluationError {}
