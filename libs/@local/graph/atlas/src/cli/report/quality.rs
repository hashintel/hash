//! One live assessment of the active generation, with its evidence record.

use core::{
    fmt::{self, Display},
    num::NonZero,
};

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};

use super::ReportError;
use crate::salt::quality::report::live::{self, Assessment};

/// Root, store, probe, and output settings of one live assessment.
#[derive(Debug, Args)]
pub(crate) struct QualityArgs {
    #[command(flatten)]
    root: crate::cli::RootArgs,

    #[command(flatten)]
    store: crate::cli::PostgresArgs,

    /// The probe seed. Equal seeds replay the sampling.
    #[arg(long, default_value_t = live::Options::default().seed)]
    seed: u64,

    /// Sampled anchor rows.
    #[arg(long, default_value_t = live::Options::default().anchors)]
    anchors: NonZero<usize>,

    /// Sampled comparison rows.
    #[arg(long, default_value_t = live::Options::default().comparisons)]
    comparisons: NonZero<usize>,

    /// Where the report JSON lands.
    #[arg(long, default_value = "quality-report.json", value_hint = ValueHint::FilePath)]
    output: Utf8PathBuf,
}

/// One assessment's verdict and where its evidence landed.
#[derive(Debug)]
pub(crate) struct QualityVerdict {
    /// The assessment's own verdict.
    assessment: Assessment,
    /// The path the run wrote the evidence record to.
    output: Utf8PathBuf,
}

impl Display for QualityVerdict {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(fmt, "{}", self.assessment)?;
        write!(fmt, "report      {}", self.output)
    }
}

impl QualityArgs {
    /// Assesses the active generation over the live store and writes the evidence record.
    ///
    /// # Errors
    ///
    /// Returns a [`ReportError`] when the run cannot dial the store, the assessment fails, or the
    /// run cannot write the record.
    pub(super) async fn run(self) -> Result<QualityVerdict, ReportError> {
        let mut client = self.store.connect().await.map_err(ReportError::Connect)?;

        let assessment = live::assess(
            &mut client,
            &self.root.root,
            live::Options {
                seed: self.seed,
                anchors: self.anchors,
                comparisons: self.comparisons,
            },
        )
        .await
        .map_err(ReportError::Assess)?;

        std::fs::write(&self.output, &assessment.report).map_err(ReportError::Io)?;

        Ok(QualityVerdict {
            assessment,
            output: self.output,
        })
    }
}
