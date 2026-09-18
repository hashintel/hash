//! Operator configuration for live and offline generation runs.
//!
//! Use [`live()`] for a pinned store snapshot or [`offline()`] for a dump directory when the store
//! is unavailable. Both resolve [`Options`] and supplied documents before fitting and admission,
//! and return statistics plus the admission report in [`Summary`]. [`RunError`] identifies a failed
//! step and retains its concrete error as a source.
//!
//! [`ClassifierSource`] selects a supplied model or an annotation corpus. [`Placement`] keeps
//! projector controls on the trained-placement variant. Corpus-dependent constraints, including
//! whether the probe's sample fits, remain runtime checks.
//!
//! A live run embeds through its supplied external provider, while an offline run looks up
//! embeddings in the dump's stream under its recorded fingerprint. In either case the fingerprint
//! declares the embedding contract and guards prior-generation reuse. It does not verify which
//! provider produced the vectors.

use core::num::NonZero;
use std::io;

use camino::{Utf8Path, Utf8PathBuf};

pub(crate) use self::{live::live, offline::offline};
use super::{Admission, Outcome, PriorMode, RunnerError, RunnerOptions};
use crate::{
    dataset::{
        offline::{OfflineDatasetError, OpenDumpError, embedder::MissingCardText},
        postgres::PostgresDatasetError,
    },
    device::PinnedDevice,
    file::generation::GenerationId,
    math::{AffinityCurve, positive},
    salt::{
        embedding::external::ExternalEmbeddingError,
        fit::{
            ClassifierInput, ClassifierSupplyError, FitConfig, KnnConstructionChoice,
            PlacementOptions, ProjectorOptions, SuppliedAnnotations, SuppliedVerdicts,
            VacuousProjectorPlacement, annotations::SupplyError as AnnotationSupplyError,
            verdicts::SupplyError as VerdictSupplyError,
        },
        knn::{descent::NnDescentOptions, recall::RecallSpotCheck},
        landmark::select::SelectionOptions,
        projector::train::TrainingSchedule,
        quality::report::{
            QualityReport, QualityThresholds, ThresholdDomainError, ThresholdOverrides,
        },
    },
};

mod live;
mod offline;

/// The default landmark capacity of a production run.
const DEFAULT_LANDMARKS: NonZero<u32> = const { NonZero::new(4_096).unwrap() };

/// The default anchor sample of the admission probe.
const DEFAULT_ANCHORS: NonZero<usize> = const { NonZero::new(1_024).unwrap() };

/// The default comparison sample of the admission probe.
const DEFAULT_COMPARISONS: NonZero<usize> = const { NonZero::new(4_096).unwrap() };

/// A supplied classifier model or annotation corpus for a generation run.
///
/// Select an annotation corpus to fit a classifier in-run, or an artifact to reuse a fitted model.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClassifierSource {
    /// Fit the classifier in-run from the annotation-corpus document at the path.
    ///
    /// The run assembles the corpus and fits the relation classifier, then stages the corpus, the
    /// embedding table, and the model beside the generation.
    Annotations(Utf8PathBuf),
    /// Adopt the fitted classifier artifact (`.clsf`) at the path.
    Artifact(Utf8PathBuf),
}

/// Map placement by landmark assignment or a trained projector.
///
/// The default [`Options::placement`] selects the projector with its reference schedule and
/// relation attraction enabled.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Placement {
    /// Place at the landmark baseline: the fallback placer, without a training stage.
    Baseline,
    /// Train the full placement.
    Projector {
        /// Override the trained placement's step count.
        ///
        /// A supplied count uses the reference projector settings with the phase boundary at
        /// `floor(steps / 2)`. This is [`None`] by default, retaining the reference 20,000-step
        /// schedule with its boundary at step 5,000.
        steps: Option<NonZero<usize>>,
        vacuous: Option<VacuousProjectorPlacement>,
    },
}

