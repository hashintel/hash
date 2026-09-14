//! Neighbour-construction comparisons over published projector representations.
//!
//! [`backend`] sweeps hannoy over its `ef_construction` × `ef_search` grid. [`descent`] compares
//! NN-Descent candidate caps. Both read the active generation's representation artifact and return
//! measurements without changing its published artifacts.
//!
//! Both comparisons use the fit's [`stage_rng`](crate::salt::fit::stage_rng) derivation. A repeated
//! seed exposes construction nondeterminism separately from seed spread. The backend sweep reuses
//! one exact reference per distinct seed and scores every build against every reference. The
//! descent comparison uses one reference from its first seed, or seed zero when the seed list is
//! empty.
//!
//! # Measurement scope
//!
//! These comparisons operate on the published corpus rows with fixed-size reference samples of up
//! to 2,048 queries. The fit constructs on its distinct-representation quotient and uses staged
//! recall sampling. These readings share that seed derivation without replaying the fit's table or
//! admission interval. They compare settings within each report's fixed corpus and sampling design.

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
        ArtifactFile as _,
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

// a fixed reference lets settings share the same queries. At a per-row deviation of 0.32, 2,048
// rows give an uncorrected standard error of 0.32 / √2048 ≈ 0.0071. The fit's check sizes each
// verdict separately.
/// The maximum reference sample size every comparison uses.
const REFERENCE_ROWS: NonZero<usize> = NonZero::new(2_048).expect("the reference size is nonzero");

/// A failure to access the published representations for comparison.
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

/// A wall-clock duration formatted in seconds to one decimal place.
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
    /// Returns [`SetupError`] when the active generation or its representation artifact cannot be
    /// opened.
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
    /// Returns [`SetupError`] when the artifact holds another element type or width.
    fn rows(&self) -> Result<&IdSlice<NodeRowId, AlignedVecN<PROJECTOR_DIMENSIONS>>, SetupError> {
        self.file
            .vectors()
            .map(IdSlice::from_raw)
            .ok_or(SetupError::Width)
    }
}
