//! Audits and sweeps over a published generation's neighbour construction.
//!
//! Each instrument reopens the active generation's projector representation artifact and replays
//! the production fit's random streams for the stage it measures. It then scores one construction
//! against an exact reference. [`backend`] sweeps the hannoy backend over its `ef_construction` ×
//! `ef_search` grid and [`descent`] audits NN-Descent constructions across candidate caps. An
//! instrument observes the construction stage. No fit consumes anything here, and a reading
//! describes a generation that is already published.
//!
//! Every instrument replays [`stage_rng`](crate::salt::fit::stage_rng) per fit seed, so a grid
//! point reproduces what a live fit at that seed and setting would have measured, and a repeated
//! seed measures the construction's own nondeterminism rather than seed spread. An instrument
//! computes the exact reference once per distinct seed and scores every reading against it.
//!
//! An instrument returns its readings and its host renders them.

use core::{
    error::Error,
    fmt::{self, Display},
    num::NonZero,
    time::Duration,
};

use hashql_core::id::IdSlice;

use crate::{
    dataset::PROJECTOR_DIMENSIONS,
    file::{
        array::{ArrayFile, OpenArrayError},
        generation::{CurrentError, GenerationId, GenerationRoot, OpenError},
    },
    identity::NodeRowId,
    math::AlignedVecN,
    salt::knn::error::KnnError,
};

pub(crate) mod backend;
pub(crate) mod descent;
#[cfg(test)]
mod tests;

// The reference size stays fixed because an instrument compares settings against each other. One
// sizing of the samples yields SE ~0.007 at the measured per-row deviation and resolves the
// construction effect. The production check stages its sizing per reading instead.
const REFERENCE_ROWS: NonZero<usize> = NonZero::new(2_048).expect("the reference size is nonzero");

/// A setup failure that stopped an instrument from reading the published representations.
#[derive(Debug)]
pub(crate) enum SetupError {
    /// Reading the root's current-generation pointer failed.
    Pointer(CurrentError),
    /// The root holds no activated generation.
    Inactive,
    /// Opening the active generation failed.
    Generation(OpenError),
    /// Opening the representation artifact failed.
    Artifact(OpenArrayError),
    /// The representation artifact does not hold rows of the projector width.
    Width,
}

impl Display for SetupError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pointer(_) => fmt.write_str("the current-generation pointer could not be read"),
            Self::Inactive => {
                fmt.write_str("the generation root holds no activated generation to measure")
            }
            Self::Generation(_) => fmt.write_str("the active generation could not be opened"),
            Self::Artifact(_) => fmt.write_str("the representation artifact could not be opened"),
            Self::Width => write!(
                fmt,
                "the representation artifact does not hold f32 rows of {PROJECTOR_DIMENSIONS} \
                 components",
            ),
        }
    }
}

impl Error for SetupError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Pointer(error) => Some(error),
            Self::Generation(error) => Some(error),
            Self::Artifact(error) => Some(error),
            Self::Inactive | Self::Width => None,
        }
    }
}

/// One construction audit's failure, in the construction's own error vocabulary.
#[derive(Debug)]
pub(crate) enum AuditError<N, E> {
    /// Reading the published representations failed.
    Setup(SetupError),
    /// Computing the exact reference failed.
    Reference(KnnError<N, !>),
    /// The audited construction failed.
    Construct(E),
}

impl<N: Display, E: Display> Display for AuditError<N, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Setup(error) => Display::fmt(error, fmt),
            Self::Reference(_) => fmt.write_str("the exact reference could not be computed"),
            Self::Construct(_) => fmt.write_str("the audited construction failed"),
        }
    }
}

impl<N: fmt::Debug + fmt::Display + 'static, E: Error + 'static> Error for AuditError<N, E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Setup(error) => error.source(),
            Self::Reference(error) => Some(error),
            Self::Construct(error) => Some(error),
        }
    }
}

/// A wall-clock reading, rendered on the scale every instrument measures on.
///
/// Seconds to one decimal, padded to the caller's width so a reading aligns inside a column of
/// them.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Seconds(Duration);

impl Seconds {
    /// Renders `wall` on the seconds scale.
    pub(crate) const fn new(wall: Duration) -> Self {
        Self(wall)
    }
}

impl Display for Seconds {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.pad(&alloc::format!("{:.1}s", self.0.as_secs_f64()))
    }
}

/// A published generation's identity together with its mapped representation artifact.
///
/// The artifact stays mapped for as long as this value lives. [`Self::rows`] reads its rows.
struct Representations {
    /// The generation whose representations are mapped.
    generation: GenerationId,
    /// The mapped representation artifact.
    file: ArrayFile,
}

impl Representations {
    /// Opens the root's active generation and maps its representation artifact.
    ///
    /// # Errors
    ///
    /// Returns a [`SetupError`] when reading the current-generation pointer fails, when the root
    /// holds no activated generation, or when the generation or its representation artifact fails
    /// to open.
    fn open(root: &GenerationRoot) -> Result<Self, SetupError> {
        let id = root
            .current()
            .map_err(SetupError::Pointer)?
            .ok_or(SetupError::Inactive)?;
        let generation = root.open(id).map_err(SetupError::Generation)?;

        let file = ArrayFile::open(
            generation.path_of(&generation.repository().files.representations.name()),
        )
        .map_err(SetupError::Artifact)?;

        Ok(Self {
            generation: id,
            file,
        })
    }

    /// Reads the mapped artifact's rows at the projector width.
    ///
    /// # Errors
    ///
    /// Returns [`SetupError::Width`] when the artifact holds another element type or width.
    fn rows(&self) -> Result<&IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>, SetupError> {
        self.file
            .vectors()
            .map(IdSlice::from_raw)
            .ok_or(SetupError::Width)
    }
}