/// Options of one production run.
#[derive(Debug, Clone)]
pub struct Options<P> {
    /// Fit seed, also used to derive the admission probe's generator.
    ///
    /// This is `0` by default. Repeating a draw sequence also requires equal sampling inputs and algorithms.
    pub seed: u64 = 0,
    /// Maximum landmark count `M`, `4,096` by default.
    pub landmarks: NonZero<u32> = DEFAULT_LANDMARKS,
    /// Run without a prior even when the root holds an active generation.
    ///
    /// This is `false` by default.
    pub fresh: bool = false,
    /// Upper bound on sampled anchor rows of the admission probe, `1,024` by default.
    pub anchors: NonZero<usize> = DEFAULT_ANCHORS,
    /// Upper bound on sampled comparison rows of the admission probe, `4,096` by default.
    pub comparisons: NonZero<usize> = DEFAULT_COMPARISONS,
    /// Path of a reviewed-verdicts document to supply to the run.
    ///
    /// This is [`None`] by default. At the trained placement's phase boundary, a non-vacuous Proximal attraction requires reviewed pairs to establish its radius.
    pub verdicts: Option<Utf8PathBuf> = None,
    /// Path of a quality-thresholds document overriding the source defaults.
    ///
    /// This is [`None`] by default. The optional fields are `minimum_recall`, `minimum_trustworthiness`, `minimum_continuity`, `maximum_intrusion_rate`, `maximum_density_spread`, and `minimum_triplet_agreement`. A present field overrides its default after domain validation, an absent field keeps it, and an unknown field refuses the document. The source defaults are maximally permissive: admission requires evidence without imposing a measured fidelity threshold.
    pub quality_thresholds: Option<Utf8PathBuf> = None,
    /// The relation classifier's supply.
    pub classifier: ClassifierSource,
    /// Placement strategy, [`Placement::Projector`] with no overrides by default.
    pub placement: Placement = Placement::Projector {
        steps: None,
        vacuous: None,
    },
    /// Construct the k-NN lists by NN-Descent instead of the HNSW backend.
    ///
    /// This is `false` by default. Either construction answers to the same k-NN recall spot check.
    pub nn_descent: bool = false,
    /// The observer the run reports its progress to.
    pub progress: P,
}

/// Generation identity, fit statistics and admission evidence from one run.
#[derive(Debug, Clone)]
pub(crate) struct Summary {
    /// The published generation's identity, in directory-name form.
    pub generation: GenerationId,
    /// Nodes the dataset streamed.
    pub nodes: u64,
    /// Edges the dataset streamed.
    pub edges: u64,
    /// The neighbour backend's recall evidence, admission reading included.
    ///
    /// This is the fit's k-NN spot check, distinct from the map-quality report's recall control.
    /// An unresolved admission interval still records a measured point estimate.
    pub recall: RecallSpotCheck,
    /// Unique card texts copied from the prior generation.
    pub reused: usize,
    /// Unique card texts supplied to the embedder rather than copied from the prior.
    pub embedded: usize,
    /// Whether the run activated the generation.
    pub activated: bool,
    /// The full structured admission report.
    pub report: QualityReport,
}

/// Failure to read or validate a quality-thresholds override document.
#[derive(Debug)]
pub enum ThresholdSupplyError {
    /// The run could not read the document.
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

#[derive(Debug)]
enum RunErrorKind {
    /// The store could not open a snapshot transaction.
    Snapshot(PostgresDatasetError),
    /// The dump directory was refused.
    Dump(OpenDumpError),
    /// The dump's embedding stream could not serve as the embedding provider.
    DumpEmbedder(OfflineDatasetError),
    /// The run refused the supplied verdicts document.
    Verdicts(VerdictSupplyError),
    /// The run refused the supplied quality-thresholds document.
    Thresholds(ThresholdSupplyError),
    /// The run refused the supplied annotation-corpus document.
    Annotations(AnnotationSupplyError),
    /// The run refused the supplied classifier artifact.
    Classifier(ClassifierSupplyError),
    /// The live generation run did not complete successfully.
    Run(RunnerError<PostgresDatasetError, ExternalEmbeddingError>),
    /// The offline generation run did not complete successfully.
    OfflineRun(RunnerError<OfflineDatasetError, MissingCardText>),
}

/// A step-specific failure from a live or offline generation run.
///
/// Every variant retains the step's concrete error. Use [`core::error::Error::source`] to inspect
/// the underlying failure, including runner errors whose concrete type is crate-private.
#[derive(Debug)]
pub struct RunError {
    kind: Box<RunErrorKind>,
}

impl core::fmt::Display for RunError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match &*self.kind {
            RunErrorKind::Snapshot(_) => {
                fmt.write_str("the store could not open a snapshot transaction")
            }
            RunErrorKind::Dump(_) => fmt.write_str("the dump directory was refused"),
            RunErrorKind::DumpEmbedder(_) => {
                fmt.write_str("the dump's embedding stream was refused as the embedding provider")
            }
            RunErrorKind::Verdicts(_) => {
                fmt.write_str("the supplied verdicts document was refused")
            }
            RunErrorKind::Thresholds(_) => {
                fmt.write_str("the supplied quality-thresholds document was refused")
            }
            RunErrorKind::Annotations(_) => {
                fmt.write_str("the supplied annotation-corpus document was refused")
            }
            RunErrorKind::Classifier(_) => {
                fmt.write_str("the supplied classifier artifact was refused")
            }
            RunErrorKind::Run(_) | RunErrorKind::OfflineRun(_) => {
                fmt.write_str("the run could not reach a verdict")
            }
        }
    }
}

