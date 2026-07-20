//! Measurement seam over one live-store fit.
//!
//! The harness target (`examples/fit_live.rs`) dials the development
//! store, runs the production [`fit`] over its current snapshot, and
//! reads a plain-number summary. Per-stage wall clock comes from the
//! pipeline's stage spans, so the target installs a span-close
//! subscriber rather than timing stages itself; peak residency comes
//! from the operating system (`/usr/bin/time -l`). Nothing here is API
//! for consumers of the crate.
//!
//! Failures panic with the failing step's error: a measurement run has
//! no recovery path, and the error is the diagnosis.

use core::num::NonZero;

use camino::Utf8PathBuf;
use tokio_postgres::Client;

use super::{
    ClassifierInput, FitConfig, PlacementOptions, ProjectorOptions, SuppliedVerdicts, fit,
    stub::StubEmbedder,
};
use crate::{
    dataset::{CANONICAL_DIMENSIONS, TemporalAxes, postgres::PostgresDataset},
    file::generation::GenerationRoot,
    integrity::{Sha256, Update as _},
    math::{AffinityCurve, AlignedVecN, BoxedVecN},
    salt::{
        landmark::select::SelectionOptions,
        policy::classifier::{
            FitConfig as ClassifierFitConfig, TrainingRow, TrainingSet, fit as fit_classifier,
        },
        projector::train::TrainingSchedule,
    },
};

/// The refresh cadence of a step-count-overridden projector run.
const REFRESH: NonZero<usize> = const { NonZero::new(250).unwrap() };

/// Options of one measured fit.
#[derive(Debug, Clone)]
pub struct RunOptions {
    /// The fit seed; equal seeds replay every stage's random draws.
    pub seed: u64 = 0,
    /// The landmark capacity `M`. The default is the capacity the
    /// legacy pipeline profiled at the million-row scale.
    pub landmarks: NonZero<u32> = const { NonZero::new(4_096).unwrap() },
    /// Reuse the root's active generation as the prior: card rows by
    /// text hash, landmarks competing for the retained share.
    pub reuse_current: bool = false,
    /// Path of a reviewed-verdicts document to supply to the fit; the
    /// staged role and its manifest binding then exercise the same
    /// path production takes.
    pub verdicts: Option<String> = None,
    /// Override the trained placement's step count, keeping the
    /// reference options and the midpoint boundary. Absent, the
    /// configuration default (the reference schedule) trains.
    pub projector_steps: Option<NonZero<usize>> = None,
    /// Place at the landmark baseline instead of training: the
    /// fallback placer, for measuring the pipeline without the
    /// training stage.
    pub baseline: bool = false,
}

/// Plain-number summary of one published fit.
#[derive(Debug, Clone)]
pub struct FitSummary {
    /// The published generation's identity, in directory-name form.
    pub generation: String,
    /// Nodes the dataset streamed.
    pub nodes: u64,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// Ontology types the dataset streamed.
    pub ontology_types: u64,
    /// The admitted neighbour backend's measured recall.
    pub recall: f64,
    /// Unique card texts copied from the prior generation.
    pub reused: usize,
    /// Unique card texts submitted to the provider.
    pub embedded: usize,
    /// Landmarks selected.
    pub selected: u32,
    /// Landmarks retained from the prior generation.
    pub retained: u32,
}

/// Dials the store named by the connection string and drives the
/// connection on a background task.
///
/// # Panics
///
/// Panics when the store cannot be dialed; the
/// [`crate::run::ConnectError`] is the diagnosis.
pub async fn connect(dsn: &str) -> Client {
    crate::run::connect(dsn)
        .await
        .expect("the store should connect")
}

