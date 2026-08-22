//! The realization report over a published generation's recorded target readings.
//!
//! On a backend whose kernels vary with the execution shape, the whole-corpus zero forward and
//! the padded target pass are different realizations of one model, and they can read different
//! bytes for the same row. This report's subject is that split: it takes a generation's
//! recorded target readings and holds them to a twin re-derived from the padded realization
//! alone on the executing backend, so a recorded fit or estimand that silently read the other
//! realization fails the comparison.
//!
//! A published generation carries no target evidence record, because the trainer's readings
//! live only in run memory. The report therefore resolves its generation and refuses, which
//! is the honest reading: nothing exists to certify.

use core::{error::Error, fmt};

use clap::Args;

use super::ReportError;
use crate::file::generation::GenerationId;

/// Root and generation settings of one realization report.
#[derive(Debug, Args)]
pub(crate) struct RealizationArgs {
    #[command(flatten)]
    root: crate::cli::RootArgs,

    /// Hex identity of the generation whose recorded readings this report certifies.
    #[arg(long)]
    generation: GenerationId,
}

/// A realization report's refusal.
#[derive(Debug)]
pub(crate) enum RealizationError {
    /// The generation records no target evidence, so no recorded reading exists to certify.
    NoTargetEvidence {
        /// The generation the report resolved.
        generation: GenerationId,
    },
}

impl fmt::Display for RealizationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoTargetEvidence { generation } => write!(
                fmt,
                "generation {generation} records no target evidence, so no recorded reading \
                 exists to certify",
            ),
        }
    }
}

impl Error for RealizationError {}

impl RealizationArgs {
    /// Resolves the generation and returns the report's refusal.
    ///
    /// The trainer's target readings have no persisted form, so no published generation can
    /// carry the record this report certifies. The resolution proves the generation exists,
    /// and the returned refusal names it.
    ///
    /// # Panics
    ///
    /// This panics when the generation cannot be opened. A report run has no recovery path,
    /// and the error is the diagnosis.
    pub(super) fn run(self) -> ReportError {
        let _generation = self
            .root
            .root
            .open(self.generation)
            .expect("the generation is published");

        ReportError::Realization(RealizationError::NoTargetEvidence {
            generation: self.generation,
        })
    }
}
