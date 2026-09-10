//! The fit command that runs one production generation over the live store or a dump directory.

use core::{error::Error, fmt, num::NonZero, time::Duration};
use std::{io, time::Instant};

use camino::{Utf8Path, Utf8PathBuf};
use clap::{Args, ValueHint};
use tokio_postgres::Client;

use super::embedder::{self, EmbedderArgs, EmbedderError};
use crate::{
    dataset::TemporalAxes,
    device::PinnedDevice,
    file::{
        generation::{
            GenerationRoot,
            upload::{Promotion, Upload, UploadError},
        },
        storage::{Storage, error::StorageError, path::FilePath},
    },
    progress::{NoProgress, Progress},
    salt::{
        knn::recall::RecallAdmission,
        runner::operator::{
            ClassifierSource, Options, Placement, RunError, Summary, live, offline,
        },
    },
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
    verdicts: Option<FilePath>,

    /// Path of a quality-thresholds document overriding the source defaults.
    ///
    /// A JSON object with any of `minimum_recall`, `minimum_trustworthiness`,
    /// `minimum_continuity`, `maximum_intrusion_rate`, `minimum_triplet_agreement` (each in `[0,
    /// 1]`) and `maximum_density_spread` (finite, non-negative, at most the `f32` maximum). A
    /// present field overrides its default, an unknown field refuses the document, and an
    /// out-of-domain value refuses the run before it starts. The source defaults are maximally
    /// permissive, gating evidence presence rather than fidelity.
    #[arg(
        long,
        env = "HASH_GRAPH_ATLAS_QUALITY_THRESHOLDS",
        value_hint = ValueHint::FilePath,
    )]
    quality_thresholds: Option<FilePath>,

    /// Path of an annotation-corpus document, the classifier's training supply.
    ///
    /// The run assembles the corpus and fits the relation classifier. It then stages the corpus,
    /// the embedding table, and the model beside the generation.
    #[arg(long, env = "HASH_GRAPH_ATLAS_ANNOTATIONS", value_hint = ValueHint::FilePath)]
    annotations: Option<FilePath>,

    /// Path of a fitted classifier artifact (.clsf) to supply in place of fitting one.
    #[arg(long, env = "HASH_GRAPH_ATLAS_CLASSIFIER", value_hint = ValueHint::FilePath)]
    classifier: Option<FilePath>,

    /// Override the trained placement's step count.
    ///
    /// Keeps the ratified options and the midpoint boundary.
    #[arg(long)]
    projector_steps: Option<NonZero<usize>>,

    /// Place at the landmark baseline instead of training the projector: the fallback placer.
    #[arg(long)]
    baseline: bool,

    /// Train the full placement with the relation evidence withheld.
    ///
    /// No reviewed verdicts or radius needed, every other objective term trains. The unblocking
    /// flag for corpora without reviewed-Proximal coverage.
    #[arg(long, conflicts_with = "baseline")]
    vacuous_placement: bool,

    /// Construct the k-NN lists by NN-Descent instead of the HNSW backend.
    ///
    /// Either construction answers to the same recall admission.
    #[arg(long)]
    nn_descent: bool,

    /// Where the admission report JSON lands.
    #[arg(long, default_value = "admission-report.json", value_hint = ValueHint::FilePath)]
    report: Utf8PathBuf,

    /// Whether to upload the generated results to remote storage.
    #[arg(long, env = "HASH_GRAPH_ATLAS_UPLOAD")]
    upload: Option<FilePath>,
}

#[derive(Debug)]
pub struct FitUploadError(UploadError);

impl fmt::Display for FitUploadError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

impl core::error::Error for FitUploadError {
    fn source(&self) -> Option<&(dyn core::error::Error + 'static)> {
        core::error::Error::source(&self.0)
    }
}

/// One fit invocation's failure, by step.
///
/// The embedder and run variants splice into the chain transparently (their display text and
/// sources are the wrapped fault's, unchanged). The report variant names its own step.
#[derive(Debug)]
pub enum FitError {
    /// Producing the embedding provider failed.
    Embedder(EmbedderError),
    /// The run failed.
    Run(RunError),
    /// Writing the admission report failed.
    Io(io::Error),
    /// Uploading the results failed.
    Upload(FitUploadError),
    /// Serializing the admission report failed.
    Serialize(serde_json::Error),
}

impl From<UploadError> for FitError {
    fn from(error: UploadError) -> Self {
        Self::Upload(FitUploadError(error))
    }
}

