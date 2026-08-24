//! One production run from snapshot to active generation.
//!
//! [`run`] composes the pipeline's separate decisions into the one sequence production takes: the
//! prior comes from the root's active generation, [`fit`] publishes a complete verified generation,
//! the quality suite probes the published artifacts against the same snapshot, and a passing
//! verdict activates the generation by the atomic pointer flip. A failing verdict returns an
//! [`Outcome`] whose generation stays published as a candidate beside its report; the remedy is to
//! diagnose the report, correct data, configuration, or metric, and run again - a candidate never
//! activates by hand.
//!
//! The whole run replays from the one fit seed. The admission probe's generator derives from that
//! seed under a pinned name, exactly as the fit stages derive theirs, so equal configurations
//! sample equal anchors.
//!
//! Retiring old generations is offline tooling over published directories.

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

/// Where one run's prior generation comes from.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) enum PriorMode {
    /// The root's active generation is the prior.
    ///
    /// Card rows reuse embeddings by text hash and landmarks compete for the retained share. A root
    /// without an activation runs fresh.
    #[default]
    FromActive,
    /// No prior: every card row embeds anew and the landmark selection starts cold.
    ///
    /// The reset for a changed embedding contract.
    Fresh,
}

/// Every setting of one generation run.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RunnerOptions {
    /// The fit's settings, whose seed also derives the admission probe's sampling.
    pub fit: FitConfig,
    /// Where the prior generation comes from.
    pub prior: PriorMode = PriorMode::FromActive,
    /// The admission probe's sampling, grouping, and thresholds.
    pub quality: QualityRunOptions = QualityRunOptions::default(),
    /// The device the fit's tensor stages run on. The host-derived family by default.
    pub device: PhysicalDevice,
}

/// How one published generation left the runner.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Admission {
    /// The report's thresholds held and the root's pointer names the generation.
    Active,
    /// The report refused admission, so the generation stays published and unactivated.
    ///
    /// Serving it anyway is a decision recorded outside the runner.
    Candidate,
}

/// The published generation of one finished run and its admission evidence.
#[derive(Debug, Clone)]
pub(crate) struct Outcome {
    /// The published generation, reopened and verified against its identity.
    pub generation: Generation,
    /// The admission probe's full evidence record.
    pub report: QualityReport,
    /// Whether the run activated the generation.
    pub admission: Admission,
}

/// Runs one generation end to end and activates it on admission.
///
/// The dataset serves both halves of the run (the fit's ingest streams and the admission probe's
/// sampled lookups), so the probed corpus is the fitted corpus by construction. The classifier
/// input is a supplied fitted artifact or an annotation corpus the fit assembles and fits inside
/// the run ([`ClassifierInput`]). The reviewed verdicts are a supplied input the fit stages for the
/// trainer, and [`None`] runs without a review file.
///
/// A report that refuses admission returns [`Admission::Candidate`] with the generation published
/// and unactivated. Only failures that prevent a verdict are errors.
///
/// # Errors
///
/// Returns an error when the run cannot resolve the prior ([`RunnerError::Current`],
/// [`RunnerError::Prior`]), when the fit cannot publish ([`RunnerError::Fit`]), or, with the
/// published generation's identity attached, when the run cannot reopen the generation, when the
/// probe cannot produce a report, or when the run cannot activate the admitted generation.
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
    P: Progress + Sync,
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

    // The run reports the battery's readings here rather than from inside the probe, because the
    // reading a control turns on is an extremum over the probe's steps and only exists once the
    // report reduces them - and it is the same reduction the verdict reads. A control whose
    // evidence is absent reports nothing: there is no measurement to observe, and the refusal is
    // the report's to carry.
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
/// The pinned name keeps the derivation disjoint from every fit stage's, so the probe samples
/// independently of the fit's draws while the whole run replays from the one seed.
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
