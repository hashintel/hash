use core::{error::Error, fmt};

use crate::{
    file::generation::{ActivateError, CurrentError, GenerationId, OpenError},
    salt::{fit::FitError, quality::error::QualityRunError},
};

/// Failure to complete a generation run.
///
/// Errors after a successful fit carry the published generation's identity for diagnosis or a
/// repeated probe. An activation failure can follow a passing quality verdict.
#[derive(Debug)]
pub(crate) enum RunnerError<D, E> {
    /// The run could not read the current-generation pointer.
    Current(CurrentError),
    /// The run could not open the active generation as the prior.
    Prior(OpenError),
    /// The fit did not return a successful publication.
    ///
    /// A publication error after the directory rename can leave a generation on disk.
    Fit(FitError<D, E>),
    /// The run could not reopen the published generation.
    Reopen { id: GenerationId, source: OpenError },
    /// The admission probe could not produce a report.
    Quality {
        id: GenerationId,
        source: QualityRunError<D>,
    },
    /// Activation of the admitted generation did not complete successfully.
    ///
    /// An error after the pointer rename can leave the generation selected.
    Activate {
        id: GenerationId,
        source: ActivateError,
    },
}

impl<D, E> From<CurrentError> for RunnerError<D, E> {
    fn from(error: CurrentError) -> Self {
        Self::Current(error)
    }
}

impl<D, E> From<FitError<D, E>> for RunnerError<D, E> {
    fn from(error: FitError<D, E>) -> Self {
        Self::Fit(error)
    }
}

impl<D, E> fmt::Display for RunnerError<D, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Current(_) => fmt.write_str("the current-generation pointer could not be read"),
            Self::Prior(_) => {
                fmt.write_str("the active generation could not be opened as the prior")
            }
            Self::Fit(_) => fmt.write_str("the fit could not publish"),
            Self::Reopen { id, .. } => {
                write!(fmt, "published generation {id} could not be reopened")
            }
            Self::Quality { id, .. } => write!(
                fmt,
                "the admission probe over published generation {id} could not produce a report",
            ),
            Self::Activate { id, .. } => {
                write!(fmt, "admitted generation {id} could not be activated")
            }
        }
    }
}

impl<D: Error + 'static, E: Error + 'static> Error for RunnerError<D, E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Current(error) => Some(error),
            Self::Prior(error) | Self::Reopen { source: error, .. } => Some(error),
            Self::Fit(error) => Some(error),
            Self::Quality { source, .. } => Some(source),
            Self::Activate { source, .. } => Some(source),
        }
    }
}
