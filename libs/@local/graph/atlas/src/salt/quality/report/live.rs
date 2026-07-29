//! One live assessment of a root's active generation.
//!
//! The assessment runs the whole suite against the store at the snapshot the generation's metadata
//! records, so artifact rows and store identities describe one corpus, and returns the verdict
//! together with the serialized evidence record. Probe sizing is the instrument's own: a live run
//! over a million rows affords sharper subgroup cells than the suite's own default sample.

use core::{
    error::Error,
    fmt::{self, Display},
    num::NonZero,
    time::Duration,
};
use std::time::Instant;

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use tokio_postgres::Client;

use crate::{
    dataset::postgres::{PostgresDataset, PostgresDatasetError},
    file::generation::{CurrentError, GenerationId, GenerationRoot, OpenError},
    salt::quality::{
        error::QualityRunError,
        runner::{QualityRunOptions, run},
    },
};

/// Probe sizing for one live assessment.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Options {
    /// The probe seed; equal seeds replay the sampling.
    pub seed: u64 = 0,
    /// Sampled anchor rows.
    ///
    /// The suite default is 256; a live run over a million rows affords more for sharper subgroup
    /// cells.
    pub anchors: NonZero<usize> = const { NonZero::new(1_024).unwrap() },
    /// Sampled comparison rows.
    pub comparisons: NonZero<usize> = const { NonZero::new(4_096).unwrap() },
}

const impl Default for Options {
    fn default() -> Self {
        Self { .. }
    }
}

/// One live assessment's verdict and serialized evidence.
#[derive(Debug, Clone)]
pub(crate) struct Assessment {
    /// The assessed generation's identity.
    pub generation: GenerationId,
    /// Whether the report's thresholds hold.
    pub passes: bool,
    /// The full [`QualityReport`](super::QualityReport) as pretty-printed JSON.
    ///
    /// The self-describing evidence record.
    pub report: String,
    /// Wall clock of the assessment.
    pub wall: Duration,
}

impl Display for Assessment {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(fmt, "generation  {}", self.generation)?;
        writeln!(fmt, "passes      {}", self.passes)?;
        write!(fmt, "wall        {:.1}s", self.wall.as_secs_f64())
    }
}

/// One assessment's failure, by step.
#[derive(Debug)]
pub(crate) enum AssessError {
    /// The root's current-generation pointer could not be read.
    Pointer(CurrentError),
    /// The root holds no activated generation.
    Inactive,
    /// The active generation could not be opened.
    Generation(OpenError),
    /// The generation records no snapshot axes, so no store state reproduces its corpus.
    Snapshot,
    /// The store could not serve the recorded snapshot.
    Dataset(PostgresDatasetError),
    /// The quality run failed.
    Run(QualityRunError<PostgresDatasetError>),
    /// The report could not be serialized.
    Serialize(serde_json::Error),
}

impl Display for AssessError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pointer(_) => fmt.write_str("the current-generation pointer could not be read"),
            Self::Inactive => {
                fmt.write_str("the generation root holds no activated generation to assess")
            }
            Self::Generation(_) => fmt.write_str("the active generation could not be opened"),
            Self::Snapshot => {
                fmt.write_str("the active generation records no snapshot axes to assess against")
            }
            Self::Dataset(_) => fmt.write_str("the store could not serve the recorded snapshot"),
            Self::Run(_) => fmt.write_str("the quality run failed"),
            Self::Serialize(_) => fmt.write_str("the quality report could not be serialized"),
        }
    }
}

impl Error for AssessError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Pointer(error) => Some(error),
            Self::Generation(error) => Some(error),
            Self::Dataset(error) => Some(error),
            Self::Run(error) => Some(error),
            Self::Serialize(error) => Some(error),
            Self::Inactive | Self::Snapshot => None,
        }
    }
}

/// Assesses the root's active generation against the live store.
///
/// # Errors
///
/// Returns an [`AssessError`] when the generation cannot be opened, the store cannot serve its
/// snapshot, the run fails, or the report cannot be serialized.
pub(crate) async fn assess(
    client: &mut Client,
    root: &GenerationRoot,
    options: Options,
) -> Result<Assessment, AssessError> {
    let started = Instant::now();

    let id = root
        .current()
        .map_err(AssessError::Pointer)?
        .ok_or(AssessError::Inactive)?;
    let generation = root.open(id).map_err(AssessError::Generation)?;

    let axes = generation
        .repository()
        .metadata
        .snapshot
        .axes
        .ok_or(AssessError::Snapshot)?;
    let dataset = PostgresDataset::new(client, axes)
        .await
        .map_err(AssessError::Dataset)?;

    let mut run_options = QualityRunOptions { .. };
    run_options.probe.anchors = options.anchors;
    run_options.probe.comparisons = options.comparisons;

    let report = run(
        &dataset,
        &generation,
        &run_options,
        Xoshiro256PlusPlus::seed_from_u64(options.seed),
    )
    .await
    .map_err(AssessError::Run)?;

    Ok(Assessment {
        generation: id,
        passes: report.passes(),
        report: serde_json::to_string_pretty(&report).map_err(AssessError::Serialize)?,
        wall: started.elapsed(),
    })
}
