//! Operating the pipeline: one production run over a live store.
//!
//! The operator seam the [`cli`](crate::cli) commands consume: dial the store ([`connect`]), drive
//! the production generation runner end to end ([`live`]) - prior resolution, fit, admission probe,
//! and the activation decision - and read a plain-number summary. Failures return errors naming the
//! failing step, the specific fault chained beneath. The `bench` measurement seams wrap this module
//! with their own contract - failures panic, the error is the diagnosis - so the two features share
//! one implementation.
//!
//! The run embeds cards with the crate's deterministic stand-in embedder while the
//! embedding-provider seam is unbuilt; the embedder fingerprint recorded in the published artifacts
//! discloses the substitution. The relation classifier is real: supplied as a fitted artifact, or
//! fitted in-run from a supplied annotation corpus (exactly one of the two).
//!
//! Nothing here is API for consumers of the crate; the module exists for the `cli` operator
//! commands and the `bench` measurement wrappers.

use core::{error::Error as CoreError, fmt, num::NonZero};
use std::io;

use camino::Utf8PathBuf;
use tokio_postgres::{Client, Config, NoTls, config::Host};

use crate::{
    dataset::{
        TemporalAxes,
        postgres::{PostgresDataset, PostgresDatasetError},
    },
    file::generation::GenerationRoot,
    math::AffinityCurve,
    salt::{
        fit::{
            ClassifierInput, ClassifierSupplyError, FitConfig, KnnConstructionChoice,
            PlacementOptions, ProjectorOptions, SuppliedAnnotations, SuppliedVerdicts,
            annotations::SupplyError as AnnotationSupplyError, stub::StubEmbedder,
            verdicts::SupplyError as VerdictSupplyError,
        },
        knn::descent::NnDescentOptions,
        landmark::select::SelectionOptions,
        projector::train::{RelationLens, TrainingSchedule},
        runner::{Admission, PriorMode, RunnerError, RunnerOptions, run},
    },
};

/// The refresh cadence of a step-count-overridden projector run.
const REFRESH: NonZero<usize> = const { NonZero::new(250).unwrap() };

/// The store could not be dialed.
#[derive(Debug)]
pub enum ConnectError {
    /// The connection string did not parse.
    Parse(tokio_postgres::Error),
    /// The connection string names no TCP host.
    NoTcpHost,
    /// The store refused the TCP connection.
    Connect(io::Error),
    /// The store handshake failed.
    Handshake(tokio_postgres::Error),
}

impl fmt::Display for ConnectError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Parse(_) => fmt.write_str("the connection string did not parse"),
            Self::NoTcpHost => fmt.write_str("the connection string names no TCP host"),
            Self::Connect(_) => fmt.write_str("the store refused the TCP connection"),
            Self::Handshake(_) => fmt.write_str("the store handshake failed"),
        }
    }
}

impl CoreError for ConnectError {
    fn source(&self) -> Option<&(dyn CoreError + 'static)> {
        match self {
            Self::Parse(error) | Self::Handshake(error) => Some(error),
            Self::NoTcpHost => None,
            Self::Connect(error) => Some(error),
        }
    }
}

/// Dials the store named by the connection string and drives the connection on a background task.
///
/// # Errors
///
/// Returns a [`ConnectError`] when the connection string does not parse or names no TCP host, or
/// when the store refuses the connection or handshake.
pub async fn connect(dsn: &str) -> Result<Client, ConnectError> {
    let config: Config = dsn.parse().map_err(ConnectError::Parse)?;
    let host = config
        .get_hosts()
        .iter()
        .find_map(|host| match host {
            Host::Tcp(name) => Some(name.clone()),
            #[cfg(unix)]
            Host::Unix(_) => None,
        })
        .ok_or(ConnectError::NoTcpHost)?;
    // 5432 is the protocol's registered port, the same default the
    // connection-string parser applies.
    let port = config.get_ports().first().copied().unwrap_or(5432);

    let stream = tokio::net::TcpStream::connect((host.as_str(), port))
        .await
        .map_err(ConnectError::Connect)?;
    let (client, connection) = config
        .connect_raw(stream, NoTls)
        .await
        .map_err(ConnectError::Handshake)?;
    tokio::spawn(async move {
        if let Err(error) = connection.await {
            tracing::error!(%error, "the store connection failed");
        }
    });

    Ok(client)
}

