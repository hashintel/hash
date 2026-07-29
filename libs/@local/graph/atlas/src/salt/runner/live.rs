//! The operator seam: one production run over a live store.
//!
//! [`live`] drives the generation runner end to end over a pinned snapshot - prior resolution,
//! fit, admission probe, and the activation decision - configured by [`Options`] and read back as
//! a plain-number [`Summary`]. Failures return a [`RunError`] naming the failing step, the step's
//! concrete fault chained beneath.
//!
//! The option vocabulary is typed: [`ClassifierSource`] names the classifier supply every run
//! carries, and [`Placement`] carries exactly the controls its placer consumes, so option
//! combinations the pipeline cannot honor are unrepresentable.
//!
//! The run embeds cards through the external embedding provider the shell constructs and
//! supplies; the embedder fingerprint recorded in the published artifacts names the provider
//! contract, and prior-generation reuse is guarded by fingerprint equality.
//!
//! Nothing here is API for consumers of the crate; the module exists for the
//! [`cli`](crate::cli) operator commands, which re-export its vocabulary.

use core::num::NonZero;
use std::io;

use camino::{Utf8Path, Utf8PathBuf};
use hash_graph_embeddings::OpenAiEmbeddingClient;
use tokio_postgres::Client;

use super::{Admission, PriorMode, RunnerError, RunnerOptions, run};
use crate::{
    dataset::{
        TemporalAxes,
        postgres::{PostgresDataset, PostgresDatasetError},
    },
    file::generation::GenerationRoot,
    math::{AffinityCurve, Positive, UnitFraction},
    progress::Progress,
    salt::{
        embedding::external::{ExternalEmbeddingError, ExternalEmbeddingProvider},
        fit::{
            ClassifierInput, ClassifierSupplyError, FitConfig, KnnConstructionChoice,
            PlacementOptions, ProjectorOptions, SuppliedAnnotations, SuppliedVerdicts,
            annotations::SupplyError as AnnotationSupplyError,
            verdicts::SupplyError as VerdictSupplyError,
        },
        knn::descent::NnDescentOptions,
        landmark::select::SelectionOptions,
        projector::{
            budget::Budget,
            train::{RelationLens, TrainingSchedule},
        },
        quality::report::{QualityThresholds, ThresholdDomainError, ThresholdOverrides},
    },
};

/// The default landmark capacity of a production run.
const DEFAULT_LANDMARKS: NonZero<u32> = const { NonZero::new(4_096).unwrap() };

/// The default anchor sample of the admission probe.
const DEFAULT_ANCHORS: NonZero<usize> = const { NonZero::new(1_024).unwrap() };

/// The default comparison sample of the admission probe.
const DEFAULT_COMPARISONS: NonZero<usize> = const { NonZero::new(4_096).unwrap() };

/// The refresh cadence of a step-count-overridden projector run.
const REFRESH: NonZero<usize> = const { NonZero::new(250).unwrap() };

/// The relation classifier's supply: the one input every run names.
///
/// A run fits the classifier from an annotation corpus or adopts an already-fitted artifact; the
/// variant carries the document's path.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClassifierSource {
    /// Fit the classifier in-run from the annotation-corpus document at the path.
    ///
    /// The run assembles the corpus, fits the relation classifier, and stages the corpus, the
    /// embedding table, and the model beside the generation.
    Annotations(Utf8PathBuf),
    /// Adopt the fitted classifier artifact (`.clsf`) at the path.
    Artifact(Utf8PathBuf),
}

/// How one run places rows on the map.
///
/// Each variant carries exactly the controls its placer consumes.
#[derive(Debug, Copy, Clone, PartialEq)]
pub enum Placement {
    /// Place at the landmark baseline: the fallback placer, without a training stage.
    Baseline,
    /// Train the full placement.
    Projector {
        /// Override the trained placement's step count.
        ///
        /// Keeps the ratified options and the midpoint boundary. Absent, the configuration
        /// default trains.
        steps: Option<NonZero<usize>>,
        /// Assert the Proximal radius instead of measuring it.
        ///
        /// The trainer freezes this value where a calibration pass would have measured one.
        /// Finite, above the Coincident radius.
        asserted_radius: Option<f32>,
        /// Withhold the relation evidence from the trained placement.
        ///
        /// Every other objective term trains and no reviewed verdicts are demanded. For corpora
        /// without reviewed-Proximal coverage that still want the full trained placement.
        vacuous: bool,
        /// Observe the relation-gradient budget instead of enforcing it.
        ///
        /// The clamp is off and relation gradients apply whole, while the run's budget
        /// diagnostics still record what enforcement would have clipped. The observed floor is
        /// the enforced configuration's own, so the recorded ratios compare across modes.
        observed_budget: bool,
    },
}

