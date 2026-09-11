use core::{error::Error, fmt};
use std::io;

use crate::{
    cli::embedder::EmbedderError, file::generation::upload::UploadError,
    salt::runner::operator::RunError,
};

/// The failed fit step and its concrete error.
#[derive(Debug)]
enum FitErrorKind {
    /// Producing the embedding provider failed.
    Embedder(EmbedderError),
    /// The run failed.
    Run(RunError),
    /// Writing the admission report failed.
    Io(io::Error),
    /// Uploading the results failed.
    Upload(UploadError),
    /// Serializing the admission report failed.
    Serialize(serde_json::Error),
}

/// A failure to prepare, fit or publish a generation.
///
/// Embedder and run failures retain their underlying display and source. Report and upload failures
/// use a step-specific message.
#[derive(Debug)]
pub struct FitError(Box<FitErrorKind>);

impl fmt::Display for FitError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &*self.0 {
            FitErrorKind::Embedder(error) => fmt::Display::fmt(error, fmt),
            FitErrorKind::Run(error) => fmt::Display::fmt(error, fmt),
            FitErrorKind::Io(_) => fmt.write_str("the admission report could not be written"),
            FitErrorKind::Upload(_) => fmt.write_str("uploading the results failed"),
            FitErrorKind::Serialize(_) => fmt.write_str("serializing the admission report failed"),
        }
    }
}

impl Error for FitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match &*self.0 {
            FitErrorKind::Embedder(error) => error.source(),
            FitErrorKind::Run(error) => error.source(),
            FitErrorKind::Io(error) => Some(error),
            FitErrorKind::Upload(error) => Some(error),
            FitErrorKind::Serialize(error) => Some(error),
        }
    }
}

impl From<UploadError> for FitError {
    fn from(value: UploadError) -> Self {
        Self(Box::new(FitErrorKind::Upload(value)))
    }
}

impl From<EmbedderError> for FitError {
    fn from(value: EmbedderError) -> Self {
        Self(Box::new(FitErrorKind::Embedder(value)))
    }
}

impl From<serde_json::Error> for FitError {
    fn from(value: serde_json::Error) -> Self {
        Self(Box::new(FitErrorKind::Serialize(value)))
    }
}

impl From<RunError> for FitError {
    fn from(value: RunError) -> Self {
        Self(Box::new(FitErrorKind::Run(value)))
    }
}

impl From<io::Error> for FitError {
    fn from(value: io::Error) -> Self {
        Self(Box::new(FitErrorKind::Io(value)))
    }
}
