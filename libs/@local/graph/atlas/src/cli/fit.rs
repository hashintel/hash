//! The fit command: one production generation over the live store.

use core::{error::Error, fmt, num::NonZero};
use std::{io, time::Instant};

use camino::Utf8PathBuf;
use clap::Args;

use super::store::{ConnectError, connect};
use crate::{
    dataset::TemporalAxes,
    progress::NoProgress,
    salt::runner::live::{ClassifierSource, Options, Placement, RunError, live},
    serve::GenerationRoot,
};

/// Store, root, and run settings of one fit.
#[derive(Debug, Args)]
#[command(group = clap::ArgGroup::new("classifier_input")
    .required(true)
    .args(["annotations", "classifier"]))]
#[expect(
    clippy::struct_excessive_bools,
    reason = "the flags are independent operator switches"
)]
pub struct FitArgs {
    /// The generation root directory.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ROOT", default_value_t = super::default_root())]
    root: Utf8PathBuf,

    /// The run seed; equal seeds replay every draw, the admission probe's included.
    #[arg(long, env = "HASH_GRAPH_ATLAS_SEED", default_value_t = 0)]
    seed: u64,

    /// The landmark capacity.
    #[arg(long, default_value = "4096")]
    landmarks: NonZero<u32>,

    /// Ignore the root's active generation instead of reusing it as the prior.
    #[arg(long)]
    fresh: bool,

    /// Sampled anchor rows of the admission probe.
    #[arg(long, default_value = "1024")]
    anchors: NonZero<usize>,

    /// Sampled comparison rows of the admission probe.
    #[arg(long, default_value = "4096")]
    comparisons: NonZero<usize>,

    /// Path of a reviewed-verdicts document to supply.
    ///
    /// The trained placement's phase boundary freezes its Proximal radius from the reviewed pairs,
    /// so a corpus whose relations carry Proximal force needs one to train.
    #[arg(long, env = "HASH_GRAPH_ATLAS_VERDICTS")]
    verdicts: Option<Utf8PathBuf>,

    /// Path of a quality-thresholds document overriding the source defaults.
    ///
    /// A JSON object with any of `minimum_recall`, `minimum_trustworthiness`,
    /// `minimum_continuity`, `maximum_intrusion_rate`, `minimum_triplet_agreement` (each in
    /// `[0, 1]`) and `maximum_density_spread` (finite, non-negative, at most the `f32` maximum).
    /// A present field overrides its default, an unknown field refuses the document, and an
    /// out-of-domain value refuses the run before it starts. The source defaults are maximally
    /// permissive, gating evidence presence rather than fidelity.
    #[arg(long, env = "HASH_GRAPH_ATLAS_QUALITY_THRESHOLDS")]
    quality_thresholds: Option<Utf8PathBuf>,

    /// Path of an annotation-corpus document: the classifier's training supply.
    ///
    /// The run assembles it, fits the relation classifier, and stages the corpus, the embedding
    /// table, and the model beside the generation.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ANNOTATIONS")]
    annotations: Option<Utf8PathBuf>,

    /// Path of a fitted classifier artifact (.clsf) to supply in place of fitting one.
    #[arg(long, env = "HASH_GRAPH_ATLAS_CLASSIFIER")]
    classifier: Option<Utf8PathBuf>,

    /// Override the trained placement's step count.
    ///
    /// Keeps the ratified options and the midpoint boundary.
    #[arg(long)]
    projector_steps: Option<NonZero<usize>>,

    /// Place at the landmark baseline instead of training the projector: the fallback placer.
    #[arg(long)]
    baseline: bool,

    /// Assert the Proximal radius instead of measuring it at the phase boundary.
    ///
    /// Finite, above the Coincident radius `0.05`; contradicts --baseline.
    #[arg(long, conflicts_with = "baseline")]
    assert_proximal_radius: Option<f32>,

    /// Train the full placement with the relation evidence withheld.
    ///
    /// No reviewed verdicts or radius needed, every other objective term trains. The unblocking
    /// flag for corpora without reviewed-Proximal coverage.
    #[arg(
        long,
        conflicts_with = "baseline",
        conflicts_with = "assert_proximal_radius"
    )]
    vacuous_placement: bool,

    /// Construct the k-NN lists by NN-Descent instead of the HNSW backend.
    ///
    /// Either construction answers to the same recall admission.
    #[arg(long)]
    nn_descent: bool,

    /// Where the admission report JSON lands.
    #[arg(long, default_value = "admission-report.json")]
    report: Utf8PathBuf,
}

