use core::{error::Error, fmt};
use std::io;

use error_stack::Report;
use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};

use crate::salt::{
    classifier::ClassifierError,
    generation::{GenerationError, PersistenceComparisonError},
    graph::SemanticGraphError,
    identity::ArtifactOrdinal,
    landmark::{LandmarkAssignmentError, LandmarkError, LandmarkFitError},
    manifest::{ArtifactRole, ManifestError},
    projector::{ProjectorCheckpointError, ProjectorFitError, ProjectorInferenceError},
    relation::RelationIndexError,
    release::{GateEvidenceError, ReleaseHead},
    representation::{RepresentationAuditError, RepresentationError},
    snapshot::SnapshotError,
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
    SelectedEditionIdentity {
        row: usize,
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
    RelationPolicyCapacity {
        count: usize,
    },
    CoincidentGateThreshold {
        field: &'static str,
        value: f64,
    },
    StratificationRow {
        position: usize,
        row: u32,
    },
    StratificationRole {
        row: u32,
        expected: u32,
        actual: u32,
    },
    AnchorRow {
        row: u32,
        rows: usize,
    },
    AnchorScalar {
        row: u32,
        field: &'static str,
        value: f64,
    },
    StrengthHeadUnsupported,
    NonUnitStrengthWithoutHead {
        relation: ArtifactOrdinal,
        strength: f64,
    },
    ManifestContractArtifacts {
        actual: usize,
    },
    ManifestContractVersion {
        actual: u32,
    },
    ManifestContractVariantCount {
        declared: usize,
        entries: usize,
        maximum: usize,
    },
    ManifestContractCanonical,
    SnapshotProvenance,
    UnsupportedGenerationBackend {
        actual: String,
    },
    SecurityPolicy,
    ActivationConflict {
        actual: Option<ReleaseHead>,
    },
    ReloadMissing,
    ReloadMismatch,
    ReproductionManifest,
    ReproductionEvidence,
    ReproductionArtifact {
        role: ArtifactRole,
    },
    ExistingModelArtifact,
    Io(io::Error),
    Map(ArtifactMapError),
    Representation(RepresentationError),
    RepresentationAudit(RepresentationAuditError),
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
    Persistence(PersistenceComparisonError),
    Evidence(GateEvidenceError),
    Snapshot(Report<SnapshotError>),
}

impl fmt::Display for CanonicalGenerationError {
    #[expect(
        clippy::too_many_lines,
        reason = "the display implementation exhaustively renders the typed generation failure \
                  surface"
    )]
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
            Self::SelectedEditionIdentity { row } => write!(
                formatter,
                "selected entity edition at generation row {row} names a different entity"
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
            Self::RelationPolicyCapacity { count } => write!(
                formatter,
                "generation contains {count} relation policies, exceeding the packed ordinal \
                 domain",
            ),
            Self::CoincidentGateThreshold { field, value } => write!(
                formatter,
                "generation Coincident gate {field} threshold is outside [0, 1]: {value}",
            ),
            Self::StratificationRow { position, row } => write!(
                formatter,
                "representation stratification position {position} contains generation row {row}",
            ),
            Self::StratificationRole {
                row,
                expected,
                actual,
            } => write!(
                formatter,
                "representation stratification row {row} has role {actual}, expected {expected}",
            ),
            Self::AnchorRow { row, rows } => {
                write!(
                    formatter,
                    "anchor row {row} is outside the {rows}-row corpus"
                )
            }
            Self::AnchorScalar { row, field, value } => write!(
                formatter,
                "anchor {field} for row {row} must be finite, f32-representable, and non-negative \
                 where required; got {value}",
            ),
            Self::StrengthHeadUnsupported => formatter
                .write_str("the initial M0 profile requires the neutral relation-strength control"),
            Self::NonUnitStrengthWithoutHead { relation, strength } => write!(
                formatter,
                "relation {relation} has free strength {strength} without a derived strength head",
            ),
            Self::ManifestContractArtifacts { actual } => write!(
                formatter,
                "generation contract contains {actual} caller-authored output artifacts",
            ),
            Self::ManifestContractVersion { actual } => {
                write!(
                    formatter,
                    "generation contract has unsupported format version {actual}"
                )
            }
            Self::ManifestContractVariantCount {
                declared,
                entries,
                maximum,
            } => write!(
                formatter,
                "generation contract declares {declared} variants, contains {entries}, and allows \
                 {maximum}; M0 requires one canonical variant",
            ),
            Self::ManifestContractCanonical => {
                formatter.write_str("generation contract does not contain the canonical M0 variant")
            }
            Self::SnapshotProvenance => formatter.write_str(
                "permission queries and generation inputs name different temporal snapshots",
            ),
            Self::UnsupportedGenerationBackend { actual } => write!(
                formatter,
                "M0 generation requires autodiff<candle<cpu>>, got {actual}"
            ),
            Self::SecurityPolicy => formatter
                .write_str("manifest relation security metadata differs from enforced admission"),
            Self::ActivationConflict { actual } => match actual {
                Some(actual) => write!(
                    formatter,
                    "atlas activation compare-and-swap conflicted with active head {actual:?}"
                ),
                None => formatter
                    .write_str("atlas activation compare-and-swap expected an active generation"),
            },
            Self::ReloadMissing => formatter
                .write_str("newly activated atlas generation was absent during restart loading"),
            Self::ReloadMismatch => formatter.write_str(
                "restart loading returned an atlas generation other than the activated release",
            ),
            Self::ReproductionManifest => {
                formatter.write_str("independent generation runs produced different manifests")
            }
            Self::ReproductionEvidence => formatter
                .write_str("independent generation runs produced different gate measurements"),
            Self::ReproductionArtifact { role } => write!(
                formatter,
                "independent generation runs produced different {role} bytes"
            ),
            Self::ExistingModelArtifact => {
                formatter.write_str("existing immutable model artifact has different content")
            }
            Self::Io(error) => write!(formatter, "generation storage failed: {error}"),
            Self::Map(error) => error.fmt(formatter),
            Self::Representation(error) => error.fmt(formatter),
            Self::RepresentationAudit(error) => error.fmt(formatter),
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
            Self::Persistence(error) => error.fmt(formatter),
            Self::Evidence(error) => error.fmt(formatter),
            Self::Snapshot(error) => error.fmt(formatter),
        }
    }
}

