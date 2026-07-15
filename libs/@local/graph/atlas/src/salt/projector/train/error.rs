use core::{error::Error, fmt};

use super::ProjectorBatchError;
use crate::salt::projector::{ObjectiveError, ProjectorError, ProjectorInferenceError};

/// An invalid projector training configuration or coordinate-gradient step.
#[derive(Debug, Copy, Clone, PartialEq)]
pub(crate) enum ProjectorTrainingError {
    InvalidLossWeight { name: &'static str, value: f64 },
    InvalidPositiveCoefficient { name: &'static str, value: f64 },
    UnrepresentableCoefficient { name: &'static str, value: f64 },
    InvalidRelationCondition { value: f64 },
    InvalidOptimizerConfig { field: &'static str, value: f64 },
    TrainingBatchCount { expected: usize, actual: usize },
    EmptyTrainingBatch,
    NoSemanticLoss,
    MissingSemanticGradient,
    MissingRelationGradient,
    Projector(ProjectorError),
}

impl fmt::Display for ProjectorTrainingError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidLossWeight { name, value } => {
                write!(
                    formatter,
                    "projector loss weight {name} must be finite and non-negative, got {value}"
                )
            }
            Self::InvalidPositiveCoefficient { name, value } => write!(
                formatter,
                "projector coefficient {name} must be finite and positive, got {value}"
            ),
            Self::UnrepresentableCoefficient { name, value } => write!(
                formatter,
                "projector coefficient {name} cannot be represented as a normal f32 tensor \
                 scalar: {value}"
            ),
            Self::InvalidRelationCondition { value } => write!(
                formatter,
                "projector relation condition must be finite and non-negative, got {value}"
            ),
            Self::InvalidOptimizerConfig { field, value } => write!(
                formatter,
                "projector optimizer field {field} has invalid value {value}"
            ),
            Self::TrainingBatchCount { expected, actual } => write!(
                formatter,
                "projector optimizer expected {expected} batches, received {actual}"
            ),
            Self::EmptyTrainingBatch => {
                formatter.write_str("projector training batch cannot be empty")
            }
            Self::NoSemanticLoss => {
                formatter.write_str("projector training batch has no semantic loss")
            }
            Self::MissingSemanticGradient => {
                formatter.write_str("semantic loss did not produce a coordinate gradient")
            }
            Self::MissingRelationGradient => {
                formatter.write_str("relation loss did not produce a coordinate gradient")
            }
            Self::Projector(error) => error.fmt(formatter),
        }
    }
}

impl Error for ProjectorTrainingError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Projector(error) => Some(error),
            Self::InvalidLossWeight { .. }
            | Self::InvalidPositiveCoefficient { .. }
            | Self::UnrepresentableCoefficient { .. }
            | Self::InvalidRelationCondition { .. }
            | Self::InvalidOptimizerConfig { .. }
            | Self::TrainingBatchCount { .. }
            | Self::EmptyTrainingBatch
            | Self::NoSemanticLoss
            | Self::MissingSemanticGradient
            | Self::MissingRelationGradient => None,
        }
    }
}

impl From<ProjectorError> for ProjectorTrainingError {
    #[inline]
    fn from(error: ProjectorError) -> Self {
        Self::Projector(error)
    }
}

/// A bounded projector sampler could not produce an admissible batch.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ProjectorSamplingError {
    EmptyGraph,
    TooManyPositiveEdges { requested: usize, available: usize },
    NegativePoolExhausted { requested: usize, produced: usize },
    UnorderedProtection,
    UnorderedRelationEdges,
    InvalidNegativeWeight,
}

impl fmt::Display for ProjectorSamplingError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyGraph => formatter.write_str("cannot sample from an empty projector graph"),
            Self::TooManyPositiveEdges {
                requested,
                available,
            } => write!(
                formatter,
                "requested {requested} unique semantic edges from {available} available edges"
            ),
            Self::NegativePoolExhausted {
                requested,
                produced,
            } => write!(
                formatter,
                "ordinary-negative sampler produced {produced} of {requested} requested pairs"
            ),
            Self::UnorderedProtection => {
                formatter.write_str("relation protection pairs must be strictly ordered")
            }
            Self::UnorderedRelationEdges => {
                formatter.write_str("relation attraction edges must be grouped by type")
            }
            Self::InvalidNegativeWeight => {
                formatter.write_str("ordinary-negative weight must be finite and non-negative")
            }
        }
    }
}

impl Error for ProjectorSamplingError {}

/// Invalid detached coordinates or spatial-index output during hard mining.
#[derive(Debug)]
pub(crate) enum HardNegativeError {
    InvalidConfig {
        field: &'static str,
        value: f64,
    },
    EmptyCoordinates,
    NonFiniteCoordinate {
        row: usize,
        axis: usize,
        value: f64,
    },
    CoordinateOverflow {
        row: usize,
        axis: usize,
        value: f64,
    },
    RowCount {
        spatial: usize,
        semantic: usize,
    },
    UnorderedProtection,
    QueryRow {
        row: u32,
        rows: usize,
    },
    Index(cxx::Exception),
    IndexKeyOverflow {
        key: u64,
    },
    InvalidDistance {
        row: u32,
        distance: f32,
    },
    InsufficientCandidates {
        row: u32,
        requested: usize,
        produced: usize,
    },
}

