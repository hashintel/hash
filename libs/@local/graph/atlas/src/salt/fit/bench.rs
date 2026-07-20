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
    FitConfig, PlacementOptions, ProjectorOptions, SuppliedVerdicts, fit,
    migrate::migrate_adjacency as migrate_adjacency_inner,
    stub::{StubEmbedder, stub_classifier},
};
use crate::{
    dataset::{TemporalAxes, postgres::PostgresDataset},
    file::generation::GenerationRoot,
    math::AffinityCurve,
    salt::{landmark::select::SelectionOptions, projector::train::TrainingSchedule},
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

    let classifier = stub_classifier();
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

/// The report of one adjacency-format migration.
#[derive(Debug, Clone)]
pub struct MigrateSummary {
    /// The source generation, left untouched beside the result.
    pub source: String,
    /// The republished generation carrying the current adjacency
    /// format.
    pub published: String,
    /// Whether the root's pointer moved to the republished generation,
    /// which it does exactly when the source generation was current.
    pub activated: bool,
}

/// Migrates the published generation `generation` - or the root's
/// current one - to the current adjacency format.
///
/// The result publishes beside the untouched source, and the pointer
/// moves exactly when the source was current. The conversion is
/// store-free: the retired file's bytes hold the full lists, verified
/// against the document's recorded digest.
///
/// # Panics
///
/// Panics when any step fails: opening the root, resolving or parsing
/// the generation id, or the migration itself.
#[must_use]
pub fn migrate_adjacency(root: &str, generation: Option<&str>) -> MigrateSummary {
    let root =
        GenerationRoot::new(Utf8PathBuf::from(root)).expect("the generation root should open");
    let id = generation.map_or_else(
        || {
            root.current()
                .expect("the current pointer should read")
                .expect("a migration without an explicit generation requires a current one")
        },
        |value| value.parse().expect("the generation id should parse"),
    );

    let outcome = migrate_adjacency_inner(&root, id).expect("the migration should publish");

    MigrateSummary {
        source: id.to_string(),
        published: outcome.published.to_string(),
        activated: outcome.activated,
    }
}