/// Options of one production run.
#[derive(Debug, Clone)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "the seam mirrors the binary's independent operator flags"
)]
pub struct Options {
    /// The fit seed; equal seeds replay every draw of the run, the admission probe's included.
    pub seed: u64 = 0,
    /// The landmark capacity `M`.
    pub landmarks: NonZero<u32> = const { NonZero::new(4_096).unwrap() },
    /// Run without a prior even when the root holds an active generation.
    pub fresh: bool = false,
    /// Assert the Proximal radius instead of measuring it.
    ///
    /// The trainer freezes this value where a calibration pass would have measured one. Finite,
    /// above the Coincident radius.
    pub asserted_proximal_radius: Option<f32> = None,
    /// Withhold the relation evidence from the trained placement.
    ///
    /// Every other objective term trains and no reviewed verdicts are demanded. For corpora without
    /// reviewed-Proximal coverage that still want the full trained placement.
    pub vacuous_placement: bool = false,
    /// Sampled anchor rows of the admission probe.
    pub anchors: NonZero<usize> = const { NonZero::new(1_024).unwrap() },
    /// Sampled comparison rows of the admission probe.
    pub comparisons: NonZero<usize> = const { NonZero::new(4_096).unwrap() },
    /// Path of a reviewed-verdicts document to supply to the run.
    ///
    /// The trained placement's phase boundary freezes its Proximal radius from the reviewed pairs,
    /// so a corpus whose relations carry Proximal force needs one (or an asserted radius) to train.
    pub verdicts: Option<String> = None,
    /// Path of an annotation-corpus document: the classifier's training supply.
    ///
    /// The run assembles it, fits the relation classifier, and stages the corpus, the embedding
    /// table, and the model. Exactly one of `annotations` and `classifier` must be supplied.
    pub annotations: Option<String> = None,
    /// Path of a fitted classifier artifact (`.clsf`) to supply in place of fitting one.
    ///
    /// Exactly one of `annotations` and `classifier` must be supplied.
    pub classifier: Option<String> = None,
    /// Override the trained placement's step count.
    ///
    /// Keeps the ratified options and the midpoint boundary. Absent, the configuration default
    /// trains.
    pub projector_steps: Option<NonZero<usize>> = None,
    /// Place at the landmark baseline instead of training.
    ///
    /// The fallback placer, for running without the training stage.
    pub baseline: bool = false,
    /// Construct the k-NN lists by NN-Descent instead of the HNSW backend.
    ///
    /// Either construction answers to the same recall admission.
    pub nn_descent: bool = false,
}

/// Plain-number summary of one production run.
#[derive(Debug, Clone)]
pub struct Summary {
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

/// The snapshot step's fault.
///
/// The store dataset could not open a transaction over the current snapshot.
#[derive(Debug)]
pub struct SnapshotError(PostgresDatasetError);

impl fmt::Display for SnapshotError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CoreError for SnapshotError {
    fn source(&self) -> Option<&(dyn CoreError + 'static)> {
        self.0.source()
    }
}

/// The verdicts step's fault: the reviewed-verdicts document was refused.
#[derive(Debug)]
pub struct VerdictsError(VerdictSupplyError);

impl fmt::Display for VerdictsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CoreError for VerdictsError {
    fn source(&self) -> Option<&(dyn CoreError + 'static)> {
        self.0.source()
    }
}

/// The annotations step's fault: the annotation-corpus document was refused.
#[derive(Debug)]
pub struct AnnotationsError(AnnotationSupplyError);

impl fmt::Display for AnnotationsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CoreError for AnnotationsError {
    fn source(&self) -> Option<&(dyn CoreError + 'static)> {
        self.0.source()
    }
}

/// The classifier step's fault: the fitted-classifier artifact was refused.
#[derive(Debug)]
pub struct ClassifierError(ClassifierSupplyError);

impl fmt::Display for ClassifierError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CoreError for ClassifierError {
    fn source(&self) -> Option<&(dyn CoreError + 'static)> {
        self.0.source()
    }
}

/// The run step's fault: the generation runner could not reach a verdict.
#[derive(Debug)]
pub struct PipelineError(RunnerError<PostgresDatasetError, !>);

impl fmt::Display for PipelineError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, fmt)
    }
}