/// A deterministic classifier input fitted from a synthetic corpus.
///
/// The fixture keeps the harness's policy stage real - classification,
/// resolution, and both artifacts run against it - while the bench
/// measures the pipeline rather than the classifier supply.
#[must_use]
fn fixture_classifier() -> ClassifierInput {
    const ROWS: usize = 4;
    // Coprime to the dimension, so no two corpus rows repeat.
    const PATTERN: [f32; 13] = [
        -0.75, -0.625, -0.5, -0.375, -0.25, -0.125, 0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75,
    ];

    let mut storage = BoxedVecN::<{ ROWS * CANONICAL_DIMENSIONS }>::zero();
    for (component, &value) in storage
        .as_array_mut()
        .iter_mut()
        .zip(PATTERN.iter().cycle())
    {
        *component = value;
    }
    let embeddings = AlignedVecN::from_slice(storage.as_array()).expect("boxed storage is aligned");

    let rows: Vec<TrainingRow> = [
        ([0.7, 0.2, 0.1], b"group-a" as &[u8]),
        ([0.2, 0.6, 0.2], b"group-b"),
        ([0.1, 0.2, 0.7], b"group-c"),
        ([0.3, 0.4, 0.3], b"group-d"),
    ]
    .into_iter()
    .map(|(target, group)| {
        let mut hasher = Sha256::new();
        hasher.update(group);
        TrainingRow {
            target,
            weight: 1.0,
            group: hasher.finalize(),
        }
    })
    .collect();

    let training = TrainingSet::new(embeddings, &rows).expect("the fixture corpus validates");
    let classifier = fit_classifier(training, ClassifierFitConfig { folds: 2, .. })
        .expect("the fixture classifier fits")
        .classifier;

    let mut hasher = Sha256::new();
    hasher.update(b"bench fixture classifier");
    ClassifierInput::Supplied {
        classifier,
        source: hasher.finalize(),
    }
}

/// Runs one fit over the store's current snapshot into the generation
/// root at `root` and activates the published generation, so a later
/// `reuse_current` run finds it as the prior.
///
/// # Panics
///
/// Panics when any step fails: opening the root or the prior, opening
/// the snapshot transaction, any fit stage, or activation.
pub async fn run(client: &mut Client, root: &str, options: RunOptions) -> FitSummary {
    let root =
        GenerationRoot::new(Utf8PathBuf::from(root)).expect("the generation root should open");

    let prior = options.reuse_current.then(|| {
        let id = root
            .current()
            .expect("the current pointer should read")
            .expect("a reuse run requires an activated generation");
        root.open(id).expect("the active generation should open")
    });

    let dataset = PostgresDataset::new(client, TemporalAxes::now())
        .await
        .expect("the store should open a snapshot transaction");

    let mut config = FitConfig {
        seed: options.seed,
        selection: SelectionOptions {
            maximum_count: options.landmarks,
            ..
        },
        curve: AffinityCurve::fit(1.0, 0.1).expect("the reference falloff is well-conditioned"),
        ..
    };
    match (options.baseline, options.projector_steps) {
        (true, _) => config.placement = PlacementOptions::LandmarkBaseline,
        (false, Some(steps)) => {
            // The midpoint boundary splits the opening segment and the
            // ladder evenly, mirroring the ratified schedule's shape.
            let boundary = steps.get().div_euclid(2);
            let mut projector = ProjectorOptions::ratified();
            projector.schedule = TrainingSchedule::new(steps, boundary, REFRESH, 1.0e-3, 1.0e-5)
                .expect("the ratified schedule domain admits any step count");
            config.placement = PlacementOptions::Projector(projector);
        }
        (false, None) => {}
    }

    let verdicts = options
        .verdicts
        .as_deref()
        .map(|path| SuppliedVerdicts::open(path).expect("the supplied verdicts file should admit"));

    let classifier = fixture_classifier();
    let published = fit(
        &dataset,
        &StubEmbedder,
        &config,
        &classifier,
        verdicts.as_ref(),
        prior.as_ref(),
        &root,
    )
    .await
    .expect("the fit should publish");
    root.activate(published.id())
        .expect("the published generation should activate");

    let generation = root
        .open(published.id())
        .expect("the published generation should reopen");
    let metadata = &generation.repository().metadata;

    FitSummary {
        generation: published.id().to_string(),
        nodes: metadata.snapshot.nodes,
        edges: metadata.snapshot.edges,
        ontology_types: metadata.snapshot.ontology_types,
        recall: metadata.evidence.recall.recall(),
        reused: metadata.evidence.cards.reused,
        embedded: metadata.evidence.cards.embedded,
        selected: metadata.evidence.landmarks.selected,
        retained: metadata.evidence.landmarks.retained,
    }
}
