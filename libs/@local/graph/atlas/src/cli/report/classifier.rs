//! The classifier report: a certified refit written as one JSON bundle.

use core::fmt::{self, Display};

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};

use super::ReportError;
use crate::{file::generation::GenerationId, salt::policy::classifier::report::ClassifierReport};

/// Root, generation, and output settings of one classifier report.
#[derive(Debug, Args)]
pub(crate) struct ClassifierArgs {
    #[command(flatten)]
    root: crate::cli::RootArgs,

    /// Hex identity of the published generation whose classifier is reported.
    #[arg(long)]
    generation: GenerationId,

    /// Where the report bundle JSON lands.
    #[arg(long, default_value = "classifier-report.json", value_hint = ValueHint::FilePath)]
    output: Utf8PathBuf,
}

/// One certified refit's verdict and where its bundle landed.
///
/// Reaching a verdict at all is the certification: a refit whose bytes diverge from the deployed
/// artifact fails the compilation instead of reporting a mismatch.
#[derive(Debug)]
pub(crate) struct ClassifierVerdict {
    /// The staged corpus's row count.
    rows: usize,
    /// The path the report bundle was written to.
    output: Utf8PathBuf,
}

impl Display for ClassifierVerdict {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(
            fmt,
            "certified: the refit model reproduces the staged artifact bytes"
        )?;
        writeln!(fmt, "rows        {}", self.rows)?;
        write!(fmt, "report      {}", self.output)
    }
}

impl ClassifierArgs {
    /// Refits the generation's classifier from its staged corpus, certifies the bytes against
    /// the deployed artifact, and writes the report bundle.
    ///
    /// # Errors
    ///
    /// Returns a [`ReportError`] when the bundle cannot be written.
    ///
    /// # Panics
    ///
    /// Panics when the generation cannot be opened, its staged corpus fails reconstruction, the
    /// refit fails, or the recomputed model does not reproduce the staged artifact bytes - a
    /// report run has no recovery path, and the error is the diagnosis.
    pub(super) async fn run(self) -> Result<ClassifierVerdict, ReportError> {
        crate::math::kernel::verify_cpu_baseline();

        let report = ClassifierReport::compile(&self.root.root, self.generation).await;

        let bundle =
            serde_json::to_vec_pretty(&report).expect("the report bundle serializes to JSON");
        std::fs::write(&self.output, bundle).map_err(ReportError::Io)?;

        Ok(ClassifierVerdict {
            rows: report.row_count(),
            output: self.output,
        })
    }
}
