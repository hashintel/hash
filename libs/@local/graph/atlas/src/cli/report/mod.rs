//! The report commands: analysis instruments over published generations, one submodule per
//! report.

use core::{error::Error, fmt};
use std::io;

mod classifier;
mod probe;

pub use self::{classifier::ClassifierArgs, probe::ProbeArgs};

/// The report subcommands, one per instrument.
#[derive(Debug, clap::Subcommand)]
pub enum ReportCommand {
    /// Refits a published generation's classifier from its staged corpus, certifies the bytes
    /// against the deployed artifact, and writes the report bundle.
    Classifier(ClassifierArgs),

    /// Solves one fold subset from a published generation's frozen corpus and dumps every
    /// receipt.
    Probe(ProbeArgs),
}

impl ReportCommand {
    /// Runs the selected report.
    ///
    /// # Errors
    ///
    /// Returns a [`ReportError`] when a report bundle cannot be written.
    pub async fn run(self) -> Result<(), ReportError> {
        match self {
            Self::Classifier(args) => args.run().await,
            Self::Probe(args) => {
                args.run().await;
                Ok(())
            }
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
