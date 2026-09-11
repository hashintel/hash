//! One receipt-dumping solve of a fold subset from a frozen corpus.

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};

use crate::{
    file::generation::{GenerationId, GenerationRoot},
    salt::policy::classifier::fit::solver::report::{ProbeCorpus, ProbeSettings},
};

/// Corpus, fold-assignment, strength, and census settings of one probe.
#[derive(Debug, Args)]
#[command(group(
    clap::ArgGroup::new("corpus")
        .required(true)
        .args(["generation", "inputs"]),
))]
pub(crate) struct ProbeArgs {
    /// The generation root directory. The probe reads it only with `--generation`.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_ROOT",
        value_parser = crate::cli::parse_root,
        value_hint = ValueHint::DirPath,
    )]
    root: Option<GenerationRoot>,

    /// Hex identity of the published generation whose staged corpus this probe covers.
    #[arg(long, requires = "root")]
    generation: Option<GenerationId>,

    /// Directory of supplied annotation artifacts under their staged names
    /// (annotation-corpus.json, annotation-embeddings.arr, annotation-hashes.arr), probed under
    /// the compiled deployment defaults; the corpus of a fit that never published probes through
    /// this form.
    #[arg(long, value_hint = ValueHint::DirPath)]
    inputs: Option<Utf8PathBuf>,

    /// The fold-assignment seed; the configured seed probes the production assignment, any other
    /// seed probes an alternative.
    #[arg(long, default_value_t = 0)]
    seed: u64,

    /// The held-out fold of the probed subset.
    #[arg(long)]
    fold: usize,

    /// Regularization-strength override. A CV candidate's fold solve probes through this.
    #[arg(long)]
    strength: Option<f64>,

    /// The outer iteration whose accepted state the curvature census replays.
    #[arg(long)]
    census_outer: Option<u64>,
}

impl ProbeArgs {
    /// Reconstructs the frozen corpus and solves the fold subset solo, then dumps every receipt
    /// with its curvature censuses.
    ///
    /// # Panics
    ///
    /// This panics when the probe cannot open the corpus or its artifacts fail reconstruction. The
    /// probed solve itself may fail, and its terminal is the observation.
    pub(super) async fn run(self) {
        let corpus = match (&self.root, self.generation, &self.inputs) {
            (Some(root), Some(generation), None) => ProbeCorpus::Generation { root, generation },
            (_, None, Some(inputs)) => ProbeCorpus::Supplied { directory: inputs },
            _ => unreachable!(
                "the argument group admits exactly one corpus source, and a generation requires \
                 its root"
            ),
        };

        crate::salt::policy::classifier::fit::solver::report::probe_fold(
            corpus,
            ProbeSettings {
                seed: self.seed,
                fold: self.fold,
                strength: self.strength,
            },
            self.census_outer,
        )
        .await;
    }
}