impl CoreError for PipelineError {
    fn source(&self) -> Option<&(dyn CoreError + 'static)> {
        self.0.source()
    }
}

/// One production run's failure, by step.
///
/// Every variant names the step that failed and holds that step's concrete fault - nothing erases
/// to `dyn`. The wrapper types splice into the chain transparently (their display text and sources
/// are the wrapped fault's, unchanged), so the operator surface stays concrete while the pipeline's
/// error taxonomy stays crate-private.
#[derive(Debug)]
pub enum RunError {
    /// The generation root could not open.
    Root(io::Error),
    /// The store could not open a snapshot transaction.
    Snapshot(SnapshotError),
    /// The supplied verdicts document was refused.
    Verdicts(VerdictsError),
    /// The supplied annotation-corpus document was refused.
    Annotations(AnnotationsError),
    /// The supplied classifier artifact was refused.
    Classifier(ClassifierError),
    /// The classifier input is missing or doubled.
    ///
    /// Exactly one of the annotation-corpus and classifier-artifact paths must be supplied.
    ClassifierInput,
    /// The asserted Proximal radius was refused.
    ///
    /// The value must be finite and strictly above the Coincident radius.
    ProximalRadius(f32),
    /// The run could not reach a verdict.
    Run(PipelineError),
}

impl fmt::Display for RunError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Root(_) => fmt.write_str("the generation root could not open"),
            Self::Snapshot(_) => fmt.write_str("the store could not open a snapshot transaction"),
            Self::Verdicts(_) => fmt.write_str("the supplied verdicts document was refused"),
            Self::Annotations(_) => {
                fmt.write_str("the supplied annotation-corpus document was refused")
            }
            Self::Classifier(_) => fmt.write_str("the supplied classifier artifact was refused"),
            Self::ClassifierInput => fmt.write_str(
                "exactly one of the annotation-corpus and classifier-artifact paths must be \
                 supplied",
            ),
            Self::ProximalRadius(radius) => write!(
                fmt,
                "the asserted Proximal radius {radius} is not finite and strictly above the \
                 Coincident radius",
            ),
            Self::Run(_) => fmt.write_str("the run could not reach a verdict"),
        }
    }
}

impl CoreError for RunError {
    fn source(&self) -> Option<&(dyn CoreError + 'static)> {
        match self {
            Self::Root(error) => Some(error),
            Self::Snapshot(error) => Some(error),
            Self::Verdicts(error) => Some(error),
            Self::Annotations(error) => Some(error),
            Self::Classifier(error) => Some(error),
            Self::Run(error) => Some(error),
            Self::ProximalRadius(_) | Self::ClassifierInput => None,
        }
    }
}

/// Resolves the run's classifier input from the exactly-one path pair.
fn classifier_input(options: &Options) -> Result<ClassifierInput, RunError> {
    match (
        options.annotations.as_deref(),
        options.classifier.as_deref(),
    ) {
        (Some(annotations), None) => Ok(ClassifierInput::Annotations(
            SuppliedAnnotations::open(annotations)
                .map_err(|error| RunError::Annotations(AnnotationsError(error)))?,
        )),
        (None, Some(classifier)) => ClassifierInput::open_artifact(classifier)
            .map_err(|error| RunError::Classifier(ClassifierError(error))),
        (None, None) | (Some(_), Some(_)) => Err(RunError::ClassifierInput),
    }
}

