//! One production run from snapshot to active generation.
//!
//! [`run`] resolves the prior from the root's active generation by default, publishes a generation
//! through [`fit`], then probes its artifacts against the same dataset snapshot. A passing quality
//! verdict activates the generation by atomically replacing the current pointer. A failing verdict
//! returns [`Admission::Candidate`] without activating it. The published artifacts remain available
//! for diagnosis, and [`Outcome`] returns the report in memory.
//!
//! Admission describes this run's decision. Another root operation can change the current pointer,
//! including while a run fits or probes. The runner's quality check supplies no restriction on
//! direct [`GenerationRoot::activate`] calls.
//!
//! The admission probe's generator derives from the fit seed under a fixed label. Equal seeds,
//! population row order and sampling settings reproduce its anchor sample with the same sampler
//! implementation. Replaying a complete fit additionally depends on the dataset, supplied
//! artifacts, prior generation, fit configuration and numerical environment.

use core::panic::UnwindSafe;

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use tracing::Instrument as _;

pub(crate) use self::error::RunnerError;
use crate::{
    dataset::Dataset,
    device::PhysicalDevice,
    file::generation::{Generation, GenerationRoot},
    integrity::{Sha256, Update as _},
    progress::{Progress, Stage},
    salt::{
        embedding::CardEmbedder,
        fit::{ClassifierInput, FitConfig, SuppliedVerdicts, Supplies, fit},
        quality::{
            report::QualityReport,
            runner::{QualityRunOptions, run as probe},
        },
    },
};

mod error;
pub(crate) mod operator;

#[cfg(test)]
mod tests;

/// Prior-generation selection for embedding reuse and landmark retention.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) enum PriorMode {
    /// The root's active generation is the prior.
    ///
    /// This is the default. Card rows reuse embeddings by text hash under a matching embedder
    /// fingerprint, and prior landmarks compete for the retained share. A root without an
    /// activation runs fresh.
    #[default]
    FromActive,
    /// Ignore the active generation for embedding reuse and landmark retention.
    ///
    /// Every unique card text requires an embedding. Use this mode to run under a changed embedding
    /// contract.
    Fresh,
}

/// Fit and admission settings for one generation run.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RunnerOptions {
    /// The fit's settings, whose seed also derives the admission probe's sampling.
    pub fit: FitConfig,
    /// Prior-generation source, [`PriorMode::FromActive`] by default.
    pub prior: PriorMode = PriorMode::FromActive,
    /// Admission sampling, grouping and thresholds, using [`QualityRunOptions::default`] by default.
    pub quality: QualityRunOptions = QualityRunOptions::default(),
    /// The explicitly selected device for the fit's tensor stages.
    pub device: PhysicalDevice,
}

/// The runner's activation decision for a published generation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Admission {
    /// The report passed and this run successfully activated the generation.
    Active,
    /// The report refused admission, and this run did not activate the generation.
    Candidate,
}

/// The published generation of one finished run and its admission evidence.
#[derive(Debug, Clone)]
pub(crate) struct Outcome {
    /// The published generation reopened from its root.
    pub generation: Generation,
    /// The admission probe's full evidence record.
    pub report: QualityReport,
    /// Whether the run activated the generation.
    pub admission: Admission,
}

/// Runs one generation end to end and activates it on admission.
///
/// The same [`Dataset`] supplies the fit's ingest streams and the admission probe's sampled
/// lookups. Its implementation must preserve one frozen snapshot across both phases.
/// [`ClassifierInput`] supplies either a fitted classifier or an annotation corpus to assemble and
/// fit. Supplied verdicts stage as a reviewed-verdicts artifact, and [`None`] runs without that
/// artifact.
///
/// A report that refuses admission returns [`Admission::Candidate`] with the generation still
/// published. The runner returns the report rather than persisting it. An admitted generation
/// activates before the successful outcome returns.
///
/// # Errors
///
/// Returns [`RunnerError`] when prior resolution, fitting, reopening, probing or activation fails.
/// Publication and activation errors can occur after their respective filesystem renames.
pub(crate) async fn run<D, E, P>(
    dataset: &D,
    embedder: &E,
    classifier: &ClassifierInput,
    verdicts: Option<&SuppliedVerdicts>,
    root: &GenerationRoot,
    options: RunnerOptions,
    progress: &P,
) -> Result<Outcome, RunnerError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
    P: Progress<Detached: UnwindSafe> + Sync,
{
    let prior = match options.prior {
        PriorMode::FromActive => root
            .current()?
            .map(|id| root.open(id))
            .transpose()
            .map_err(RunnerError::Prior)?,
        PriorMode::Fresh => None,
    };

    let published = fit(
        dataset,
        embedder,
        &options.fit,
        Supplies {
            classifier,
            verdicts,
            prior: prior.as_ref(),
        },
        root,
        options.device,
        progress,
    )
    .await?;

    let id = published.id();

    let generation = root
        .open(id)
        .map_err(|source| RunnerError::Reopen { id, source })?;

    let report = probe(
        dataset,
        &generation,
        &options.quality,
        probe_rng(options.fit.seed),
    )
    .instrument(tracing::info_span!("admission"))
    .await
    .map_err(|source| RunnerError::Quality { id, source })?;

    // controls reduce the probe's steps to the extrema that decide admission. Reporting that same
    // reduction keeps the observer's readings consistent with the verdict. Missing evidence emits
    // no reading and still causes the corresponding control to refuse admission.
    for control in report.controls() {
        if let Some(reading) = control.reading {
            progress.quality_probe(control.metric, reading);
        }
    }

    progress.stage_completed(Stage::Admission);

    if !report.passes() {
        tracing::warn!(
            generation = %id,
            unresolved_flags = report.flags.len(),
            "quality admission refused: the generation stays published as an unactivated \
             candidate; diagnose the report, correct data, configuration, or metric, and run \
             again"
        );

        return Ok(Outcome {
            generation,
            report,
            admission: Admission::Candidate,
        });
    }

    root.activate(id)
        .map_err(|source| RunnerError::Activate { id, source })?;
    tracing::info!(generation = %id, "generation admitted and activated");

    Ok(Outcome {
        generation,
        report,
        admission: Admission::Active,
    })
}

/// Derives the admission probe's generator from the fit seed.
///
/// The generator seed is SHA-256 over the fit seed's eight little-endian bytes followed by
/// `admission-probe`. Keeping a separate generator makes the probe's draw sequence independent of
/// how many draws fitting consumes.
///
/// # Properties
///
/// For every fit seed, repeated calls produce the same generator state. Equal subsequent sampling
/// operations therefore produce equal draws.
pub(crate) fn probe_rng(seed: u64) -> Xoshiro256PlusPlus {
    let mut hasher = Sha256::new();
    #[expect(
        clippy::little_endian_bytes,
        reason = "the derivation preimage pins the canonical little-endian bytes"
    )]
    hasher.update(&seed.to_le_bytes());
    hasher.update(b"admission-probe");

    Xoshiro256PlusPlus::from_seed(hasher.finalize().to_bytes())
}
