//! The classifier report that writes a certified refit as one JSON bundle.

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

    /// Hex identity of the published generation whose classifier this report covers.
    #[arg(long)]
    generation: GenerationId,

    /// Where the report bundle JSON lands.
    #[arg(long, default_value = "classifier-report.json", value_hint = ValueHint::FilePath)]
    output: Utf8PathBuf,
}

/// One refit's certification verdict and where its bundle landed.
#[derive(Debug)]
pub(crate) struct ClassifierVerdict {
    /// Whether the refit model reproduced the staged artifact bytes.
    verified: bool,
    /// The staged corpus's row count.
    rows: usize,
    /// The path the run wrote the report bundle to.
    output: Utf8PathBuf,
}

impl Display for ClassifierVerdict {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.verified {
            writeln!(
                fmt,
                "certified: the refit model reproduces the staged artifact bytes"
            )?;
        } else {
            writeln!(
                fmt,
                "diverged: the refit model does not reproduce the staged artifact bytes; the \
                 bundle carries the evidence"
            )?;
        }
        writeln!(fmt, "rows        {}", self.rows)?;
        write!(fmt, "report      {}", self.output)
    }
}

impl ClassifierArgs {
    /// Refits the generation's classifier from its staged corpus and certifies the bytes against
    /// the deployed artifact, then writes the report bundle. A digest mismatch is the bundle's
    /// content, so it lands in the report and the verdict instead of failing the run.
    ///
    /// # Errors
    ///
    /// Returns a [`ReportError`] when the run cannot write the bundle.
    ///
    /// # Panics
    ///
    /// This panics when the run cannot open the generation, its staged corpus fails reconstruction,
    /// or the refit fails. A report run has no recovery path, and the error is the diagnosis.
    pub(super) async fn run(self) -> Result<ClassifierVerdict, ReportError> {
        let report = ClassifierReport::compile(&self.root.root, self.generation).await;

        let bundle =
            serde_json::to_vec_pretty(&report).expect("the report bundle serializes to JSON");
        std::fs::write(&self.output, bundle).map_err(ReportError::Io)?;

        Ok(ClassifierVerdict {
            verified: report.verified(),
            rows: report.row_count(),
            output: self.output,
        })
    }
}
