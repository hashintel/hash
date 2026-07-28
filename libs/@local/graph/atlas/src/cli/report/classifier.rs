//! The classifier report: a certified refit written as one JSON bundle.

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};

use super::ReportError;
use crate::{
    file::generation::GenerationId, salt::policy::classifier::report::ClassifierReport,
    serve::GenerationRoot,
};

/// Root, generation, and output settings of one classifier report.
#[derive(Debug, Args)]
pub struct ClassifierArgs {
    /// The generation root directory.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_ROOT",
        value_parser = crate::cli::parse_root,
        value_hint = ValueHint::DirPath,
    )]
    root: GenerationRoot,

    /// Hex identity of the published generation whose classifier is reported.
    #[arg(long)]
    generation: GenerationId,

    /// Where the report bundle JSON lands.
    #[arg(long, default_value = "classifier-report.json", value_hint = ValueHint::FilePath)]
    output: Utf8PathBuf,
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
    #[expect(
        clippy::print_stdout,
        reason = "the certification verdict is the command's product"
    )]
    pub(super) async fn run(self) -> Result<(), ReportError> {
        crate::math::kernel::verify_cpu_baseline();

        let report = ClassifierReport::compile(&self.root, self.generation).await;

        let bundle =
            serde_json::to_vec_pretty(&report).expect("the report bundle serializes to JSON");
        std::fs::write(&self.output, bundle).map_err(ReportError::Io)?;

        println!(
            "certified: the refit model reproduces the staged artifact bytes\nrows        \
             {}\nreport      {}",
            report.row_count(),
            self.output,
        );

        Ok(())
    }
}
