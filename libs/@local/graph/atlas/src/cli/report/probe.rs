//! The probe command: one receipt-dumping solve of a fold subset from a frozen corpus.

use camino::Utf8PathBuf;
use clap::{Args, ValueHint};

use crate::{
    file::generation::{GenerationId, GenerationRoot},
    salt::policy::classifier::fit::solver::report::{ProbeCorpus, ProbeSettings},
};

/// Corpus, fold-assignment, strength, and trace settings of one probe.
#[derive(Debug, Args)]
#[command(group(
    clap::ArgGroup::new("corpus")
        .required(true)
        .args(["generation", "inputs"]),
))]
pub(crate) struct ProbeArgs {
    /// The generation root directory; consulted only with `--generation`.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_ROOT",
        value_parser = crate::cli::parse_root,
        value_hint = ValueHint::DirPath,
    )]
    root: Option<GenerationRoot>,

    /// Hex identity of the published generation whose staged corpus is probed.
    #[arg(long, requires = "root")]
    generation: Option<GenerationId>,

    /// Directory of supplied annotation artifacts under their staged names
    /// (annotation-corpus.json, annotation-embeddings.arr, annotation-hashes.arr), probed
    /// under the compiled deployment defaults; the corpus of a fit that never published
    /// probes through this form.
    #[arg(long, value_hint = ValueHint::DirPath)]
    inputs: Option<Utf8PathBuf>,

    /// The fold-assignment seed; the configured seed probes the production assignment, any
    /// other seed probes an alternative.
    #[arg(long, default_value_t = 0)]
    seed: u64,

    /// The held-out fold of the probed subset.
    #[arg(long)]
    fold: usize,

    /// Regularization-strength override; a CV candidate's fold solve probes through this.
    #[arg(long)]
    strength: Option<f64>,

    /// The outer iteration whose inner recurrence is traced; without it, the stalling outer
    /// traces when the solve ends at the CG iteration budget.
    #[arg(long)]
    trace_outer: Option<u64>,

    /// Instrumented-recurrence depth; defaults to four times the CG iteration allowance.
    #[arg(long)]
    trace_depth: Option<u64>,
}

impl ProbeArgs {
    /// Reconstructs the frozen corpus, solves the fold subset solo, and dumps every receipt;
    /// a budget-refused solve additionally traces its stalling inner recurrence.
    ///
    /// # Panics
    ///
    /// Panics when the corpus cannot be opened or its artifacts fail reconstruction; the
    /// probed solve itself may fail - its terminal is the observation.
    pub(super) async fn run(self) {
        crate::math::kernel::verify_cpu_baseline();

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
                trace_outer: self.trace_outer,
                trace_depth: self.trace_depth,
            },
        )
        .await;
    }
}