impl Error for CanonicalGenerationError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Map(error) => Some(error),
            Self::Representation(error) => Some(error),
            Self::RepresentationAudit(error) => Some(error),
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
            Self::Persistence(error) => Some(error),
            Self::Evidence(error) => Some(error),
            Self::InputRows { .. }
            | Self::SelectedEditionIdentity { .. }
            | Self::RelationType { .. }
            | Self::RelationConfidence { .. }
            | Self::RelationPolicyCount { .. }
            | Self::RelationOrdinal { .. }
            | Self::DuplicateRelationOrdinal { .. }
            | Self::RelationPolicyOrdinal { .. }
            | Self::RelationPolicyCapacity { .. }
            | Self::CoincidentGateThreshold { .. }
            | Self::StratificationRow { .. }
            | Self::StratificationRole { .. }
            | Self::AnchorRow { .. }
            | Self::AnchorScalar { .. }
            | Self::StrengthHeadUnsupported
            | Self::NonUnitStrengthWithoutHead { .. }
            | Self::ManifestContractArtifacts { .. }
            | Self::ManifestContractVersion { .. }
            | Self::ManifestContractVariantCount { .. }
            | Self::ManifestContractCanonical
            | Self::SnapshotProvenance
            | Self::UnsupportedGenerationBackend { .. }
            | Self::SecurityPolicy
            | Self::ActivationConflict { .. }
            | Self::ReloadMissing
            | Self::ReloadMismatch
            | Self::ReproductionManifest
            | Self::ReproductionEvidence
            | Self::ReproductionArtifact { .. }
            | Self::ExistingModelArtifact
            | Self::Manifest(_)
            | Self::Snapshot(_) => None,
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
from_error!(RepresentationError, Representation);
from_error!(RepresentationAuditError, RepresentationAudit);
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
from_error!(PersistenceComparisonError, Persistence);
from_error!(GateEvidenceError, Evidence);
from_error!(Report<SnapshotError>, Snapshot);