impl core::error::Error for RunError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match &*self.kind {
            RunErrorKind::Snapshot(error) => Some(error),
            RunErrorKind::Dump(error) => Some(error),
            RunErrorKind::DumpEmbedder(error) => Some(error),
            RunErrorKind::Verdicts(error) => Some(error),
            RunErrorKind::Thresholds(error) => Some(error),
            RunErrorKind::Annotations(error) => Some(error),
            RunErrorKind::Classifier(error) => Some(error),
            RunErrorKind::Run(error) => Some(error),
            RunErrorKind::OfflineRun(error) => Some(error),
        }
    }
}

impl From<PostgresDatasetError> for RunError {
    fn from(error: PostgresDatasetError) -> Self {
        Self {
            kind: Box::new(RunErrorKind::Snapshot(error)),
        }
    }
}

impl From<OpenDumpError> for RunError {
    fn from(error: OpenDumpError) -> Self {
        Self {
            kind: Box::new(RunErrorKind::Dump(error)),
        }
    }
}

impl From<OfflineDatasetError> for RunError {
    fn from(error: OfflineDatasetError) -> Self {
        Self {
            kind: Box::new(RunErrorKind::DumpEmbedder(error)),
        }
    }
}

impl From<VerdictSupplyError> for RunError {
    fn from(error: VerdictSupplyError) -> Self {
        Self {
            kind: Box::new(RunErrorKind::Verdicts(error)),
        }
    }
}

impl From<ThresholdSupplyError> for RunError {
    fn from(error: ThresholdSupplyError) -> Self {
        Self {
            kind: Box::new(RunErrorKind::Thresholds(error)),
        }
    }
}

impl From<AnnotationSupplyError> for RunError {
    fn from(error: AnnotationSupplyError) -> Self {
        Self {
            kind: Box::new(RunErrorKind::Annotations(error)),
        }
    }
}

impl From<ClassifierSupplyError> for RunError {
    fn from(error: ClassifierSupplyError) -> Self {
        Self {
            kind: Box::new(RunErrorKind::Classifier(error)),
        }
    }
}

impl From<RunnerError<PostgresDatasetError, ExternalEmbeddingError>> for RunError {
    fn from(error: RunnerError<PostgresDatasetError, ExternalEmbeddingError>) -> Self {
        Self {
            kind: Box::new(RunErrorKind::Run(error)),
        }
    }
}

impl From<RunnerError<OfflineDatasetError, MissingCardText>> for RunError {
    fn from(error: RunnerError<OfflineDatasetError, MissingCardText>) -> Self {
        Self {
            kind: Box::new(RunErrorKind::OfflineRun(error)),
        }
    }
}