impl fmt::Display for HardNegativeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfig { field, value } => {
                write!(
                    formatter,
                    "hard-negative field {field} has invalid value {value}"
                )
            }
            Self::EmptyCoordinates => {
                formatter.write_str("hard-negative spatial index cannot be empty")
            }
            Self::NonFiniteCoordinate { row, axis, value } => write!(
                formatter,
                "hard-negative coordinate row {row}, axis {axis} is non-finite: {value}"
            ),
            Self::CoordinateOverflow { row, axis, value } => write!(
                formatter,
                "hard-negative coordinate row {row}, axis {axis} cannot be represented as f32: \
                 {value}"
            ),
            Self::RowCount { spatial, semantic } => write!(
                formatter,
                "hard-negative index has {spatial} rows; semantic graph has {semantic}"
            ),
            Self::UnorderedProtection => {
                formatter.write_str("hard-negative protection pairs must be strictly ordered")
            }
            Self::QueryRow { row, rows } => {
                write!(
                    formatter,
                    "hard-negative query row {row} is outside {rows} rows"
                )
            }
            Self::Index(error) => write!(formatter, "hard-negative spatial index failed: {error}"),
            Self::IndexKeyOverflow { key } => {
                write!(
                    formatter,
                    "hard-negative spatial index returned oversized key {key}"
                )
            }
            Self::InvalidDistance { row, distance } => write!(
                formatter,
                "hard-negative spatial index returned invalid distance {distance} for row {row}"
            ),
            Self::InsufficientCandidates {
                row,
                requested,
                produced,
            } => write!(
                formatter,
                "hard-negative row {row} produced {produced} of {requested} requested candidates"
            ),
        }
    }
}

impl Error for HardNegativeError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Index(error) => Some(error),
            Self::InvalidConfig { .. }
            | Self::EmptyCoordinates
            | Self::NonFiniteCoordinate { .. }
            | Self::CoordinateOverflow { .. }
            | Self::RowCount { .. }
            | Self::UnorderedProtection
            | Self::QueryRow { .. }
            | Self::IndexKeyOverflow { .. }
            | Self::InvalidDistance { .. }
            | Self::InsufficientCandidates { .. } => None,
        }
    }
}

impl From<cxx::Exception> for HardNegativeError {
    #[inline]
    fn from(error: cxx::Exception) -> Self {
        Self::Index(error)
    }
}

/// A failure in adaptive projector sampling, refresh, or optimization.
#[derive(Debug)]
pub(crate) enum ProjectorFitError {
    ConditionCount {
        count: usize,
    },
    InvalidCondition {
        index: usize,
        value: f64,
    },
    UnorderedCondition {
        index: usize,
        previous: f64,
        value: f64,
    },
    InvalidPlanValue {
        field: &'static str,
        value: f64,
    },
    InsufficientTrainingSteps {
        steps: usize,
        conditions: usize,
    },
    Training(ProjectorTrainingError),
    Batch(ProjectorBatchError),
    Sampling(ProjectorSamplingError),
    HardNegative(HardNegativeError),
    Inference(ProjectorInferenceError),
    Objective(ObjectiveError),
}

impl fmt::Display for ProjectorFitError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ConditionCount { count } => write!(
                formatter,
                "projector batch plan requires between 2 and 32 conditions, got {count}"
            ),
            Self::InvalidCondition { index, value } => write!(
                formatter,
                "projector batch-plan condition {index} must be finite and non-negative, got \
                 {value}"
            ),
            Self::UnorderedCondition {
                index,
                previous,
                value,
            } => write!(
                formatter,
                "projector batch-plan condition {index} is {value}, which does not strictly \
                 follow {previous}"
            ),
            Self::InvalidPlanValue { field, value } => {
                write!(
                    formatter,
                    "projector batch-plan field {field} is invalid: {value}"
                )
            }
            Self::InsufficientTrainingSteps { steps, conditions } => write!(
                formatter,
                "projector training has {steps} steps for {conditions} conditions; every \
                 condition requires at least one step"
            ),
            Self::Training(error) => error.fmt(formatter),
            Self::Batch(error) => error.fmt(formatter),
            Self::Sampling(error) => error.fmt(formatter),
            Self::HardNegative(error) => error.fmt(formatter),
            Self::Inference(error) => error.fmt(formatter),
            Self::Objective(error) => error.fmt(formatter),
        }
    }
}

impl Error for ProjectorFitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Training(error) => Some(error),
            Self::Batch(error) => Some(error),
            Self::Sampling(error) => Some(error),
            Self::HardNegative(error) => Some(error),
            Self::Inference(error) => Some(error),
            Self::Objective(error) => Some(error),
            Self::ConditionCount { .. }
            | Self::InvalidCondition { .. }
            | Self::UnorderedCondition { .. }
            | Self::InvalidPlanValue { .. }
            | Self::InsufficientTrainingSteps { .. } => None,
        }
    }
}

impl From<ProjectorTrainingError> for ProjectorFitError {
    #[inline]
    fn from(error: ProjectorTrainingError) -> Self {
        Self::Training(error)
    }
}

impl From<ProjectorBatchError> for ProjectorFitError {
    #[inline]
    fn from(error: ProjectorBatchError) -> Self {
        Self::Batch(error)
    }
}

impl From<ProjectorSamplingError> for ProjectorFitError {
    #[inline]
    fn from(error: ProjectorSamplingError) -> Self {
        Self::Sampling(error)
    }
}

impl From<HardNegativeError> for ProjectorFitError {
    #[inline]
    fn from(error: HardNegativeError) -> Self {
        Self::HardNegative(error)
    }
}

impl From<ProjectorInferenceError> for ProjectorFitError {
    #[inline]
    fn from(error: ProjectorInferenceError) -> Self {
        Self::Inference(error)
    }
}

impl From<ObjectiveError> for ProjectorFitError {
    #[inline]
    fn from(error: ObjectiveError) -> Self {
        Self::Objective(error)
    }
}
