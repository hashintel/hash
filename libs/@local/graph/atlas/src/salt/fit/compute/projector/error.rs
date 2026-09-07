//! The placement stage's failure surface.
//!
//! [`ProjectorError`] holds every failure the placement stage produces, and nothing any other
//! stage can reach: the trunk widens it once at the stage boundary, so a signature naming this
//! type states exactly which failures its caller can observe. Like the trunk's error it carries
//! no dataset or provider type, so it is `Send + 'static` by construction and crosses the rayon
//! offload.

use core::{error::Error, fmt};
use std::io;

use super::super::coordinates::OpenCoordinatesError;
use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::attraction::read::OpenAttractionError,
    identity::NodeRowId,
    math::NonFinitePoint,
    salt::{
        ladder::{CanonicalError, LadderError, paired::EncodeError},
        projector::{
            artifact::CheckpointError,
            train::{TrainError, refresh::RefreshError},
        },
    },
};

/// The placement stage failed to bind, train, measure, or publish.
///
/// Every variant aborts the fit: a generation whose coordinates the configured placement could
/// not produce publishes nothing.
#[derive(Debug)]
pub(crate) enum ProjectorError {
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
    /// A persisted coordinate column failed to map back for its measurement.
    OpenCoordinates(OpenCoordinatesError),
    /// The canonical step's aligned frame has a non-finite point.
    ///
    /// The alignment onto the baseline basis runs in `f32` and can overflow, so the aligned
    /// frame is proven at its creation before it publishes, and the persisted coordinate
    /// column re-proves the same frame at its own readback.
    NonFiniteAligned {
        /// The first offending row.
        source: NonFinitePoint<NodeRowId>,
    },
    /// The staged attraction index failed to map back for the paired-movement replay.
    OpenAttraction(OpenAttractionError),
    /// The paired-movement salt preimage failed to serialize.
    ///
    /// The preimage is a strict subset of the metadata document, so the seal would refuse the
    /// same generation.
    SaltPreimage(EncodeError),
    /// A placement artifact failed to write or persist.
    Io(io::Error),
}

impl fmt::Display for ProjectorError {
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
            Self::OpenCoordinates(error) => {
                write!(fmt, "a coordinate column failed to map back: {error}")
            }
            Self::NonFiniteAligned { source } => {
                write!(fmt, "the aligned canonical frame is not finite: {source}")
            }
            Self::OpenAttraction(error) => {
                write!(
                    fmt,
                    "the staged attraction index failed to map back: {error}"
                )
            }
            Self::SaltPreimage(error) => write!(
                fmt,
                "the paired-movement salt preimage failed to serialize: {error}"
            ),
            Self::Io(error) => write!(fmt, "a placement artifact failed to write: {error}"),
        }
    }
}

impl Error for ProjectorError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Train(error) => Some(error),
            Self::Checkpoint(error) => Some(error),
            Self::Projection(error) => Some(error),
            Self::Ladder(error) => Some(error),
            Self::Canonical(error) => Some(error),
            Self::OpenCoordinates(error) => Some(error),
            Self::OpenAttraction(error) => Some(error),
            Self::SaltPreimage(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::NonFiniteAligned { source } => Some(source),
            Self::ObjectiveCurve { .. } | Self::RepresentationWidth { .. } => None,
        }
    }
}

impl From<TrainError<NodeRowId>> for ProjectorError {
    fn from(error: TrainError<NodeRowId>) -> Self {
        Self::Train(error)
    }
}

impl From<CheckpointError> for ProjectorError {
    fn from(error: CheckpointError) -> Self {
        Self::Checkpoint(error)
    }
}

impl From<RefreshError<NodeRowId>> for ProjectorError {
    fn from(error: RefreshError<NodeRowId>) -> Self {
        Self::Projection(error)
    }
}

impl From<LadderError> for ProjectorError {
    fn from(error: LadderError) -> Self {
        Self::Ladder(error)
    }
}

impl From<CanonicalError> for ProjectorError {
    fn from(error: CanonicalError) -> Self {
        Self::Canonical(error)
    }
}

impl From<OpenCoordinatesError> for ProjectorError {
    fn from(error: OpenCoordinatesError) -> Self {
        Self::OpenCoordinates(error)
    }
}

impl From<OpenAttractionError> for ProjectorError {
    fn from(error: OpenAttractionError) -> Self {
        Self::OpenAttraction(error)
    }
}

impl From<EncodeError> for ProjectorError {
    fn from(error: EncodeError) -> Self {
        Self::SaltPreimage(error)
    }
}

impl From<io::Error> for ProjectorError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
