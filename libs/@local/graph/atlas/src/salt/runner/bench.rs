//! Measurement seam over one live production run.
//!
//! The harness target (`examples/generation_live.rs`) dials the
//! development store and drives the production [`run`] end to end:
//! prior resolution, fit, admission probe, and the activation
//! decision. The fit and quality seams measure their halves in
//! isolation; this seam measures the composition production takes.
//! Nothing here is API for consumers of the crate.
//!
//! Failures panic with the failing step's error: a measurement run
//! has no recovery path, and the error is the diagnosis.

use core::num::NonZero;

use camino::Utf8PathBuf;
use tokio_postgres::Client;

use super::{Admission, PriorMode, RunnerOptions, run};
use crate::{
    dataset::{TemporalAxes, postgres::PostgresDataset},
    file::generation::GenerationRoot,
    math::AffinityCurve,
    salt::{
        fit::{
            FitConfig,
            bench::{StubEmbedder, stub_classifier},
        },
        landmark::select::SelectionOptions,
    },
};

/// Options of one measured production run.
#[derive(Debug, Copy, Clone)]
pub struct LiveOptions {
    /// The fit seed; equal seeds replay every draw of the run, the
    /// admission probe's included.
    pub seed: u64 = 0,
    /// The landmark capacity `M`.
    pub landmarks: NonZero<u32> = const { NonZero::new(4_096).unwrap() },
    /// Run without a prior even when the root holds an active
    /// generation.
    pub fresh: bool = false,
    /// Sampled anchor rows of the admission probe.
    pub anchors: NonZero<usize> = const { NonZero::new(1_024).unwrap() },
    /// Sampled comparison rows of the admission probe.
    pub comparisons: NonZero<usize> = const { NonZero::new(4_096).unwrap() },
}

/// Plain-number summary of one production run.
#[derive(Debug, Clone)]
pub struct RunSummary {
    /// The published generation's identity, in directory-name form.
    pub generation: String,
    /// Nodes the dataset streamed.
    pub nodes: u64,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// The admitted neighbour backend's measured recall.
    pub recall: f64,
    /// Unique card texts copied from the prior generation.
    pub reused: usize,
    /// Unique card texts submitted to the provider.
    pub embedded: usize,
    /// Whether the admission report's gates held.
    pub passes: bool,
    /// Whether the generation was activated.
    pub activated: bool,
    /// The full admission report as pretty-printed JSON.
    pub report: String,
}

/// Runs one production generation run over the store's current
/// snapshot into the generation root at `root`.
///
/// # Panics
///
/// Panics when the root cannot open, the store cannot serve a
/// snapshot, or the run fails; a measurement target reports its
/// failures by failing.
pub async fn run_live(client: &mut Client, root: &str, options: LiveOptions) -> RunSummary {
    let root =
        GenerationRoot::new(Utf8PathBuf::from(root)).expect("the generation root should open");
    let dataset = PostgresDataset::new(client, TemporalAxes::now())
        .await
        .expect("the store should open a snapshot transaction");

    let mut runner_options = RunnerOptions {
        fit: FitConfig {
            seed: options.seed,
            selection: SelectionOptions {
                maximum_count: options.landmarks,
                ..
            },
            curve: AffinityCurve::fit(1.0, 0.1).expect("the reference falloff is well-conditioned"),
            ..
        },
        prior: if options.fresh {
            PriorMode::Fresh
        } else {
            PriorMode::ReuseActive
        },
        ..
    };
    runner_options.quality.probe.anchors = options.anchors;
    runner_options.quality.probe.comparisons = options.comparisons;

    let classifier = stub_classifier();
    let outcome = run(
        &dataset,
        &StubEmbedder,
        &classifier,
        None,
        &root,
        &runner_options,
    )
    .await
    .expect("the run should reach a verdict");

    let metadata = &outcome.generation.repository().metadata;
    RunSummary {
        generation: outcome.generation.id().to_string(),
        nodes: metadata.snapshot.nodes,
        edges: metadata.snapshot.edges,
        recall: metadata.evidence.recall.recall(),
        reused: metadata.evidence.cards.reused,
        embedded: metadata.evidence.cards.embedded,
        passes: outcome.report.passes(),
        activated: outcome.admission == Admission::Active,
        report: serde_json::to_string_pretty(&outcome.report).expect("the report serializes"),
    }
}