/// Options of one production run.
#[derive(Debug, Clone)]
pub struct Options<P> {
    /// The fit seed; equal seeds replay every draw of the run, the admission probe's included.
    pub seed: u64 = 0,
    /// The landmark capacity `M`.
    pub landmarks: NonZero<u32> = DEFAULT_LANDMARKS,
    /// Run without a prior even when the root holds an active generation.
    pub fresh: bool = false,
    /// Sampled anchor rows of the admission probe.
    pub anchors: NonZero<usize> = DEFAULT_ANCHORS,
    /// Sampled comparison rows of the admission probe.
    pub comparisons: NonZero<usize> = DEFAULT_COMPARISONS,
    /// Path of a reviewed-verdicts document to supply to the run.
    ///
    /// The trained placement's phase boundary freezes its Proximal radius from the reviewed pairs,
    /// so a corpus whose relations carry Proximal force needs one (or an asserted radius) to
    /// train.
    pub verdicts: Option<Utf8PathBuf> = None,
    /// Path of a quality-thresholds document overriding the source defaults.
    ///
    /// Six optional fields (`minimum_recall`, `minimum_trustworthiness`, `minimum_continuity`,
    /// `maximum_intrusion_rate`, `maximum_density_spread`, `minimum_triplet_agreement`); a present
    /// field overrides its default after domain validation, an absent field keeps it, an unknown
    /// field refuses the document. The source defaults are maximally permissive, gating evidence
    /// presence rather than fidelity.
    pub quality_thresholds: Option<Utf8PathBuf> = None,
    /// The relation classifier's supply.
    pub classifier: ClassifierSource,
    /// How the run places rows on the map.
    pub placement: Placement = Placement::Projector {
        steps: None,
        asserted_radius: None,
        vacuous: false,
        observed_budget: false,
    },
    /// Construct the k-NN lists by NN-Descent instead of the HNSW backend.
    ///
    /// Either construction answers to the same recall admission.
    pub nn_descent: bool = false,
    /// The observer the run reports its progress to.
    pub progress: P,
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

/// The refusal grounds of a supplied quality-thresholds document.
#[derive(Debug)]
pub enum ThresholdSupplyError {
    /// The document could not be read.
    Io(io::Error),
    /// The document does not parse as the override shape.
    Parse(serde_json::Error),
    /// An override lies outside its control's domain.
    Domain(ThresholdDomainError),
}

impl core::fmt::Display for ThresholdSupplyError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Io(_) => fmt.write_str("the document could not be read"),
            Self::Parse(_) => fmt.write_str("the document does not parse as the override shape"),
            Self::Domain(error) => core::fmt::Display::fmt(error, fmt),
        }
    }
}

impl core::error::Error for ThresholdSupplyError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Parse(error) => Some(error),
            Self::Domain(error) => Some(error),
        }
    }
}

/// One production run's failure, by step.
///
/// Every variant names the step that failed and holds that step's concrete fault - nothing erases
/// to `dyn`.
#[derive(Debug)]
pub enum RunError {
    /// The store could not open a snapshot transaction.
    Snapshot(PostgresDatasetError),
    /// The supplied verdicts document was refused.
    Verdicts(VerdictSupplyError),
    /// The supplied quality-thresholds document was refused.
    Thresholds(ThresholdSupplyError),
    /// The supplied annotation-corpus document was refused.
    Annotations(AnnotationSupplyError),
    /// The supplied classifier artifact was refused.
    Classifier(ClassifierSupplyError),
    /// The asserted Proximal radius was refused.
    ///
    /// The radius must be finite and strictly above the Coincident radius.
    ProximalRadius(f32),
    /// The run could not reach a verdict.
    Run(RunnerError<PostgresDatasetError, ExternalEmbeddingError>),
}

impl core::fmt::Display for RunError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Snapshot(_) => fmt.write_str("the store could not open a snapshot transaction"),
            Self::Verdicts(_) => fmt.write_str("the supplied verdicts document was refused"),
            Self::Thresholds(_) => {
                fmt.write_str("the supplied quality-thresholds document was refused")
            }
            Self::Annotations(_) => {
                fmt.write_str("the supplied annotation-corpus document was refused")
            }
            Self::Classifier(_) => fmt.write_str("the supplied classifier artifact was refused"),
            Self::ProximalRadius(radius) => write!(
                fmt,
                "the asserted Proximal radius {radius} lies outside its domain: finite and \
                 strictly above the Coincident radius",
            ),
            Self::Run(_) => fmt.write_str("the run could not reach a verdict"),
        }
    }
}

impl core::error::Error for RunError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Snapshot(error) => Some(error),
            Self::Verdicts(error) => Some(error),
            Self::Thresholds(error) => Some(error),
            Self::Annotations(error) => Some(error),
            Self::Classifier(error) => Some(error),
            Self::Run(error) => Some(error),
            Self::ProximalRadius(_) => None,
        }
    }
}

/// Builds the ratified schedule shrunk to a requested step count.
///
/// The midpoint boundary splits the opening segment and the ladder evenly, mirroring the ratified
/// schedule's shape; the learning-rate envelope stays the ratified one.
const fn shortened_schedule(steps: NonZero<usize>) -> TrainingSchedule {
    TrainingSchedule::new(
        steps,
        steps.get().div_euclid(2),
        REFRESH,
        const { UnitFraction::new(1.0e-3).expect("the ratified initial rate is a unit fraction") },
        const { UnitFraction::new(1.0e-5).expect("the ratified minimum rate is a unit fraction") },
    )
    .expect("the ratified schedule domain admits any step count")
}

