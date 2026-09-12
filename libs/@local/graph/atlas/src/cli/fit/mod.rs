//! The fit command that runs one production generation over the live store or a dump directory.

use core::{fmt, num::NonZero, time::Duration};
use std::time::Instant;

use camino::{Utf8Path, Utf8PathBuf};
use clap::ValueHint;
use tokio_postgres::Client;

use self::error::FitError;
use super::embedder::{self, EmbedderArgs};
use crate::{
    dataset::TemporalAxes,
    device::PinnedDevice,
    file::{
        generation::{
            GenerationRoot,
            upload::{Promotion, PromotionOptions, Upload},
        },
        storage::{Storage, error::StorageError, path::FilePath},
    },
    progress::{NoProgress, Progress},
    salt::{
        knn::recall::RecallAdmission,
        runner::operator::{ClassifierSource, Options, Placement, Summary, live, offline},
    },
};

pub(crate) mod error;

/// Root and run settings of one fit.
#[derive(Debug, clap::Args)]
#[command(group = clap::ArgGroup::new("classifier_input")
    .required(true)
    .args(["annotations", "classifier"]))]
#[expect(
    clippy::struct_excessive_bools,
    reason = "the flags are independent operator switches"
)]
pub struct FitArgs {
    /// The run seed.
    ///
    /// Equal seeds replay every draw, including the admission probe.
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
    /// The trained placement's phase boundary freezes its Proximal radius from the reviewed pairs.
    /// A corpus whose relations carry Proximal force needs these verdicts to train.
    #[arg(long, env = "HASH_GRAPH_ATLAS_VERDICTS", value_hint = ValueHint::FilePath)]
    verdicts: Option<FilePath>,

    /// Path of a quality-thresholds document overriding the source defaults.
    ///
    /// A JSON object with any of `minimum_recall`, `minimum_trustworthiness`,
    /// `minimum_continuity`, `maximum_intrusion_rate`, `minimum_triplet_agreement` (each in `[0,
    /// 1]`) and `maximum_density_spread` (finite, non-negative, at most the `f32` maximum). A
    /// present field overrides its default, an unknown field refuses the document, and an
    /// out-of-domain value refuses the run before it starts. The source defaults are maximally
    /// permissive. Admission still checks evidence presence.
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
    /// Preserves the other placement options and the midpoint boundary.
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

    /// Destination of the admission report JSON.
    #[arg(long, default_value = "admission-report.json", value_hint = ValueHint::FilePath)]
    report: Utf8PathBuf,

    /// Destination prefix for generated artifacts. No upload runs by default.
    #[arg(long, env = "HASH_GRAPH_ATLAS_UPLOAD")]
    upload: Option<FilePath>,

    /// Remove the old previous active generation after remote promotion, enabled by default.
    ///
    /// Set `--prune-active-generations=false` to retain it. Repository history is always retained.
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    prune_active_generations: bool,
}

/// A fit's result, admission-report path and fitting duration.
#[derive(Debug)]
pub struct FitVerdict {
    /// The run's plain-number summary.
    summary: Summary,
    /// The admission-report destination.
    report: Utf8PathBuf,
    /// How long the run took.
    elapsed: Duration,
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

/// A prepared fit with local inputs, a generation root and an optional upload destination.
///
/// [`Self::with_progress`] replaces the initial silent observer with `P`.
#[derive(Debug)]
pub struct FitCommand<P> {
    root: GenerationRoot,
    device: PinnedDevice,
    report: Utf8PathBuf,
    options: Options<P>,
    upload: Option<(FilePath, Storage)>,
    promotion: PromotionOptions,
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
            promotion: self.promotion,
        }
    }
}

impl<P> FitCommand<P>
where
    P: Progress + Sync,
{
    /// Fits one generation over the live store and returns its verdict.
    ///
    /// The store snapshot uses the temporal axes captured when fitting begins. The command writes
    /// the admission report before uploading results. An activated generation also updates remote
    /// current.
    ///
    /// # Errors
    ///
    /// Returns [`FitError`] on preparation, fitting or result-publication failure.
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

        // the provider retains its observer across requests.
        let embedder =
            embedder::openai(credential.into_key(), self.options.progress.detach()).await?;

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
        serde_json::to_writer_pretty(&mut buffer, &summary.report)?;
        tokio::fs::write(&self.report, buffer).await?;

        if let Some(upload) = upload {
            upload.upload(summary.generation).await?;

            if summary.activated {
                let Promotion { id } = upload.promote(summary.generation, self.promotion).await?;
                tracing::info!(%id, "promoted generation");
            }
        }

        Ok(FitVerdict {
            summary,
            report: self.report,
            elapsed,
        })
    }

    /// Fits one generation from the snapshot and embeddings in `dump`.
    ///
    /// The dump supplies the temporal axes. Report writing and remote publication follow
    /// [`Self::run`].
    ///
    /// # Errors
    ///
    /// Returns [`FitError`] if preparing the upload, fitting the dump or publishing results fails.
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
        serde_json::to_writer_pretty(&mut buffer, &summary.report)?;
        tokio::fs::write(&self.report, buffer).await?;

        if let Some(upload) = upload {
            upload.upload(summary.generation).await?;

            if summary.activated {
                let Promotion { id } = upload.promote(summary.generation, self.promotion).await?;
                tracing::info!(%id, "promoted generation");
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
    /// Resolves local or S3 fit inputs before starting a fit.
    ///
    /// # Errors
    ///
    /// Returns [`StorageError`] if resolving or downloading an input fails.
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
            promotion: PromotionOptions {
                prune_active_generations: args.prune_active_generations,
            },
        })
    }
}
