//! The fit command: one production generation over the live store.

use core::{error::Error, fmt, num::NonZero, time::Duration};
use std::{io, time::Instant};

use camino::{Utf8Path, Utf8PathBuf};
use clap::{Args, ValueHint};
use tokio_postgres::Client;

use crate::{
    dataset::TemporalAxes,
    progress::NoProgress,
    salt::runner::live::{ClassifierSource, Options, Placement, RunError, Summary, live},
    serve::GenerationRoot,
};

/// Root and run settings of one fit.
#[derive(Debug, Args)]
#[command(group = clap::ArgGroup::new("classifier_input")
    .required(true)
    .args(["annotations", "classifier"]))]
#[expect(
    clippy::struct_excessive_bools,
    reason = "the flags are independent operator switches"
)]
pub struct FitArgs {
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
    #[arg(long, env = "HASH_GRAPH_ATLAS_VERDICTS", value_hint = ValueHint::FilePath)]
    verdicts: Option<Utf8PathBuf>,

    /// Path of a quality-thresholds document overriding the source defaults.
    ///
    /// A JSON object with any of `minimum_recall`, `minimum_trustworthiness`,
    /// `minimum_continuity`, `maximum_intrusion_rate`, `minimum_triplet_agreement` (each in
    /// `[0, 1]`) and `maximum_density_spread` (finite, non-negative, at most the `f32` maximum).
    /// A present field overrides its default, an unknown field refuses the document, and an
    /// out-of-domain value refuses the run before it starts. The source defaults are maximally
    /// permissive, gating evidence presence rather than fidelity.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_QUALITY_THRESHOLDS",
        value_hint = ValueHint::FilePath,
    )]
    quality_thresholds: Option<Utf8PathBuf>,

    /// Path of an annotation-corpus document: the classifier's training supply.
    ///
    /// The run assembles it, fits the relation classifier, and stages the corpus, the embedding
    /// table, and the model beside the generation.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ANNOTATIONS", value_hint = ValueHint::FilePath)]
    annotations: Option<Utf8PathBuf>,

    /// Path of a fitted classifier artifact (.clsf) to supply in place of fitting one.
    #[arg(long, env = "HASH_GRAPH_ATLAS_CLASSIFIER", value_hint = ValueHint::FilePath)]
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
    #[arg(long, default_value = "admission-report.json", value_hint = ValueHint::FilePath)]
    report: Utf8PathBuf,
}

/// One fit invocation's failure, by step.
///
/// The run variant splices into the chain transparently (its display text and sources are the
/// wrapped fault's, unchanged); the report variant names its own step.
#[derive(Debug)]
pub enum FitError {
    /// The run failed.
    Run(RunError),
    /// The admission report could not be written.
    Io(io::Error),
}

impl fmt::Display for FitError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Run(error) => fmt::Display::fmt(error, fmt),
            Self::Io(_) => fmt.write_str("the admission report could not be written"),
        }
    }
}

impl Error for FitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Run(error) => error.source(),
            Self::Io(error) => Some(error),
        }
    }
}

impl From<RunError> for FitError {
    fn from(value: RunError) -> Self {
        Self::Run(value)
    }
}

impl From<io::Error> for FitError {
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

/// The command's printed verdict: the run summary, the report location, and the wall time.
struct Verdict<'data> {
    summary: &'data Summary,
    report: &'data Utf8Path,
    elapsed: Duration,
}

impl fmt::Display for Verdict<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(fmt)?;
        writeln!(fmt, "generation  {}", self.summary.generation)?;
        writeln!(fmt, "nodes       {}", self.summary.nodes)?;
        writeln!(fmt, "edges       {}", self.summary.edges)?;
        writeln!(fmt, "recall      {:.4}", self.summary.recall)?;
        writeln!(
            fmt,
            "cards       {} reused, {} embedded",
            self.summary.reused, self.summary.embedded
        )?;
        writeln!(fmt, "passes      {}", self.summary.passes)?;
        writeln!(fmt, "activated   {}", self.summary.activated)?;
        writeln!(fmt, "report      {}", self.report)?;
        write!(fmt, "wall        {:.1}s", self.elapsed.as_secs_f64())
    }
}

/// One fit invocation, resolved: the run's typed options over an opened root.
#[derive(Debug)]
pub struct FitCommand {
    root: GenerationRoot,
    report: Utf8PathBuf,
    options: Options<NoProgress>,
}

impl FitCommand {
    /// Runs one production generation over the live store and prints its summary.
    ///
    /// The hosting binary supplies the dialed store connection ([`PostgresArgs::connect`] in the
    /// standalone shell, [`connect`] behind the graph binary's own store flags). The snapshot is
    /// pinned here: the run reads the store as of the moment the command starts.
    ///
    /// # Errors
    ///
    /// Returns a [`FitError`] naming the step that failed: the run itself, or writing the
    /// admission report.
    ///
    /// [`PostgresArgs::connect`]: super::PostgresArgs::connect
    /// [`connect`]: super::connect
    #[expect(clippy::print_stdout, reason = "the summary is the command's product")]
    pub async fn run(self, client: &mut Client) -> Result<(), FitError> {
        crate::math::kernel::verify_cpu_baseline();

        tracing::info!(
            root = %self.root.path(),
            seed = self.options.seed,
            landmarks = self.options.landmarks.get(),
            fresh = self.options.fresh,
            anchors = self.options.anchors.get(),
            comparisons = self.options.comparisons.get(),
            verdicts = ?self.options.verdicts,
            quality_thresholds = ?self.options.quality_thresholds,
            classifier = ?self.options.classifier,
            placement = ?self.options.placement,
            nn_descent = self.options.nn_descent,
            "starting the production run"
        );

        let started = Instant::now();
        let summary = live(client, self.root, TemporalAxes::now(), self.options).await?;
        let elapsed = started.elapsed();

        std::fs::write(&self.report, &summary.report).map_err(FitError::Io)?;

        println!(
            "{}",
            Verdict {
                summary: &summary,
                report: &self.report,
                elapsed,
            }
        );

        Ok(())
    }

    /// Resolves the parsed flags into one fit invocation over the root.
    #[must_use]
    pub fn new(root: super::RootArgs, args: FitArgs) -> Self {
        let classifier = match (args.annotations, args.classifier) {
            (Some(annotations), None) => ClassifierSource::Annotations(annotations),
            (None, Some(artifact)) => ClassifierSource::Artifact(artifact),
            // The `classifier_input` argument group is required with
            // exactly one member; the parser refuses every other shape.
            _ => unreachable!("the classifier_input argument group admits exactly one path"),
        };

        let placement = if args.baseline {
            Placement::Baseline
        } else {
            Placement::Projector {
                steps: args.projector_steps,
                asserted_radius: args.assert_proximal_radius,
                vacuous: args.vacuous_placement,
            }
        };

        Self {
            root: root.root,
            report: args.report,
            options: Options {
                seed: args.seed,
                landmarks: args.landmarks,
                fresh: args.fresh,
                anchors: args.anchors,
                comparisons: args.comparisons,
                verdicts: args.verdicts,
                quality_thresholds: args.quality_thresholds,
                classifier,
                placement,
                nn_descent: args.nn_descent,
                progress: NoProgress,
            },
        }
    }
}
