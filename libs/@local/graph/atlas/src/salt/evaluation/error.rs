use core::{error::Error, fmt};

use crate::salt::hash::ContentHash;

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
    MissingSemanticBaseline {
        value: f64,
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
    MissingCanonicalField {
        value: f64,
    },
    MissingCanonicalMeasurement {
        value: f64,
    },
    CanonicalReportMismatch {
        expected: ContentHash,
        actual: ContentHash,
    },
}

impl fmt::Display for EvaluationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidDomain { minimum, maximum } => write!(
                formatter,
                "relation-condition domain must have zero minimum below a finite maximum, got \
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
            Self::MissingSemanticBaseline { value } => write!(
                formatter,
                "relation-condition ladder must begin at the semantic-only zero condition, got \
                 {value}"
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
            Self::MissingCanonicalField { value } => write!(
                formatter,
                "canonical relation condition {value} has no supplied coordinate field"
            ),
            Self::MissingCanonicalMeasurement { value } => write!(
                formatter,
                "canonical relation condition {value} has no supplied measurement"
            ),
            Self::CanonicalReportMismatch { expected, actual } => write!(
                formatter,
                "canonical measurement report {actual} differs from selected evidence {expected}"
            ),
        }
    }
}

impl Error for EvaluationError {}
