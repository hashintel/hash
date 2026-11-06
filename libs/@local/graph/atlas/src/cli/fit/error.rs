use core::{error::Error, fmt};

/// A failure to prepare, fit or publish a generation, by step.
#[derive(Debug)]
pub enum FitError {
    /// Producing the embedding provider failed.
    Embedder,
    /// Acquiring the prior generation failed.
    Download,
    /// The run failed.
    Run,
    /// Serializing the admission report failed.
    Serialize,
    /// Writing the admission report failed.
    Write,
    /// Uploading the results failed.
    Upload,
}

impl fmt::Display for FitError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Embedder => fmt.write_str("the embedding provider could not be produced"),
            Self::Download => fmt.write_str("downloading the prior generation failed"),
            Self::Run => fmt.write_str("the fit run failed"),
            Self::Serialize => fmt.write_str("serializing the admission report failed"),
            Self::Write => fmt.write_str("the admission report could not be written"),
            Self::Upload => fmt.write_str("uploading the results failed"),
        }
    }
}

impl Error for FitError {}
