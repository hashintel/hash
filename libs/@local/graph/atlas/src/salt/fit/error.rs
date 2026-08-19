//! The fit pipeline's failure surface.
//!
//! The failure surface mirrors the pipeline's thread boundary. [`FitError`] is the async side's:
//! it holds the failures only ingest produces - the dataset, the card stream, the embedding
//! provider, and the norm admission check - and wraps the compute side's
//! [`ComputeError`](super::compute::ComputeError) whole. [`PriorError`] and [`PlacementError`]
//! are shared vocabularies: the prior generation's artifacts are read on both sides of the
//! boundary, and the placement's refusals live with the projector stage that produces them.

use core::{error::Error, fmt};
use std::io;

use super::{
    compute::ComputeError,
    prepare::{
        identity::InvalidIdentityFile,
        norm::{NormSpotCheck, SpotCheckError},
    },
};
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        array::OpenArrayError, identity::read::OpenIdentityError, landmark::read::OpenLandmarkError,
    },
    identity::{NodeRowId, OntologyRowId},
    salt::{
        embedding::CardEmbeddingError,
        ladder::{CanonicalError, LadderError},
        landmark::artifact::InvalidLandmarkFile,
        policy::annotation::assembly::AssemblyError,
        projector::{
            artifact::CheckpointError,
            train::{TrainError, refresh::RefreshError},
        },
    },
};

/// The projector placement could not produce its canonical field.
///
/// Every variant aborts the fit: a generation whose coordinates the configured placement could not
/// produce publishes nothing.
#[derive(Debug)]
pub(crate) enum PlacementError {
    /// The projector objective rejects the fit's low-dimensional kernel.
    ObjectiveCurve { exponent: f32 },
    /// The configured architecture disagrees with the dataset's representation width.
    RepresentationWidth { configured: usize },
    /// Projector training failed.
    Train(TrainError<NodeRowId>),
    /// Encoding or staging the projector checkpoint failed.
    Checkpoint(CheckpointError),
    /// A whole-corpus inference pass failed.
    Projection(RefreshError<NodeRowId>),
    /// The ladder measurement rejected its fields.
    Ladder(LadderError),
    /// The ladder rejects the configured canonical condition.
    Canonical(CanonicalError),
}

impl fmt::Display for PlacementError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ObjectiveCurve { exponent } => write!(
                fmt,
                "the projector objective rejects the configuration: the curve exponent {exponent} \
                 must be at least 0.5",
            ),
            Self::RepresentationWidth { configured } => write!(
                fmt,
                "the architecture's representation width {configured} does not match the \
                 dataset's {PROJECTOR_DIMENSIONS}-dimensional projector contract",
            ),
            Self::Train(error) => write!(fmt, "projector training failed: {error}"),
            Self::Checkpoint(error) => {
                write!(fmt, "the projector checkpoint failed to stage: {error}")
            }
            Self::Projection(error) => {
                write!(fmt, "a whole-corpus inference pass failed: {error}")
            }
            Self::Ladder(error) => write!(fmt, "the ladder measurement failed: {error}"),
            Self::Canonical(error) => {
                write!(fmt, "the canonical condition was refused: {error}")
            }
        }
    }
}

impl Error for PlacementError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Train(error) => Some(error),
            Self::Checkpoint(error) => Some(error),
            Self::Projection(error) => Some(error),
            Self::Ladder(error) => Some(error),
            Self::Canonical(error) => Some(error),
            Self::ObjectiveCurve { .. } | Self::RepresentationWidth { .. } => None,
        }
    }
}

impl From<TrainError<NodeRowId>> for PlacementError {
    fn from(error: TrainError<NodeRowId>) -> Self {
        Self::Train(error)
    }
}

impl From<CheckpointError> for PlacementError {
    fn from(error: CheckpointError) -> Self {
        Self::Checkpoint(error)
    }
}

impl From<RefreshError<NodeRowId>> for PlacementError {
    fn from(error: RefreshError<NodeRowId>) -> Self {
        Self::Projection(error)
    }
}

impl From<LadderError> for PlacementError {
    fn from(error: LadderError) -> Self {
        Self::Ladder(error)
    }
}

impl From<CanonicalError> for PlacementError {
    fn from(error: CanonicalError) -> Self {
        Self::Canonical(error)
    }
}

/// A prior generation offered for reuse cannot serve it.
///
/// The fit reads the prior's artifacts exactly as it reads published ones. A prior that fails here
/// is corrupt, of another layout version, or of another dataset's id type, and the fit aborts
/// rather than running without reuse.
#[derive(Debug)]
pub(crate) enum PriorError {
    /// A prior card-embedding array failed to map.
    MapCards(OpenArrayError),
    /// The prior card files do not hold row-aligned digest and embedding columns.
    MalformedCards,
    /// The prior landmark file failed to map.
    MapLandmarks(OpenLandmarkError),
    /// The prior landmark file does not hold a valid skeleton.
    InvalidLandmarks(InvalidLandmarkFile),
    /// A prior identity file failed to map.
    MapIdentities(OpenIdentityError),
    /// A prior identity file does not hold a valid table over the dataset's id type.
    InvalidIdentities(InvalidIdentityFile),
    /// The prior skeleton selects a row beyond the prior identity table.
    ///
    /// The skeleton and the identity table describe different corpora.
    SkeletonBeyondIdentities { row: u64 },
}

