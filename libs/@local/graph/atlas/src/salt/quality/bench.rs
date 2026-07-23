//! Measurement seams for the quality suite's live targets.
//!
//! [`sweep`] serves the clump-threshold calibration: the clump ε is a calibrated
//! configuration value whose default must carry measured corpus structure, not a guess, so the
//! sweep opens a published k-NN table and reads the grouping's shape at each candidate threshold.
//! [`assess_current`] runs the full quality probe against a generation root's active generation
//! over the live store, at the snapshot the generation records, and returns the serialized report.

use core::{fmt, num::NonZero};
use std::path::Path;

use camino::Utf8PathBuf;
use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use tokio_postgres::Client;

use super::{
    clump::Clumps,
    runner::{QualityRunOptions, run},
};
use crate::{
    dataset::postgres::PostgresDataset,
    file::{
        generation::GenerationRoot,
        sprs::read::{OpenSprsError, SprsFile},
    },
    salt::knn::artifact::{InvalidKnnFile, KnnArchive},
};

/// One published table's grouping shape across candidate thresholds.
#[derive(Debug)]
pub struct Sweep {
    /// The table's node-row count.
    pub rows: usize,
    /// Stored non-self neighbours per row.
    pub neighbours: usize,
    /// One reading per candidate threshold, in argument order.
    pub readings: Vec<SweepReading>,
}

/// The grouping's shape at one candidate threshold.
#[derive(Debug, Copy, Clone)]
pub struct SweepReading {
    /// The distance threshold the grouping was built at.
    pub epsilon: f32,
    /// The clump count, singletons included.
    pub clumps: usize,
    /// Clumps holding at least two rows.
    pub groups: usize,
    /// Rows inside multi-row clumps.
    pub grouped_rows: usize,
}

/// A sweep input's refusal: the path does not hold a readable k-NN table.
///
/// Splices into the chain transparently: the display text and the sources are the wrapped
/// crate-internal fault's, unchanged.
#[derive(Debug)]
pub struct SweepError(SweepFault);

/// The two ways the table fails to open.
#[derive(Debug)]
enum SweepFault {
    /// The sparse file could not be opened.
    Open(OpenSprsError),
    /// The file does not hold a valid k-NN table.
    Archive(InvalidKnnFile),
}

impl fmt::Display for SweepError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.0 {
            SweepFault::Open(error) => fmt::Display::fmt(error, fmt),
            SweepFault::Archive(error) => fmt::Display::fmt(error, fmt),
        }
    }
}

impl core::error::Error for SweepError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match &self.0 {
            SweepFault::Open(error) => error.source(),
            SweepFault::Archive(error) => error.source(),
        }
    }
}

/// Reads the grouping shape of the k-NN table at `path` for every candidate threshold.
///
/// # Errors
///
/// Returns a [`SweepError`] when the file cannot be opened or does not hold a valid k-NN table.
pub fn sweep(path: impl AsRef<Path>, epsilons: &[f32]) -> Result<Sweep, SweepError> {
    let table =
        KnnArchive::new(SprsFile::open(path).map_err(|error| SweepError(SweepFault::Open(error)))?)
            .map_err(|error| SweepError(SweepFault::Archive(error)))?;
    let view = table.view();

    Ok(Sweep {
        rows: view.rows(),
        neighbours: view.neighbours(),
        readings: epsilons
            .iter()
            .map(|&epsilon| {
                let clumps = Clumps::from_knn(&view, epsilon);
                SweepReading {
                    epsilon,
                    clumps: clumps.clumps(),
                    groups: clumps.groups(),
                    grouped_rows: clumps.grouped_rows(),
                }
            })
            .collect(),
    })
}

/// Probe sizing for one live assessment.
#[derive(Debug, Copy, Clone)]
pub struct AssessOptions {
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

/// One live assessment's verdict and serialized evidence.
#[derive(Debug, Clone)]
pub struct Assessment {
    /// The assessed generation's identity, in directory-name form.
    pub generation: String,
    /// Whether the report's thresholds hold.
    pub passes: bool,
    /// The full [`QualityReport`](super::report::QualityReport) as pretty-printed JSON.
    ///
    /// The self-describing evidence record.
    pub report: String,
}

/// Assesses the root's active generation against the live store.
///
/// The dataset is frozen at the snapshot the generation's metadata records, so artifact rows and
/// store identities describe one corpus.
///
/// # Panics
///
/// Panics when the root or generation cannot be opened, the generation records no snapshot axes,
/// the store cannot serve the snapshot, or the run fails; a measurement target reports its failures
/// by failing.
pub async fn assess_current(client: &mut Client, root: &str, options: AssessOptions) -> Assessment {
    let root =
        GenerationRoot::new(Utf8PathBuf::from(root)).expect("the generation root should open");
    let id = root
        .current()
        .expect("the current pointer should read")
        .expect("an assessment requires an activated generation");
    let generation = root.open(id).expect("the active generation should open");

    let axes = generation
        .repository()
        .metadata
        .snapshot
        .axes
        .expect("a live generation records its snapshot axes");
    let dataset = PostgresDataset::new(client, axes)
        .await
        .expect("the store should serve the recorded snapshot");

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
    .expect("the quality run should produce a report");

    Assessment {
        generation: id.to_string(),
        passes: report.passes(),
        report: serde_json::to_string_pretty(&report).expect("the report serializes"),
    }
}
