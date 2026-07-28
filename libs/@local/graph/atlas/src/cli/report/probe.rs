//! The probe command: one receipt-dumping solve of a fold subset from a frozen corpus.

use clap::{Args, ValueHint};

use crate::{file::generation::GenerationId, serve::GenerationRoot};

/// Root, generation, and fold-assignment settings of one probe.
#[derive(Debug, Args)]
pub struct ProbeArgs {
    /// The generation root directory.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_ROOT",
        value_parser = crate::cli::parse_root,
        value_hint = ValueHint::DirPath,
    )]
    root: GenerationRoot,

    /// Hex identity of the published generation whose staged corpus is probed.
    #[arg(long)]
    generation: GenerationId,

    /// The fold-assignment seed; the echoed configuration's seed probes the production
    /// assignment, any other seed probes an alternative.
    #[arg(long, default_value_t = 0)]
    seed: u64,

    /// The held-out fold of the probed subset.
    #[arg(long)]
    fold: usize,
}

impl ProbeArgs {
    /// Reconstructs the staged corpus, solves the fold subset solo, and dumps every receipt.
    ///
    /// # Panics
    ///
    /// Panics when the generation cannot be opened or its staged corpus fails reconstruction;
    /// the probed solve itself may fail - its terminal is the observation.
    pub(super) async fn run(self) {
        crate::math::kernel::verify_cpu_baseline();

        crate::salt::policy::classifier::fit::solver::report::probe_fold(
            &self.root,
            self.generation,
            self.seed,
            self.fold,
        )
        .await;
    }
}