/// Opens the run's classifier input from its source.
///
/// # Errors
///
/// Returns [`RunError::Annotations`] or [`RunError::Classifier`] when the named document is
/// refused.
fn classifier_input(source: &ClassifierSource) -> Result<ClassifierInput, RunError> {
    match source {
        ClassifierSource::Annotations(path) => Ok(ClassifierInput::Annotations(
            SuppliedAnnotations::open(path).map_err(RunError::Annotations)?,
        )),
        ClassifierSource::Artifact(path) => {
            ClassifierInput::open_artifact(path).map_err(RunError::Classifier)
        }
    }
}

/// Applies a supplied quality-thresholds document over the source defaults.
///
/// # Errors
///
/// Returns a [`ThresholdSupplyError`] when the document cannot be read, does not parse as the
/// override shape, or carries an out-of-domain value.
fn quality_thresholds(
    defaults: QualityThresholds,
    path: Option<&Utf8Path>,
) -> Result<QualityThresholds, ThresholdSupplyError> {
    let Some(path) = path else {
        return Ok(defaults);
    };
    let text = std::fs::read_to_string(path).map_err(ThresholdSupplyError::Io)?;
    let overrides: ThresholdOverrides =
        serde_json::from_str(&text).map_err(ThresholdSupplyError::Parse)?;
    defaults
        .with_overrides(&overrides)
        .map_err(ThresholdSupplyError::Domain)
}

/// Resolves the run's placement options over the configuration default.
///
/// A step-count override rebuilds the ratified options around the shortened schedule; otherwise
/// the projector controls apply to the configuration default's options.
///
/// # Errors
///
/// Returns [`RunError::ProximalRadius`] when the asserted radius lies outside the lens domain.
fn placement_options(
    placement: Placement,
    initial: PlacementOptions,
) -> Result<PlacementOptions, RunError> {
    let Placement::Projector {
        steps,
        asserted_radius,
        vacuous,
        observed_budget,
    } = placement
    else {
        return Ok(PlacementOptions::LandmarkBaseline);
    };

    let mut projector = match (steps, initial) {
        (Some(steps), _) => {
            let mut projector = ProjectorOptions::ratified();
            projector.schedule = shortened_schedule(steps);
            projector
        }
        (None, PlacementOptions::Projector(projector)) => projector,
        (None, PlacementOptions::LandmarkBaseline) => ProjectorOptions::ratified(),
    };

    if let Some(radius) = asserted_radius {
        projector.lens = RelationLens::new(
            projector.lens.coincident(),
            projector.lens.temperature(),
            projector.lens.epsilon(),
            Some(radius),
        )
        .ok_or(RunError::ProximalRadius(radius))?;
    }
    projector.vacuous = vacuous;

    if observed_budget {
        projector.budget = match projector.budget {
            Budget::Enforced(clamp) => Budget::Observed {
                floor: Positive::new(clamp.floor())
                    .expect("an enforced floor is finite and strictly positive"),
            },
            observed @ Budget::Observed { .. } => observed,
        };
    }

    Ok(PlacementOptions::Projector(projector))
}

/// Runs one production generation over the store's snapshot at `axes`.
///
/// The published generation lands in the generation root at `root`; the caller names the snapshot
/// explicitly, so equal inputs describe the same run. Cards embed through `embedder`, the
/// provider the shell constructed with its credentials.
///
/// # Errors
///
/// Returns a [`RunError`] naming the step that failed: opening the snapshot transaction, admitting
/// the supplied verdicts, quality-thresholds, annotation-corpus, or classifier documents,
/// validating the asserted Proximal radius, or the run itself.
pub(crate) async fn live<P: Progress + Sync>(
    client: &mut Client,
    root: GenerationRoot,
    axes: TemporalAxes,
    options: Options<P>,
    embedder: &ExternalEmbeddingProvider<OpenAiEmbeddingClient, P::Detached>,
) -> Result<Summary, RunError> {
    let dataset = PostgresDataset::new(client, axes)
        .await
        .map_err(RunError::Snapshot)?;

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
            PriorMode::FromActive
        },
        ..
    };

    runner_options.quality.probe.anchors = options.anchors;
    runner_options.quality.probe.comparisons = options.comparisons;
    runner_options.quality.thresholds = quality_thresholds(
        runner_options.quality.thresholds,
        options.quality_thresholds.as_deref(),
    )
    .map_err(RunError::Thresholds)?;

    if options.nn_descent {
        runner_options.fit.construction =
            KnnConstructionChoice::Descent(NnDescentOptions::default());
    }

    runner_options.fit.placement =
        placement_options(options.placement, runner_options.fit.placement)?;

    let verdicts = options
        .verdicts
        .as_deref()
        .map(SuppliedVerdicts::open)
        .transpose()
        .map_err(RunError::Verdicts)?;

    let classifier = classifier_input(&options.classifier)?;

    let outcome = run(
        &dataset,
        embedder,
        &classifier,
        verdicts.as_ref(),
        &root,
        &runner_options,
        &options.progress,
    )
    .await
    .map_err(RunError::Run)?;

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
