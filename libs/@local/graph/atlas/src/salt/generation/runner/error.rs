use core::{error::Error, fmt};
use std::io;

use error_stack::Report;
use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};

use crate::salt::{
    classifier::ClassifierError,
    generation::GenerationError,
    graph::SemanticGraphError,
    identity::ArtifactOrdinal,
    landmark::{LandmarkAssignmentError, LandmarkError, LandmarkFitError},
    manifest::ManifestError,
    projector::{ProjectorCheckpointError, ProjectorFitError, ProjectorInferenceError},
    relation::RelationIndexError,
    release::GateEvidenceError,
    storage::mmap::{ArtifactMapError, ArtifactWriteError},
};

/// A failed canonical generation run.
#[derive(Debug)]
pub(crate) enum CanonicalGenerationError {
    InputRows {
        input: &'static str,
        expected: usize,
        actual: usize,
    },
    RelationType {
        relation_type: VersionedUrl,
    },
    RelationConfidence {
        link: EntityId,
    },
    RelationPolicyCount {
        expected: usize,
        actual: usize,
    },
    RelationOrdinal {
        relation_type: VersionedUrl,
        ordinal: ArtifactOrdinal,
        policies: usize,
    },
    DuplicateRelationOrdinal {
        ordinal: ArtifactOrdinal,
    },
    RelationPolicyOrdinal {
        index: usize,
        actual: ArtifactOrdinal,
    },
    SecurityPolicy,
    ExistingModelArtifact,
    Io(io::Error),
    Map(ArtifactMapError),
    Classifier(ClassifierError),
    Graph(SemanticGraphError),
    Relation(RelationIndexError),
    Landmark(LandmarkError),
    LandmarkAssignment(LandmarkAssignmentError),
    LandmarkFit(LandmarkFitError),
    Artifact(ArtifactWriteError),
    ProjectorFit(ProjectorFitError),
    ProjectorInference(ProjectorInferenceError),
    ProjectorCheckpoint(ProjectorCheckpointError),
    Manifest(Report<ManifestError>),
    Generation(GenerationError),
    Evidence(GateEvidenceError),
}

impl fmt::Display for CanonicalGenerationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InputRows {
                input,
                expected,
                actual,
            } => write!(
                formatter,
                "generation requires {expected} {input} rows, got {actual}"
            ),
            Self::RelationType { relation_type } => write!(
                formatter,
                "security-admitted relation type {relation_type} has no dense policy ordinal"
            ),
            Self::RelationConfidence { link } => {
                write!(
                    formatter,
                    "security-admitted link {link} has no frozen confidence"
                )
            }
            Self::RelationPolicyCount { expected, actual } => write!(
                formatter,
                "generation requires {expected} dense relation policies, got {actual}"
            ),
            Self::RelationOrdinal {
                relation_type,
                ordinal,
                policies,
            } => write!(
                formatter,
                "relation type {relation_type} has ordinal {ordinal}, outside {policies} policies"
            ),
            Self::DuplicateRelationOrdinal { ordinal } => {
                write!(
                    formatter,
                    "relation ordinal {ordinal} is assigned more than once"
                )
            }
            Self::RelationPolicyOrdinal { index, actual } => write!(
                formatter,
                "relation policy at dense index {index} declares ordinal {actual}"
            ),
            Self::SecurityPolicy => formatter
                .write_str("manifest relation security metadata differs from enforced admission"),
            Self::ExistingModelArtifact => {
                formatter.write_str("existing immutable model artifact has different content")
            }
            Self::Io(error) => write!(formatter, "generation storage failed: {error}"),
            Self::Map(error) => error.fmt(formatter),
            Self::Classifier(error) => error.fmt(formatter),
            Self::Graph(error) => error.fmt(formatter),
            Self::Relation(error) => error.fmt(formatter),
            Self::Landmark(error) => error.fmt(formatter),
            Self::LandmarkAssignment(error) => error.fmt(formatter),
            Self::LandmarkFit(error) => error.fmt(formatter),
            Self::Artifact(error) => error.fmt(formatter),
            Self::ProjectorFit(error) => error.fmt(formatter),
            Self::ProjectorInference(error) => error.fmt(formatter),
            Self::ProjectorCheckpoint(error) => error.fmt(formatter),
            Self::Manifest(error) => error.fmt(formatter),
            Self::Generation(error) => error.fmt(formatter),
            Self::Evidence(error) => error.fmt(formatter),
        }
    }
}

impl Error for CanonicalGenerationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Map(error) => Some(error),
            Self::Classifier(error) => Some(error),
            Self::Graph(error) => Some(error),
            Self::Relation(error) => Some(error),
            Self::Landmark(error) => Some(error),
            Self::LandmarkAssignment(error) => Some(error),
            Self::LandmarkFit(error) => Some(error),
            Self::Artifact(error) => Some(error),
            Self::ProjectorFit(error) => Some(error),
            Self::ProjectorInference(error) => Some(error),
            Self::ProjectorCheckpoint(error) => Some(error),
            Self::Generation(error) => Some(error),
            Self::Evidence(error) => Some(error),
            Self::InputRows { .. }
            | Self::RelationType { .. }
            | Self::RelationConfidence { .. }
            | Self::RelationPolicyCount { .. }
            | Self::RelationOrdinal { .. }
            | Self::DuplicateRelationOrdinal { .. }
            | Self::RelationPolicyOrdinal { .. }
            | Self::SecurityPolicy
            | Self::ExistingModelArtifact
            | Self::Manifest(_) => None,
        }
    }
}

macro_rules! from_error {
    ($source:ty, $variant:ident) => {
        impl From<$source> for CanonicalGenerationError {
            #[inline]
            fn from(error: $source) -> Self {
                Self::$variant(error)
            }
        }
    };
}

from_error!(io::Error, Io);
from_error!(ArtifactMapError, Map);
from_error!(ClassifierError, Classifier);
from_error!(SemanticGraphError, Graph);
from_error!(RelationIndexError, Relation);
from_error!(LandmarkError, Landmark);
from_error!(LandmarkAssignmentError, LandmarkAssignment);
from_error!(LandmarkFitError, LandmarkFit);
from_error!(ArtifactWriteError, Artifact);
from_error!(ProjectorFitError, ProjectorFit);
from_error!(ProjectorInferenceError, ProjectorInference);
from_error!(ProjectorCheckpointError, ProjectorCheckpoint);
from_error!(Report<ManifestError>, Manifest);
from_error!(GenerationError, Generation);
from_error!(GateEvidenceError, Evidence);
