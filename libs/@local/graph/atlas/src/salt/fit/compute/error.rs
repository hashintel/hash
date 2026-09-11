//! The compute run's failure surface.
//!
//! [`ComputeError`] holds one variant per stage: each stage owns a closed error enum beside its
//! stage type. The run carries the stage's enum here whole, so a failure attributes to its
//! stage by construction. The enum carries no dataset or provider type, so it is
//! `Send + 'static` by construction and crosses the rayon offload. The trunk keeps its own
//! legs. The corpus matrix and the identity table map in at its boundary. The quotient's distinct
//! matrix materializes into scratch, and the trunk's own staged writes and the seal complete
//! its variants. A stage never reads its own staged bytes back mid-run, so no map-back variant
//! exists for the values that flow as owned containers. The placement's deliberate re-reads of
//! persisted artifacts live in its own error.

use core::{error::Error, fmt};
use std::io;

use super::{
    super::{error::PriorError, prepare::identity::InvalidIdentityFile},
    classifier::ClassifierError,
    landmark::LandmarkError,
    lod::DeliveryError,
    neighbours::NeighbourError,
    policy::PolicyError,
    projector::error::ProjectorError,
    relation::{AdjacencyError, RelationError},
};
use crate::{
    file::{generation::SealError, identity::read::OpenIdentityError},
    salt::file::OpenVectorError,
};

/// A compute-side stage failed and published nothing.
///
/// Every variant is dataset- and provider-free, so the whole enum is `Send + 'static` and
/// crosses the rayon offload boundary.
#[derive(Debug)]
pub(crate) enum ComputeError {
    /// The staged representation matrix failed to map in at the run's boundary.
    OpenRepresentations(OpenVectorError),
    /// The staged identity table failed to map in.
    OpenIdentities(OpenIdentityError),
    /// A staged identity table does not hold a valid table.
    InvalidIdentities(InvalidIdentityFile),
    /// The quotient's distinct matrix failed to materialize.
    PersistQuotient(io::Error),
    /// A staged write or a scratch directory failed.
    Io(io::Error),
    /// The classifier stage failed to acquire a deployable model.
    Classifier(ClassifierError),
    /// The policy stage failed to resolve or stage the table.
    Policy(PolicyError),
    /// The adjacency stage failed to derive or stage the adjacency.
    Adjacency(AdjacencyError),
    /// The relation stage failed to assemble or stage the indexes.
    Relation(RelationError),
    /// The neighbour stage failed to construct, admit, or stage the table.
    Neighbours(NeighbourError),
    /// The semantic graph failed to stage.
    Semantic(io::Error),
    /// The prior generation offered for reuse could not serve it.
    Prior(PriorError),
    /// The landmark stage failed to build or stage the skeleton.
    Landmark(LandmarkError),
    /// The placement stage failed to bind, train, measure, or publish.
    Projector(ProjectorError),
    /// The delivery stage failed to derive or stage the served structure.
    Delivery(DeliveryError),
    /// The finished staging failed to seal into a generation.
    Seal(SealError),
    /// A stage panicked on the compute pool.
    ///
    /// The payload's message survives, unwinding removes the staging directory, and the async
    /// executor never observes the unwind.
    Panicked { message: Option<String> },
}

impl From<io::Error> for ComputeError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<OpenIdentityError> for ComputeError {
    fn from(error: OpenIdentityError) -> Self {
        Self::OpenIdentities(error)
    }
}

impl From<InvalidIdentityFile> for ComputeError {
    fn from(error: InvalidIdentityFile) -> Self {
        Self::InvalidIdentities(error)
    }
}

impl From<ClassifierError> for ComputeError {
    fn from(error: ClassifierError) -> Self {
        Self::Classifier(error)
    }
}

impl From<PolicyError> for ComputeError {
    fn from(error: PolicyError) -> Self {
        Self::Policy(error)
    }
}