impl FitArgs {
    /// Resolves the parsed flags into the run's typed options.
    fn options(self) -> (Utf8PathBuf, Utf8PathBuf, Options<NoProgress>) {
        let classifier = match (self.annotations, self.classifier) {
            (Some(annotations), None) => ClassifierSource::Annotations(annotations),
            (None, Some(artifact)) => ClassifierSource::Artifact(artifact),
            // The `classifier_input` argument group is required with
            // exactly one member; the parser refuses every other shape.
            _ => unreachable!("the classifier_input argument group admits exactly one path"),
        };

        let placement = if self.baseline {
            Placement::Baseline
        } else {
            Placement::Projector {
                steps: self.projector_steps,
                asserted_radius: self.assert_proximal_radius,
                vacuous: self.vacuous_placement,
            }
        };

        let options = Options {
            seed: self.seed,
            landmarks: self.landmarks,
            fresh: self.fresh,
            anchors: self.anchors,
            comparisons: self.comparisons,
            verdicts: self.verdicts,
            quality_thresholds: self.quality_thresholds,
            classifier,
            placement,
            nn_descent: self.nn_descent,
            progress: NoProgress,
        };

        (self.root, self.report, options) // NOTE: two `Utf8PathBuf` in the same tuple, that's bad, would it make sense to shrimply just implement `Parse` on `GenerationRoot`? it also seems like we're not using any of the more advanced clap features like hints, should I download some docs or smth for you?
    }
}

/// One fit invocation's failure, by step.
///
/// The store and run variants splice into the chain transparently (their display text and sources
/// are the wrapped fault's, unchanged); the root and report variants name their own steps.
#[derive(Debug)]
pub enum FitError {
    /// The generation root could not open.
    Root(io::Error),
    /// The store connection failed.
    Connect(ConnectError),
    /// The run failed.
    Run(RunError),
    /// The admission report could not be written.
    Io(io::Error),
}

impl fmt::Display for FitError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(_) => fmt.write_str("the generation root could not open"),
            Self::Connect(error) => fmt::Display::fmt(error, fmt),
            Self::Run(error) => fmt::Display::fmt(error, fmt),
            Self::Io(_) => fmt.write_str("the admission report could not be written"),
        }
    }
}

impl Error for FitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Root(error) | Self::Io(error) => Some(error),
            Self::Connect(error) => error.source(),
            Self::Run(error) => error.source(),
        }
    }
}

impl From<io::Error> for FitError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<RunError> for FitError {
    fn from(value: RunError) -> Self {
        Self::Run(value)
    }
}

impl From<ConnectError> for FitError {
    fn from(value: ConnectError) -> Self {
        Self::Connect(value)
    }
}

/// Runs one production generation run over the store at `dsn` and prints its summary.
///
/// The hosting binary supplies the connection string; the graph binary renders it from the same
/// store flags its server reads, and the standalone binary from [`StoreArgs`](super::StoreArgs).
/// The snapshot is pinned here: the run reads the store as of the moment the command starts.
///
/// # Errors
///
/// Returns a [`FitError`] naming the step that failed: opening the generation root, dialing the
/// store, the run itself, or writing the admission report.
#[expect(
    clippy::print_stdout,
    clippy::use_debug,
    reason = "the summary is the command's product; option sets and `Duration` format through \
              `Debug`"
)]
pub async fn fit(args: FitArgs, dsn: &str) -> Result<(), FitError> {
    // NOTE: why isn't this just `FitCommand::run`? and `FitArgs -> FitCommand`
    crate::math::kernel::verify_cpu_baseline();

    let (root, report, options) = args.options();
    tracing::info!(
        %root,
        seed = options.seed,
        landmarks = options.landmarks.get(),
        fresh = options.fresh,
        anchors = options.anchors.get(),
        comparisons = options.comparisons.get(),
        verdicts = ?options.verdicts,
        quality_thresholds = ?options.quality_thresholds,
        classifier = ?options.classifier,
        placement = ?options.placement,
        nn_descent = options.nn_descent,
        "starting the production run"
    );

    let root = GenerationRoot::new(root).map_err(FitError::Root)?;
    let mut client = connect(dsn).await?;

    let started = Instant::now();
    let summary = live(&mut client, root, TemporalAxes::now(), options).await?;
    let elapsed = started.elapsed();

    std::fs::write(&report, &summary.report).map_err(FitError::Io)?;

    // NOTE: surely there's a prettier way to do this :3
    println!();
    println!("generation  {}", summary.generation);
    println!("nodes       {}", summary.nodes);
    println!("edges       {}", summary.edges);
    println!("recall      {:.4}", summary.recall);
    println!(
        "cards       {} reused, {} embedded",
        summary.reused, summary.embedded
    );
    println!("passes      {}", summary.passes);
    println!("activated   {}", summary.activated);
    println!("report      {report}");
    println!("wall        {elapsed:.1?}");

    Ok(())
}