impl fmt::Display for FitError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Embedder(error) => fmt::Display::fmt(error, fmt),
            Self::Run(error) => fmt::Display::fmt(error, fmt),
            Self::Io(_) => fmt.write_str("the admission report could not be written"),
            Self::Upload(_) => fmt.write_str("uploading the results failed"),
            Self::Serialize(_) => fmt.write_str("serializing the admission report failed"),
        }
    }
}

impl Error for FitError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Embedder(error) => error.source(),
            Self::Run(error) => error.source(),
            Self::Io(error) => Some(error),
            Self::Upload(error) => Some(error),
            Self::Serialize(error) => Some(error),
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

/// One fit's verdict.
///
/// The command's product, which its host renders rather than printing in place. The standalone
/// shell's dashboard owns the terminal until the run ends, so the shell writes the verdict after
/// the dashboard hands it back.
#[derive(Debug)]
pub struct FitVerdict {
    /// The run's plain-number summary.
    summary: Summary,
    /// Where the admission report landed.
    report: Utf8PathBuf,
    /// How long the run took.
    elapsed: Duration,
}

impl FitVerdict {
    /// The run's summary.
    #[must_use]
    pub const fn summary(&self) -> &Summary {
        &self.summary
    }

    /// Where the admission report landed.
    #[must_use]
    pub fn report(&self) -> &Utf8Path {
        &self.report
    }

    /// How long the run took.
    #[must_use]
    pub const fn elapsed(&self) -> Duration {
        self.elapsed
    }
}