impl fmt::Display for PriorError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MapCards(error) => {
                write!(fmt, "a prior card-embedding array failed to map: {error}")
            }
            Self::MalformedCards => fmt.write_str(
                "the prior card files do not hold row-aligned digest and embedding columns",
            ),
            Self::MapLandmarks(error) => {
                write!(fmt, "the prior landmark file failed to map: {error}")
            }
            Self::InvalidLandmarks(error) => write!(
                fmt,
                "the prior landmark file is not a valid skeleton: {error}"
            ),
            Self::MapIdentities(error) => {
                write!(fmt, "a prior identity file failed to map: {error}")
            }
            Self::InvalidIdentities(error) => write!(
                fmt,
                "a prior identity file is not a valid table over the dataset's id type: {error}"
            ),
            Self::SkeletonBeyondIdentities { row } => write!(
                fmt,
                "the prior skeleton selects row {row}, beyond its own identity table"
            ),
        }
    }
}

impl Error for PriorError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::MapCards(error) => Some(error),
            Self::MapLandmarks(error) => Some(error),
            Self::InvalidLandmarks(error) => Some(error),
            Self::MapIdentities(error) => Some(error),
            Self::InvalidIdentities(error) => Some(error),
            Self::MalformedCards | Self::SkeletonBeyondIdentities { .. } => None,
        }
    }
}

/// One fit failed and published nothing.
///
/// `D` is the dataset's error and `E` the embedding provider's. Both arise only during ingest.
/// Every compute-side failure arrives as [`FitError::Compute`].
#[derive(Debug)]
pub(crate) enum FitError<D, E> {
    /// The dataset failed to deliver a stream item.
    Dataset(D),
    /// The card stream failed.
    Cards(io::Error),
    /// The embedding provider failed to produce the card table.
    Embedding(CardEmbeddingError<OntologyRowId, E>),
    /// The supplied annotation corpus failed to assemble into the classifier's training set.
    Assembly(AssemblyError<E>),
    /// A streamed ingest write failed.
    Io(io::Error),
    /// The freshly staged representation matrix failed to map for the norm spot check.
    MapRepresentations(super::compute::OpenVectorError),
    /// The norm spot check's sampling settings are unusable.
    NormCheck(SpotCheckError),
    /// Sampled representation rows violate the source contract.
    RepresentationDefects(NormSpotCheck),
    /// A compute-side stage failed.
    Compute(ComputeError),
}

impl<D, E> From<io::Error> for FitError<D, E> {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl<D, E> From<ComputeError> for FitError<D, E> {
    fn from(error: ComputeError) -> Self {
        Self::Compute(error)
    }
}

impl<D, E> From<SpotCheckError> for FitError<D, E> {
    fn from(error: SpotCheckError) -> Self {
        Self::NormCheck(error)
    }
}

impl<D, E> From<PriorError> for FitError<D, E> {
    fn from(error: PriorError) -> Self {
        Self::Compute(ComputeError::Prior(error))
    }
}

impl<D: fmt::Display, E: fmt::Display> fmt::Display for FitError<D, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Dataset(error) => write!(fmt, "the dataset failed to deliver: {error}"),
            Self::Cards(error) => write!(fmt, "the card stream failed: {error}"),
            Self::Embedding(error) => write!(fmt, "the card table failed to embed: {error}"),
            Self::Assembly(error) => {
                write!(fmt, "the annotation corpus failed to assemble: {error}")
            }
            Self::Io(error) => write!(fmt, "a streamed ingest write failed: {error}"),
            Self::MapRepresentations(error) => write!(
                fmt,
                "the staged representation matrix failed to map back: {error}"
            ),
            Self::NormCheck(error) => write!(fmt, "the norm spot check could not run: {error}"),
            Self::RepresentationDefects(check) => write!(
                fmt,
                "{} of {} sampled representation rows violate the source contract",
                check.defects.len(),
                check.sampled_rows,
            ),
            Self::Compute(error) => error.fmt(fmt),
        }
    }
}

impl<D, E> Error for FitError<D, E>
where
    D: Error + 'static,
    E: Error + 'static,
{
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Dataset(error) => Some(error),
            Self::Cards(error) | Self::Io(error) => Some(error),
            Self::Embedding(error) => Some(error),
            Self::Assembly(error) => Some(error),
            Self::MapRepresentations(error) => Some(error),
            Self::NormCheck(error) => Some(error),
            Self::Compute(error) => Some(error),
            Self::RepresentationDefects(_) => None,
        }
    }
}