/// Opens the run's classifier input from its source.
///
/// # Errors
///
/// Returns [`RunError`] when the selected annotation corpus or classifier artifact cannot be
/// admitted.
fn classifier_input(source: &ClassifierSource) -> Result<ClassifierInput, RunError> {
    match source {
        ClassifierSource::Annotations(path) => Ok(ClassifierInput::Annotations(
            SuppliedAnnotations::open(path)?,
        )),
        ClassifierSource::Artifact(path) => {
            ClassifierInput::open_artifact(path).map_err(From::from)
        }
    }
}

/// Applies a supplied quality-thresholds document over the source defaults.
///
/// # Errors
///
/// Returns [`ThresholdSupplyError`] when a supplied override document cannot be read or validated.
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
/// A step-count override starts from [`ProjectorOptions::live`] and replaces its schedule with
/// [`TrainingSchedule::shortened`]. Without that override, an initial projector configuration keeps
/// its settings. An initial baseline uses the reference projector settings. Both projector paths
/// apply the requested `vacuous` flag.
fn placement_options(placement: Placement, initial: PlacementOptions) -> PlacementOptions {
    let Placement::Projector { steps, vacuous } = placement else {
        return PlacementOptions::LandmarkBaseline;
    };

    let mut projector = match (steps, initial) {
        (Some(steps), _) => {
            let mut projector = ProjectorOptions::live();
            projector.schedule = TrainingSchedule::shortened(steps);
            projector
        }
        (None, PlacementOptions::Projector(projector)) => projector,
        (None, PlacementOptions::LandmarkBaseline) => ProjectorOptions::live(),
    };

    projector.vacuous = vacuous;

    PlacementOptions::Projector(projector)
}

/// Runner settings and admitted documents independent of dataset contents.
///
/// Resolution uses operator options, the pinned device and supplied documents without reading
/// dataset rows. The live and offline paths share this resolution.
struct ResolvedRun {
    /// Fit, probe, prior and device settings.
    runner: RunnerOptions,
    /// The admitted reviewed-verdicts document, when one was supplied.
    verdicts: Option<SuppliedVerdicts>,
    /// The run's classifier input, opened from its source.
    classifier: ClassifierInput,
}

/// Resolves the operator options into runner options and admitted supply documents.
///
/// # Errors
///
/// Returns [`RunError`] when a supplied document cannot be admitted. Quality thresholds resolve
/// first, then verdicts, then the selected annotation corpus or classifier artifact.
fn resolve<P>(options: &Options<P>, device: PinnedDevice) -> Result<ResolvedRun, RunError> {
    let mut runner_options = RunnerOptions {
        fit: FitConfig {
            seed: options.seed,
            selection: SelectionOptions {
                maximum_count: options.landmarks,
                ..
            },
            curve: AffinityCurve::fit(positive!(1.0), positive!(0.1))
                .expect("the reference falloff is well-conditioned"),
            ..
        },
        prior: if options.fresh {
            PriorMode::Fresh
        } else {
            PriorMode::FromActive
        },
        device: device.resolve(),
        ..
    };

    runner_options.quality.probe.anchors = options.anchors;
    runner_options.quality.probe.comparisons = options.comparisons;
    runner_options.quality.thresholds = quality_thresholds(
        runner_options.quality.thresholds,
        options.quality_thresholds.as_deref(),
    )?;

    if options.nn_descent {
        runner_options.fit.construction =
            KnnConstructionChoice::Descent(NnDescentOptions::default());
    }

    runner_options.fit.placement =
        placement_options(options.placement, runner_options.fit.placement);

    let verdicts = options
        .verdicts
        .as_deref()
        .map(SuppliedVerdicts::open)
        .transpose()?;

    let classifier = classifier_input(&options.classifier)?;

    Ok(ResolvedRun {
        runner: runner_options,
        verdicts,
        classifier,
    })
}

impl From<Outcome> for Summary {
    fn from(outcome: Outcome) -> Self {
        let metadata = &outcome.generation.repository().metadata;

        Self {
            generation: outcome.generation.id(),
            nodes: metadata.snapshot.nodes,
            edges: metadata.snapshot.edges,
            recall: metadata.evidence.recall,
            reused: metadata.evidence.cards.reused,
            embedded: metadata.evidence.cards.embedded,
            activated: outcome.admission == Admission::Active,
            report: outcome.report,
        }
    }
}