impl fmt::Display for FitVerdict {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(fmt)?;
        writeln!(fmt, "generation  {}", self.summary.generation)?;
        writeln!(fmt, "nodes       {}", self.summary.nodes)?;
        writeln!(fmt, "edges       {}", self.summary.edges)?;
        // The reading, not the number: an unresolved sample published a
        // recall the floor could not judge, and the operator is the one
        // who decides what to do about that.
        writeln!(
            fmt,
            "recall      {:.4} +/-{:.4} {}",
            self.summary.recall.recall(),
            self.summary.recall.resolution,
            match self.summary.recall.admission() {
                RecallAdmission::Admitted => "admitted",
                RecallAdmission::Unresolved => "unresolved",
                RecallAdmission::Refused => "refused",
            },
        )?;
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
///
/// `P` is the run's progress observer: [`new`](Self::new) resolves the flags into a silent run, and
/// [`with_progress`](Self::with_progress) hands the run to an operator surface that renders it.
#[derive(Debug)]
pub struct FitCommand<P> {
    root: GenerationRoot,
    device: PinnedDevice,
    report: Utf8PathBuf,
    options: Options<P>,
    upload: Option<(FilePath, Storage)>,
}

impl<P> FitCommand<P> {
    /// Reports this fit's progress to `progress` instead of the observer it carries.
    #[must_use]
    pub fn with_progress<P2>(self, progress: P2) -> FitCommand<P2> {
        FitCommand {
            root: self.root,
            device: self.device,
            report: self.report,
            options: Options {
                seed: self.options.seed,
                landmarks: self.options.landmarks,
                fresh: self.options.fresh,
                anchors: self.options.anchors,
                comparisons: self.options.comparisons,
                verdicts: self.options.verdicts,
                quality_thresholds: self.options.quality_thresholds,
                classifier: self.options.classifier,
                placement: self.options.placement,
                nn_descent: self.options.nn_descent,
                progress,
            },
            upload: self.upload,
        }
    }
}

impl<P> FitCommand<P>
where
    P: Progress + Sync,
{
    /// Runs one production generation over the live store and returns its verdict.
    ///
    /// The hosting binary supplies the dialed store connection ([`PostgresArgs::connect`] in the
    /// standalone shell, [`connect`] behind the graph binary's own store flags) and the embedding
    /// provider's credential. This call pins the snapshot, so the run reads the store as of the
    /// moment the command starts.
    ///
    /// # Errors
    ///
    /// Returns a [`FitError`] naming the step that failed: producing the embedding provider, the
    /// run itself, or writing the admission report.
    ///
    /// [`PostgresArgs::connect`]: super::PostgresArgs::connect
    /// [`connect`]: super::connect
    pub async fn run(
        self,
        client: &mut Client,
        credential: EmbedderArgs,
    ) -> Result<FitVerdict, FitError> {
        // The math kernels reach this entry without passing through the shell's main.
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

        // The provider holds its observer across every request, so it takes the detached half.
        let embedder = embedder::openai(credential.into_key(), self.options.progress.detach())
            .await
            .map_err(FitError::Embedder)?;

        let upload = match self.upload.as_ref() {
            Some((path, storage)) => {
                let upload = Upload::prepare(storage, &self.root, path).await?;
                Some(upload)
            }
            None => None,
        };

        let started = Instant::now();
        let summary = live(
            client,
            &self.root,
            self.device,
            TemporalAxes::now(),
            self.options,
            &embedder,
        )
        .await?;
        let elapsed = started.elapsed();

        let mut buffer = Vec::new();
        serde_json::to_writer_pretty(&mut buffer, &summary.report).map_err(FitError::Serialize)?;
        tokio::fs::write(&self.report, buffer)
            .await
            .map_err(FitError::Io)?;

        if let Some(upload) = upload {
            upload.upload(summary.generation).await?;

            if summary.activated {
                let Promotion { id, previous_error } = upload.promote(summary.generation).await?;
                tracing::info!(%id, "promoted generation");

                if let Some(previous_error) = previous_error {
                    tracing::error!(%previous_error, "unable to place advisory previous pointer file, previous file has been skipped");
                }
            }
        }

        Ok(FitVerdict {
            summary,
            report: self.report,
            elapsed,
        })
    }

    /// Runs one production generation over the dump directory at `dump` and returns its verdict.
    ///
    /// The offline counterpart of [`run`](Self::run): the dump supplies the snapshot, its
    /// temporal axes, and every embedding the run requests, so the command needs neither a store
    /// connection nor a provider credential, and the generation publishes under the same root a
    /// live fit's would.
    ///
    /// # Errors
    ///
    /// Returns a [`FitError`] naming the step that failed: the run itself, or writing the
    /// admission report. A refused dump arrives in the run's own chain, exactly as a refused
    /// supply document does.
    pub async fn run_offline(self, dump: &Utf8Path) -> Result<FitVerdict, FitError> {
        // The math kernels reach this entry without passing through the shell's main.
        crate::math::kernel::verify_cpu_baseline();

        tracing::info!(
            root = %self.root.path(),
            %dump,
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
            "starting the offline production run"
        );

        let upload = match self.upload.as_ref() {
            Some((path, storage)) => {
                let upload = Upload::prepare(storage, &self.root, path).await?;
                Some(upload)
            }
            None => None,
        };

        let started = Instant::now();
        let summary = offline(dump, &self.root, self.device, self.options).await?;
        let elapsed = started.elapsed();

        let mut buffer = Vec::new();
        serde_json::to_writer_pretty(&mut buffer, &summary.report).map_err(FitError::Serialize)?;
        tokio::fs::write(&self.report, buffer)
            .await
            .map_err(FitError::Io)?;

        if let Some(upload) = upload {
            upload.upload(summary.generation).await?;

            if summary.activated {
                upload.promote(summary.generation).await?;
            }
        }

        Ok(FitVerdict {
            summary,
            report: self.report,
            elapsed,
        })
    }
}

impl FitCommand<NoProgress> {
    /// Creates a new `FitCommand` from the given arguments and storage.
    ///
    /// # Errors
    ///
    /// Returns an error if the arguments are invalid or the storage is unavailable.
    pub async fn new(
        root: super::RootArgs,
        args: FitArgs,
        storage: Storage,
    ) -> Result<Self, StorageError> {
        let classifier = match (args.annotations, args.classifier) {
            (Some(annotations), None) => {
                let path = annotations.into_local_file(&storage).await?;
                ClassifierSource::Annotations(path)
            }
            (None, Some(artifact)) => {
                let path = artifact.into_local_file(&storage).await?;
                ClassifierSource::Artifact(path)
            }
            // Clap requires the `classifier_input` argument group with exactly one member, and
            // refuses every other shape.
            _ => unreachable!("the classifier_input argument group admits exactly one path"),
        };

        let placement = if args.baseline {
            Placement::Baseline
        } else {
            Placement::Projector {
                steps: args.projector_steps,
                vacuous: args.vacuous_placement,
            }
        };

        let verdicts = if let Some(verdicts) = args.verdicts {
            Some(verdicts.into_local_file(&storage).await?)
        } else {
            None
        };

        let quality_thresholds = if let Some(quality_thresholds) = args.quality_thresholds {
            Some(quality_thresholds.into_local_file(&storage).await?)
        } else {
            None
        };

        Ok(Self {
            root: root.root,
            device: root.device,
            report: args.report,
            options: Options {
                seed: args.seed,
                landmarks: args.landmarks,
                fresh: args.fresh,
                anchors: args.anchors,
                comparisons: args.comparisons,
                verdicts,
                quality_thresholds,
                classifier,
                placement,
                nn_descent: args.nn_descent,
                progress: NoProgress,
            },
            upload: args.upload.map(|path| (path, storage)),
        })
    }
}