/// Runs one production generation over the store's current snapshot.
///
/// The published generation lands in the generation root at `root`.
///
/// # Errors
///
/// Returns a [`RunError`] naming the step that failed: opening the root, opening the snapshot
/// transaction, admitting the supplied verdicts, annotation-corpus, or classifier documents,
/// validating the asserted Proximal radius, or the run itself.
///
/// # Panics
///
/// Panics when the options contradict: an asserted Proximal radius or a vacuous placement combined
/// with the landmark baseline. The binary's flag parser refuses both combinations before this seam
/// sees them.
pub async fn live(client: &mut Client, root: &str, options: Options) -> Result<Summary, RunError> {
    let root = GenerationRoot::new(Utf8PathBuf::from(root)).map_err(RunError::Root)?;
    let dataset = PostgresDataset::new(client, TemporalAxes::now())
        .await
        .map_err(|error| RunError::Snapshot(SnapshotError(error)))?;

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
    if options.nn_descent {
        runner_options.fit.construction =
            KnnConstructionChoice::Descent(NnDescentOptions::default());
    }
    match (options.baseline, options.projector_steps) {
        (true, _) => runner_options.fit.placement = PlacementOptions::LandmarkBaseline,
        (false, Some(steps)) => {
            // The midpoint boundary splits the opening segment and the
            // ladder evenly, mirroring the ratified schedule's shape.
            let boundary = steps.get().div_euclid(2);
            let mut projector = ProjectorOptions::ratified();
            projector.schedule = TrainingSchedule::new(steps, boundary, REFRESH, 1.0e-3, 1.0e-5)
                .expect("the ratified schedule domain admits any step count");
            runner_options.fit.placement = PlacementOptions::Projector(projector);
        }
        (false, None) => {}
    }
    if let Some(radius) = options.asserted_proximal_radius {
        let mut projector = match runner_options.fit.placement {
            PlacementOptions::Projector(projector) => projector,
            PlacementOptions::LandmarkBaseline => panic!(
                "an asserted Proximal radius contradicts the landmark baseline: no training run \
                 consumes it"
            ),
        };
        projector.lens = RelationLens::new(
            projector.lens.coincident(),
            projector.lens.temperature(),
            projector.lens.epsilon(),
            Some(radius),
        )
        .ok_or(RunError::ProximalRadius(radius))?;
        runner_options.fit.placement = PlacementOptions::Projector(projector);
    }
    if options.vacuous_placement {
        let mut projector = match runner_options.fit.placement {
            PlacementOptions::Projector(projector) => projector,
            PlacementOptions::LandmarkBaseline => panic!(
                "a vacuous placement contradicts the landmark baseline: it configures the \
                 training run the baseline skips"
            ),
        };
        projector.vacuous = true;
        runner_options.fit.placement = PlacementOptions::Projector(projector);
    }

    let verdicts = options
        .verdicts
        .as_deref()
        .map(SuppliedVerdicts::open)
        .transpose()
        .map_err(|error| RunError::Verdicts(VerdictsError(error)))?;

    let classifier = classifier_input(&options)?;

    let outcome = run(
        &dataset,
        &StubEmbedder,
        &classifier,
        verdicts.as_ref(),
        &root,
        &runner_options,
    )
    .await
    .map_err(|error| RunError::Run(PipelineError(error)))?;

    let metadata = &outcome.generation.repository().metadata;
    Ok(Summary {
        generation: outcome.generation.id().to_string(),
        nodes: metadata.snapshot.nodes,
        edges: metadata.snapshot.edges,
        recall: metadata.evidence.recall.recall(),
        reused: metadata.evidence.cards.reused,
        embedded: metadata.evidence.cards.embedded,
        passes: outcome.report.passes(),
        activated: outcome.admission == Admission::Active,
        report: serde_json::to_string_pretty(&outcome.report).expect("the report serializes"),
    })
}
