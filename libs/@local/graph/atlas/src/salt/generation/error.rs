use core::{error::Error, fmt};

use camino::Utf8PathBuf;

use crate::salt::{
    activation::ActivationError,
    analytic::AnalyticError,
    evaluation::{ConditionMeasurementError, EvaluationError},
    manifest::ManifestPublishError,
    materialize::BaseArtifactError,
    projector::ProjectorInferenceError,
    release::{ReleaseGateError, ReleasePublishError},
    storage::mmap::ArtifactWriteError,
};

/// A failure while projecting or evaluating a generation condition ladder.
#[derive(Debug)]
pub(crate) enum GenerationError {
    ConditionCount {
        count: usize,
    },
    MissingSemanticBaseline {
        value: f32,
    },
    NonFiniteCondition {
        index: usize,
        value: f32,
    },
    UnorderedCondition {
        index: usize,
        previous: f32,
        value: f32,
    },
    QualityCount {
        conditions: usize,
        quality: usize,
    },
    SignalRows {
        identities: usize,
        importance: usize,
        semantic: usize,
        density: usize,
        labels: usize,
    },
    InvalidLegacyTag {
        value: u16,
    },
    LegacyRowCount {
        identities: usize,
        coordinates: usize,
    },
    LegacyCoordinate {
        row: usize,
        axis: usize,
        value: f64,
    },
    ExistingLegacyExport {
        path: Utf8PathBuf,
    },
    EvidenceHead,
    LegacyIo(std::io::Error),
    LegacyPersist(tempfile::PersistError),
    LegacySerialization(serde_json::Error),
    Projection(ProjectorInferenceError),
    Measurement(ConditionMeasurementError),
    Evaluation(EvaluationError),
    BaseArtifact(BaseArtifactError),
    Analytic(AnalyticError),
    AnalyticArtifact(ArtifactWriteError),
    Manifest(ManifestPublishError),
    ReleaseGate(ReleaseGateError),
    ReleasePublish(ReleasePublishError),
    Activation(ActivationError),
}

impl fmt::Display for GenerationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ConditionCount { count } => write!(
                formatter,
                "generation projection requires between 2 and 32 conditions, got {count}"
            ),
            Self::MissingSemanticBaseline { value } => write!(
                formatter,
                "generation condition ladder must begin at semantic-only zero, got {value}"
            ),
            Self::NonFiniteCondition { index, value } => {
                write!(
                    formatter,
                    "generation condition {index} is non-finite: {value}"
                )
            }
            Self::UnorderedCondition {
                index,
                previous,
                value,
            } => write!(
                formatter,
                "generation condition {index} is {value}, which does not strictly follow \
                 {previous}"
            ),
            Self::QualityCount {
                conditions,
                quality,
            } => write!(
                formatter,
                "generation has {conditions} projected conditions but {quality} quality records"
            ),
            Self::SignalRows {
                identities,
                importance,
                semantic,
                density,
                labels,
            } => write!(
                formatter,
                "canonical generation has {identities} identities, {importance} importance \
                 values, {semantic} semantic priorities, {density} density masses, and {labels} \
                 labels"
            ),
            Self::InvalidLegacyTag { value } => {
                write!(
                    formatter,
                    "legacy layout tag must be at most 100, got {value}"
                )
            }
            Self::LegacyRowCount {
                identities,
                coordinates,
            } => write!(
                formatter,
                "legacy export has {identities} identities and {coordinates} coordinate rows"
            ),
            Self::LegacyCoordinate { row, axis, value } => write!(
                formatter,
                "legacy export coordinate row {row}, axis {axis} cannot be represented as finite \
                 f32: {value}"
            ),
            Self::ExistingLegacyExport { path } => write!(
                formatter,
                "legacy export at {path} differs from the attempted publication"
            ),
            Self::EvidenceHead => formatter
                .write_str("release evidence names a different generation or manifest publication"),
            Self::LegacyIo(error) => write!(formatter, "legacy export I/O failed: {error}"),
            Self::LegacyPersist(error) => {
                write!(formatter, "legacy export publication failed: {error}")
            }
            Self::LegacySerialization(error) => {
                write!(formatter, "legacy export encoding failed: {error}")
            }
            Self::Projection(error) => error.fmt(formatter),
            Self::Measurement(error) => error.fmt(formatter),
            Self::Evaluation(error) => error.fmt(formatter),
            Self::BaseArtifact(error) => error.fmt(formatter),
            Self::Analytic(error) => error.fmt(formatter),
            Self::AnalyticArtifact(error) => error.fmt(formatter),
            Self::Manifest(error) => error.fmt(formatter),
            Self::ReleaseGate(error) => error.fmt(formatter),
            Self::ReleasePublish(error) => error.fmt(formatter),
            Self::Activation(error) => error.fmt(formatter),
        }
    }
}

