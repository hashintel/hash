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
    math::{AffinityCurve, positive},
    salt::{
        embedding::external::ExternalEmbeddingError,
        fit::{
            ClassifierInput, ClassifierSupplyError, FitConfig, KnnConstructionChoice,
            PlacementOptions, ProjectorOptions, SuppliedAnnotations, SuppliedVerdicts,
            annotations::SupplyError as AnnotationSupplyError,
            verdicts::SupplyError as VerdictSupplyError,
        },
        knn::{descent::NnDescentOptions, recall::RecallSpotCheck},
        landmark::select::SelectionOptions,
        projector::train::TrainingSchedule,
        quality::report::{QualityThresholds, ThresholdDomainError, ThresholdOverrides},
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
        /// Disable relation attraction in the trained placement.
        ///
        /// This is `false` by default. Enabling it supplies an empty attraction index while
        /// retaining semantic, protection and landmark-support inputs. It permits trained
        /// placement without reviewed Proximal pairs.
        vacuous: bool,
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
    /// Sampled anchor rows of the admission probe, `1,024` by default.
    pub anchors: NonZero<usize> = DEFAULT_ANCHORS,
    /// Sampled comparison rows of the admission probe, `4,096` by default.
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
        vacuous: false,
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
pub struct Summary {
    /// The published generation's identity, in directory-name form.
    pub generation: String,
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
    /// Whether every admission control had evidence within its bound.
    pub passes: bool,
    /// Whether the run activated the generation.
    pub activated: bool,
    /// The full admission report as pretty-printed JSON.
    pub report: String,
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

/// One production run's failure, by step.
///
/// Every variant names the step that failed and holds that step's concrete fault - nothing erases
/// to `dyn`.
///
/// The run payload's concrete type stays inside the crate. An external caller reads it
/// through [`Error::source`](core::error::Error::source) as `&dyn Error`, and only in-crate
/// consumers match on it.
#[expect(
    private_interfaces,
    reason = "the run variant's payload is reachable outside the crate as a `dyn Error` source \
              alone, and naming its concrete type stays an in-crate capability"
)]
#[derive(Debug)]
pub enum RunError {
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

impl core::fmt::Display for RunError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        match self {
            Self::Snapshot(_) => fmt.write_str("the store could not open a snapshot transaction"),
            Self::Dump(_) => fmt.write_str("the dump directory was refused"),
            Self::DumpEmbedder(_) => {
                fmt.write_str("the dump's embedding stream was refused as the embedding provider")
            }
            Self::Verdicts(_) => fmt.write_str("the supplied verdicts document was refused"),
            Self::Thresholds(_) => {
                fmt.write_str("the supplied quality-thresholds document was refused")
            }
            Self::Annotations(_) => {
                fmt.write_str("the supplied annotation-corpus document was refused")
            }
            Self::Classifier(_) => fmt.write_str("the supplied classifier artifact was refused"),
            Self::Run(_) | Self::OfflineRun(_) => {
                fmt.write_str("the run could not reach a verdict")
            }
        }
    }
}

impl core::error::Error for RunError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        match self {
            Self::Snapshot(error) => Some(error),
            Self::Dump(error) => Some(error),
            Self::DumpEmbedder(error) => Some(error),
            Self::Verdicts(error) => Some(error),
            Self::Thresholds(error) => Some(error),
            Self::Annotations(error) => Some(error),
            Self::Classifier(error) => Some(error),
            Self::Run(error) => Some(error),
            Self::OfflineRun(error) => Some(error),
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
            let mut projector = ProjectorOptions::ratified();
            projector.schedule = TrainingSchedule::shortened(steps);
            projector
        }
        (None, PlacementOptions::Projector(projector)) => projector,
        (None, PlacementOptions::LandmarkBaseline) => ProjectorOptions::ratified(),
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
    )
    .map_err(RunError::Thresholds)?;

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
        .transpose()
        .map_err(RunError::Verdicts)?;

    let classifier = classifier_input(&options.classifier)?;

    Ok(ResolvedRun {
        runner: runner_options,
        verdicts,
        classifier,
    })
}

/// Reads one finished run's outcome into the plain-number summary.
fn summary(outcome: &Outcome) -> Summary {
    let metadata = &outcome.generation.repository().metadata;
    Summary {
        generation: outcome.generation.id().to_string(),
        nodes: metadata.snapshot.nodes,
        edges: metadata.snapshot.edges,
        recall: metadata.evidence.recall,
        reused: metadata.evidence.cards.reused,
        embedded: metadata.evidence.cards.embedded,
        passes: outcome.report.passes(),
        activated: outcome.admission == Admission::Active,
        report: serde_json::to_string_pretty(&outcome.report).expect("the report serializes"),
    }
}
