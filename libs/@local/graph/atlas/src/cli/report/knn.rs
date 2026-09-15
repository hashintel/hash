//! The backend sweep and the NN-Descent audit over neighbour constructions.
//!
//! Each command reads the root's active generation and returns its readings. The grid arguments
//! default to the settings the deployment pinned. An invocation without flags re-derives the
//! calibration evidence rather than an arbitrary sample of it.

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

    /// Fit seeds whose build and sample streams the sweep replays.
    ///
    /// A repeated seed measures build nondeterminism.
    ///
    /// Defaults to [`backend::DEFAULT_SEEDS`], the pinned calibration grid.
    #[arg(long = "seed", value_delimiter = ',', default_values_t = backend::DEFAULT_SEEDS.to_vec())]
    seeds: Vec<u64>,

    /// `ef_construction` values; one index build per (seed, value).
    ///
    /// Defaults to [`backend::DEFAULT_CONSTRUCTIONS`].
    #[arg(
        long = "ef-construction",
        value_delimiter = ',',
        default_values_t = backend::DEFAULT_CONSTRUCTIONS.to_vec(),
    )]
    constructions: Vec<usize>,

    /// `ef_search` values, swept per built index.
    ///
    /// Defaults to [`backend::DEFAULT_SEARCHES`].
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
    /// Returns the sweep's failure when it cannot read the representations, cannot build an index,
    /// or a sampled query fails.
    pub(super) fn run(self) -> Result<backend::Sweep, backend::SweepError> {
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

    /// Fit seeds whose `knn-link` streams the audit replays.
    ///
    /// A repeated seed measures construction nondeterminism.
    ///
    /// Defaults to [`descent::DEFAULT_SEEDS`], the pinned calibration grid.
    #[arg(long = "seed", value_delimiter = ',', default_values_t = descent::DEFAULT_SEEDS.to_vec())]
    seeds: Vec<u64>,

    /// Candidate caps the construction runs at.
    ///
    /// Defaults to [`descent::DEFAULT_CANDIDATES`].
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
    /// Returns the audit's failure when it cannot read the representations, cannot compute the
    /// reference, or a construction fails.
    pub(super) fn run(self) -> Result<descent::Audit, AuditError<NodeRowId, NnDescentError>> {
        descent::audit(&self.root.root, &self.seeds, &self.candidates)
    }
}