impl Error for GenerationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Projection(error) => Some(error),
            Self::Measurement(error) => Some(error),
            Self::Evaluation(error) => Some(error),
            Self::BaseArtifact(error) => Some(error),
            Self::Analytic(error) => Some(error),
            Self::AnalyticArtifact(error) => Some(error),
            Self::Manifest(error) => Some(error),
            Self::ReleaseGate(error) => Some(error),
            Self::ReleasePublish(error) => Some(error),
            Self::Activation(error) => Some(error),
            Self::LegacyIo(error) => Some(error),
            Self::LegacyPersist(error) => Some(error),
            Self::LegacySerialization(error) => Some(error),
            Self::ConditionCount { .. }
            | Self::MissingSemanticBaseline { .. }
            | Self::NonFiniteCondition { .. }
            | Self::UnorderedCondition { .. }
            | Self::QualityCount { .. }
            | Self::SignalRows { .. }
            | Self::InvalidLegacyTag { .. }
            | Self::LegacyRowCount { .. }
            | Self::LegacyCoordinate { .. }
            | Self::ExistingLegacyExport { .. } => None,
            Self::EvidenceHead => None,
        }
    }
}

impl From<ProjectorInferenceError> for GenerationError {
    #[inline]
    fn from(error: ProjectorInferenceError) -> Self {
        Self::Projection(error)
    }
}

impl From<ConditionMeasurementError> for GenerationError {
    #[inline]
    fn from(error: ConditionMeasurementError) -> Self {
        Self::Measurement(error)
    }
}

impl From<EvaluationError> for GenerationError {
    #[inline]
    fn from(error: EvaluationError) -> Self {
        Self::Evaluation(error)
    }
}

impl From<BaseArtifactError> for GenerationError {
    #[inline]
    fn from(error: BaseArtifactError) -> Self {
        Self::BaseArtifact(error)
    }
}

impl From<AnalyticError> for GenerationError {
    #[inline]
    fn from(error: AnalyticError) -> Self {
        Self::Analytic(error)
    }
}

impl From<ArtifactWriteError> for GenerationError {
    #[inline]
    fn from(error: ArtifactWriteError) -> Self {
        Self::AnalyticArtifact(error)
    }
}

impl From<ManifestPublishError> for GenerationError {
    #[inline]
    fn from(error: ManifestPublishError) -> Self {
        Self::Manifest(error)
    }
}

impl From<ReleaseGateError> for GenerationError {
    #[inline]
    fn from(error: ReleaseGateError) -> Self {
        Self::ReleaseGate(error)
    }
}

impl From<ReleasePublishError> for GenerationError {
    #[inline]
    fn from(error: ReleasePublishError) -> Self {
        Self::ReleasePublish(error)
    }
}

impl From<ActivationError> for GenerationError {
    #[inline]
    fn from(error: ActivationError) -> Self {
        Self::Activation(error)
    }
}

impl From<std::io::Error> for GenerationError {
    #[inline]
    fn from(error: std::io::Error) -> Self {
        Self::LegacyIo(error)
    }
}

impl From<tempfile::PersistError> for GenerationError {
    #[inline]
    fn from(error: tempfile::PersistError) -> Self {
        Self::LegacyPersist(error)
    }
}

impl From<serde_json::Error> for GenerationError {
    #[inline]
    fn from(error: serde_json::Error) -> Self {
        Self::LegacySerialization(error)
    }
}
