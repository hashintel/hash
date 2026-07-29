//! The neighbour-construction reports: the backend sweep and the NN-Descent audit.
//!
//! Each command reads the root's active generation and prints its readings. The grid arguments
//! default to the settings the deployed configuration was pinned on, so an invocation without flags
//! re-derives the calibration evidence rather than an arbitrary sample of it.

use clap::Args;

use crate::{
    identity::NodeRowId,
    salt::knn::{
        descent::NnDescentError,
        report::{AuditError, backend, descent},
    },
};

/// Grid and root settings of one backend sweep.
#[derive(Debug, Args)]
pub(crate) struct BackendArgs {
    #[command(flatten)]
    root: crate::cli::RootArgs,

    /// Fit seeds whose build and sample streams are replayed; a repeated seed measures build
    /// nondeterminism.
    #[arg(long = "seed", value_delimiter = ',', default_values_t = backend::DEFAULT_SEEDS.to_vec())]
    seeds: Vec<u64>,

    /// `ef_construction` values; one index build per (seed, value).
    #[arg(
        long = "ef-construction",
        value_delimiter = ',',
        default_values_t = backend::DEFAULT_CONSTRUCTIONS.to_vec(),
    )]
    constructions: Vec<usize>,

    /// `ef_search` values, swept per built index.
    #[arg(
        long = "ef-search",
        value_delimiter = ',',
        default_values_t = backend::DEFAULT_SEARCHES.to_vec(),
    )]
    searches: Vec<usize>,
}

impl BackendArgs {
    /// Sweeps the search backend over the active generation's representations.
    ///
    /// # Errors
    ///
    /// Returns the sweep's failure when the representations cannot be read, an index cannot be
    /// built, or a sampled query fails.
    pub(super) fn run(self) -> Result<backend::Sweep, backend::SweepError> {
        crate::math::kernel::verify_cpu_baseline();

        backend::sweep(
            &self.root.root,
            &backend::Options {
                seeds: self.seeds.into(),
                constructions: self.constructions.into(),
                searches: self.searches.into(),
            },
        )
    }
}

/// Grid and root settings of one NN-Descent audit.
#[derive(Debug, Args)]
pub(crate) struct DescentArgs {
    #[command(flatten)]
    root: crate::cli::RootArgs,

    /// Fit seeds whose `knn-link` streams are replayed; a repeated seed measures construction
    /// nondeterminism.
    #[arg(long = "seed", value_delimiter = ',', default_values_t = descent::DEFAULT_SEEDS.to_vec())]
    seeds: Vec<u64>,

    /// Candidate caps the construction runs at.
    #[arg(
        long = "candidates",
        value_delimiter = ',',
        default_values_t = descent::DEFAULT_CANDIDATES.to_vec(),
    )]
    candidates: Vec<usize>,
}

impl DescentArgs {
    /// Audits NN-Descent constructions over the active generation's representations.
    ///
    /// # Errors
    ///
    /// Returns the audit's failure when the representations cannot be read, the reference cannot
    /// be computed, or a construction fails.
    pub(super) fn run(self) -> Result<descent::Audit, AuditError<NodeRowId, NnDescentError>> {
        crate::math::kernel::verify_cpu_baseline();

        descent::audit(&self.root.root, &self.seeds, &self.candidates)
    }
}
