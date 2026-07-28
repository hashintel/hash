//! The report commands: analysis bundles over published generations, one submodule per report.

use core::{error::Error, fmt};
use std::io;

mod classifier;

pub use self::classifier::ClassifierArgs;

/// The report subcommands, one per bundle.
#[derive(Debug, clap::Subcommand)]
pub enum ReportCommand {
    /// Refits a published generation's classifier from its staged corpus, certifies the bytes
    /// against the deployed artifact, and writes the report bundle.
    Classifier(ClassifierArgs),
}

impl ReportCommand {
    /// Compiles the selected report and writes its bundle.
    ///
    /// # Errors
    ///
    /// Returns a [`ReportError`] when the bundle cannot be written.
    pub async fn run(self) -> Result<(), ReportError> {
        match self {
            Self::Classifier(args) => args.run().await,
        }
    }
}

/// One report invocation's failure.
#[derive(Debug)]
pub enum ReportError {
    /// The report bundle could not be written.
    Io(io::Error),
}

impl fmt::Display for ReportError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => fmt.write_str("the report bundle could not be written"),
        }
    }
}

impl Error for ReportError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
        }
    }
}
