//! Operating the pipeline: one production run over a live store.
//!
//! The operator seam the `atlas` binary consumes: dial the store
//! ([`connect`]), drive the production generation runner end to end
//! ([`live`]) - prior resolution, fit, admission probe, and the
//! activation decision - and read a plain-number summary. Failures
//! return errors naming the failing step, the specific fault chained
//! beneath. The `bench` measurement seams wrap this module with
//! their own contract - failures panic, the error is the diagnosis -
//! so the two features share one implementation.
//!
//! The run embeds cards and classifies relations with the crate's
//! deterministic stand-ins while the training ingestion seam is
//! unbuilt; the embedder fingerprint recorded in the published
//! artifacts discloses the substitution.
//!
//! Nothing here is API for consumers of the crate; the module exists
//! for the `cli` binary and the `bench` measurement wrappers.

use core::{error::Error as CoreError, fmt, num::NonZero};
use std::io;

use camino::Utf8PathBuf;
use tokio_postgres::{Client, Config, NoTls, config::Host};

use crate::{
    dataset::{TemporalAxes, postgres::PostgresDataset},
    file::generation::GenerationRoot,
    math::AffinityCurve,
    salt::{
        fit::{
            ClassifierInput, FitConfig, PlacementOptions, ProjectorOptions, SuppliedAnnotations,
            SuppliedVerdicts, stub::StubEmbedder,
        },
        landmark::select::SelectionOptions,
        projector::train::{RelationLens, TrainingSchedule},
        runner::{Admission, PriorMode, RunnerOptions, run},
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

/// Dials the store named by the connection string and drives the
/// connection on a background task.
///
/// # Errors
///
/// Returns a [`ConnectError`] when the connection string does not
/// parse or names no TCP host, or when the store refuses the
/// connection or handshake.
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
pub struct Options {
    /// The fit seed; equal seeds replay every draw of the run, the
    /// admission probe's included.
    pub seed: u64 = 0,
    /// The landmark capacity `M`.
    pub landmarks: NonZero<u32> = const { NonZero::new(4_096).unwrap() },
    /// Run without a prior even when the root holds an active
    /// generation.
    pub fresh: bool = false,
    /// Assert the Proximal radius instead of measuring it: the
    /// trainer freezes this value where a calibration pass would
    /// have measured one. Finite, above the Coincident radius.
    pub asserted_proximal_radius: Option<f32> = None,
    /// Withhold the relation evidence from the trained placement:
    /// every other objective term trains and no reviewed verdicts
    /// are demanded. For corpora without reviewed-Proximal coverage
    /// that still want the full trained placement.
    pub vacuous_placement: bool = false,
    /// Sampled anchor rows of the admission probe.
    pub anchors: NonZero<usize> = const { NonZero::new(1_024).unwrap() },
    /// Sampled comparison rows of the admission probe.
    pub comparisons: NonZero<usize> = const { NonZero::new(4_096).unwrap() },
    /// Path of a reviewed-verdicts document to supply to the run.
    /// The trained placement's phase boundary freezes its Proximal
    /// radius from the reviewed pairs, so a corpus whose relations
    /// carry Proximal force needs one (or an asserted radius) to
    /// train.
    pub verdicts: Option<String> = None,
    /// Path of an annotation-corpus document: the classifier's
    /// training supply. The run assembles it, fits the relation
    /// classifier, and stages the corpus, the embedding table, and
    /// the model. Exactly one of `annotations` and `classifier` must
    /// be supplied.
    pub annotations: Option<String> = None,
    /// Path of a fitted classifier artifact (`.clsf`) to supply in
    /// place of fitting one. Exactly one of `annotations` and
    /// `classifier` must be supplied.
    pub classifier: Option<String> = None,
    /// Override the trained placement's step count, keeping the
    /// ratified options and the midpoint boundary. Absent, the
    /// configuration default trains.
    pub projector_steps: Option<NonZero<usize>> = None,
    /// Place at the landmark baseline instead of training: the
    /// fallback placer, for running without the training stage.
    pub baseline: bool = false,
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

/// One production run's failure, by step.
///
/// Every variant names the step that failed; the source beneath
/// carries the specific fault.
#[derive(Debug)]
pub enum RunError {
    /// The generation root could not open.
    Root(io::Error),
    /// The store could not open a snapshot transaction.
    Snapshot(Box<dyn CoreError + Send + Sync>),
    /// The supplied verdicts document was refused.
    Verdicts(Box<dyn CoreError + Send + Sync>),
    /// The supplied annotation-corpus document was refused.
    Annotations(Box<dyn CoreError + Send + Sync>),
    /// The supplied classifier artifact was refused.
    Classifier(Box<dyn CoreError + Send + Sync>),
    /// The classifier input is missing or doubled: exactly one of the
    /// annotation-corpus and classifier-artifact paths must be
    /// supplied.
    ClassifierInput,
    /// The asserted Proximal radius was refused: the value must be
    /// finite and strictly above the Coincident radius.
    ProximalRadius(f32),
    /// The run could not reach a verdict.
    Run(Box<dyn CoreError + Send + Sync>),
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
            Self::Snapshot(error)
            | Self::Verdicts(error)
            | Self::Annotations(error)
            | Self::Classifier(error)
            | Self::Run(error) => Some(&**error),
            Self::ProximalRadius(_) | Self::ClassifierInput => None,
        }
    }
}

/// Runs one production generation run over the store's current
/// snapshot into the generation root at `root`.
///
/// # Errors
///
/// Returns an [`Error`] naming the step that failed: opening the
/// root, opening the snapshot transaction, admitting the supplied
/// verdicts document, validating the asserted Proximal radius, or
/// the run itself.
///
/// # Panics
///
/// Panics when the options contradict: an asserted Proximal radius
/// or a vacuous placement combined with the landmark baseline. The
/// binary's flag parser refuses both combinations before this seam
/// sees them.
pub async fn live(client: &mut Client, root: &str, options: Options) -> Result<Summary, RunError> {
    let root = GenerationRoot::new(Utf8PathBuf::from(root)).map_err(RunError::Root)?;
    let dataset = PostgresDataset::new(client, TemporalAxes::now())
        .await
        .map_err(|error| RunError::Snapshot(Box::new(error)))?;

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
        .map_err(|error| RunError::Verdicts(Box::new(error)))?;

    let classifier = match (
        options.annotations.as_deref(),
        options.classifier.as_deref(),
    ) {
        (Some(annotations), None) => ClassifierInput::Annotations(
            SuppliedAnnotations::open(annotations)
                .map_err(|error| RunError::Annotations(Box::new(error)))?,
        ),
        (None, Some(classifier)) => ClassifierInput::open_artifact(classifier)
            .map_err(|error| RunError::Classifier(Box::new(error)))?,
        (None, None) | (Some(_), Some(_)) => return Err(RunError::ClassifierInput),
    };

    let outcome = run(
        &dataset,
        &StubEmbedder,
        &classifier,
        verdicts.as_ref(),
        &root,
        &runner_options,
    )
    .await
    .map_err(|error| RunError::Run(Box::new(error)))?;

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