impl From<AdjacencyError> for ComputeError {
    fn from(error: AdjacencyError) -> Self {
        Self::Adjacency(error)
    }
}

impl From<RelationError> for ComputeError {
    fn from(error: RelationError) -> Self {
        Self::Relation(error)
    }
}

impl From<NeighbourError> for ComputeError {
    fn from(error: NeighbourError) -> Self {
        Self::Neighbours(error)
    }
}

impl From<PriorError> for ComputeError {
    fn from(error: PriorError) -> Self {
        Self::Prior(error)
    }
}

impl From<LandmarkError> for ComputeError {
    fn from(error: LandmarkError) -> Self {
        Self::Landmark(error)
    }
}

impl From<ProjectorError> for ComputeError {
    fn from(error: ProjectorError) -> Self {
        Self::Projector(error)
    }
}

impl From<DeliveryError> for ComputeError {
    fn from(error: DeliveryError) -> Self {
        Self::Delivery(error)
    }
}

impl From<SealError> for ComputeError {
    fn from(error: SealError) -> Self {
        Self::Seal(error)
    }
}

/// Formats one boundary artifact's map-in failure.
fn map_in(fmt: &mut fmt::Formatter<'_>, artifact: &str, error: &dyn fmt::Display) -> fmt::Result {
    write!(fmt, "the staged {artifact} failed to map in: {error}")
}

impl fmt::Display for ComputeError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::OpenRepresentations(error) => map_in(fmt, "representation matrix", error),
            Self::OpenIdentities(error) => map_in(fmt, "identity table", error),
            Self::InvalidIdentities(error) => {
                write!(fmt, "a staged identity table is not a valid table: {error}")
            }
            Self::PersistQuotient(error) => {
                write!(fmt, "the distinct matrix failed to materialize: {error}")
            }
            Self::Io(error) => write!(fmt, "a staged write failed: {error}"),
            Self::Classifier(error) => write!(fmt, "the classifier stage failed: {error}"),
            Self::Policy(error) => write!(fmt, "the policy stage failed: {error}"),
            Self::Adjacency(error) => write!(fmt, "the adjacency stage failed: {error}"),
            Self::Relation(error) => write!(fmt, "the relation stage failed: {error}"),
            Self::Neighbours(error) => write!(fmt, "the neighbour stage failed: {error}"),
            Self::Semantic(error) => {
                write!(fmt, "the semantic stage failed to stage its graph: {error}")
            }
            Self::Prior(error) => {
                write!(fmt, "the prior generation could not serve reuse: {error}")
            }
            Self::Landmark(error) => write!(fmt, "the landmark stage failed: {error}"),
            Self::Projector(error) => {
                write!(fmt, "the placement stage failed: {error}")
            }
            Self::Delivery(error) => write!(fmt, "the delivery stage failed: {error}"),
            Self::Seal(error) => write!(fmt, "the generation failed to publish: {error}"),
            Self::Panicked { message } => {
                fmt.write_str("a stage panicked on the compute pool")?;
                if let Some(message) = message {
                    write!(fmt, ": {message}")?;
                }
                Ok(())
            }
        }
    }
}

impl Error for ComputeError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::OpenRepresentations(error) => Some(error),
            Self::OpenIdentities(error) => Some(error),
            Self::InvalidIdentities(error) => Some(error),
            Self::PersistQuotient(error) | Self::Io(error) | Self::Semantic(error) => Some(error),
            Self::Classifier(error) => Some(error),
            Self::Policy(error) => Some(error),
            Self::Adjacency(error) => Some(error),
            Self::Relation(error) => Some(error),
            Self::Neighbours(error) => Some(error),
            Self::Prior(error) => Some(error),
            Self::Landmark(error) => Some(error),
            Self::Projector(error) => Some(error),
            Self::Delivery(error) => Some(error),
            Self::Seal(error) => Some(error),
            Self::Panicked { .. } => None,
        }
    }
}
