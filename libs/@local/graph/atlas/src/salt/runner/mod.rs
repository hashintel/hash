//! The generation runner: one production run from snapshot to active generation.
//!
//! [`run`] composes the pipeline's separate decisions into the one sequence production takes: the
//! prior comes from the root's active generation, [`fit`] publishes a complete verified generation,
//! the quality suite probes the published artifacts against the same snapshot, and a passing
//! verdict activates the generation by the atomic pointer flip. A failing verdict is an
//! [`Outcome`], not an error: the generation stays published as a candidate, its report is the
//! evidence, and activating it anyway is a human decision made outside the runner
//! ([`GenerationRoot::activate`] by hand).
//!
//! The whole run replays from the one fit seed: the admission probe's generator derives from it
//! under a pinned name, exactly as the fit stages derive theirs, so equal configurations sample
//! equal anchors.
//!
//! Retiring old generations is not the runner's decision; pruning a root is offline tooling over
//! published directories.

use core::{error::Error, fmt};

use rand::SeedableRng as _;
use rand_xoshiro::Xoshiro256PlusPlus;
use tracing::Instrument as _;

use crate::{
    dataset::Dataset,
    file::generation::{
        ActivateError, CurrentError, Generation, GenerationId, GenerationRoot, OpenError,
    },
    integrity::{Sha256, Update as _},
    salt::{
        embedding::CardEmbedder,
        fit::{ClassifierInput, FitConfig, FitError, SuppliedVerdicts, fit},
        quality::{
            error::QualityRunError,
            report::QualityReport,
            runner::{QualityRunOptions, run as probe},
        },
    },
};

#[cfg(feature = "bench")]
pub mod bench;

#[cfg(test)]
mod tests;

/// Where one run's prior generation comes from.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Default)]
pub(crate) enum PriorMode {
    /// The root's active generation seeds reuse.
    ///
    /// Card rows by text hash, landmarks competing for the retained share. A root without an
    /// activation runs fresh.
    #[default]
    ReuseActive,
    /// No prior: every card row embeds anew and the landmark selection starts cold.
    ///
    /// The clean slate for a changed embedding contract.
    Fresh,
}

/// Every setting of one generation run.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct RunnerOptions {
    /// The fit's settings; its seed also derives the admission probe's sampling.
    pub fit: FitConfig,
    /// Where the prior generation comes from.
    pub prior: PriorMode = PriorMode::ReuseActive,
    /// The admission probe's sampling, grouping, and gates.
    pub quality: QualityRunOptions = QualityRunOptions::default(),
}

/// How one published generation left the runner.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum Admission {
    /// The report's gates held and the root's pointer names the generation.
    Active,
    /// The report refused admission; the generation is published but not activated.
    ///
    /// Serving it anyway is a decision recorded outside the runner.
    Candidate,
}

/// One finished run: the published generation and its admission evidence.
#[derive(Debug, Clone)]
pub(crate) struct Outcome {
    /// The published generation, reopened and verified against its identity.
    pub generation: Generation,
    /// The admission probe's full evidence record.
    pub report: QualityReport,
    /// Whether the generation was activated.
    pub admission: Admission,
}

/// The run could not reach a verdict.
///
/// Variants after the fit carry the published generation's identity: the artifacts are complete on
/// disk, and the remedy - reopening, re-probing, or activating by hand - starts from that id rather
/// than from another fit.
#[derive(Debug)]
pub(crate) enum RunnerError<D, E> {
    /// The current-generation pointer could not be read.
    Current(CurrentError),
    /// The active generation could not be opened as the prior.
    Prior(OpenError),
    /// The fit could not publish; nothing is on disk.
    Fit(FitError<D, E>),
    /// The published generation could not be reopened.
    Reopen { id: GenerationId, source: OpenError },
    /// The admission probe could not produce a report.
    Quality {
        id: GenerationId,
        source: QualityRunError<D>,
    },
    /// The admitted generation could not be activated.
    Activate {
        id: GenerationId,
        source: ActivateError,
    },
}

impl<D, E> fmt::Display for RunnerError<D, E> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Current(_) => fmt.write_str("the current-generation pointer could not be read"),
            Self::Prior(_) => {
                fmt.write_str("the active generation could not be opened as the prior")
            }
            Self::Fit(_) => fmt.write_str("the fit could not publish"),
            Self::Reopen { id, .. } => {
                write!(fmt, "published generation {id} could not be reopened")
            }
            Self::Quality { id, .. } => write!(
                fmt,
                "the admission probe over published generation {id} could not produce a report",
            ),
            Self::Activate { id, .. } => {
                write!(fmt, "admitted generation {id} could not be activated")
            }
        }
    }
}

impl<D: Error + 'static, E: Error + 'static> Error for RunnerError<D, E> {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Current(error) => Some(error),
            Self::Prior(error) | Self::Reopen { source: error, .. } => Some(error),
            Self::Fit(error) => Some(error),
            Self::Quality { source, .. } => Some(source),
            Self::Activate { source, .. } => Some(source),
        }
    }
}

/// Runs one generation end to end and activates it on admission.
///
/// The dataset serves both halves of the run - the fit's ingest streams and the admission probe's
/// sampled lookups - so the probed corpus is the fitted corpus by construction. The classifier
/// input is a supplied fitted artifact or an annotation corpus the fit assembles and fits inside
/// the run ([`ClassifierInput`]), and the reviewed verdicts are a supplied input the fit stages for
/// the trainer, absent when no review file accompanies the run.
///
/// A report that refuses admission returns [`Admission::Candidate`] with the generation published
/// and unactivated; only failures that prevent a verdict are errors.
///
/// # Errors
///
/// Returns an error when the prior cannot be resolved ([`RunnerError::Current`],
/// [`RunnerError::Prior`]), the fit cannot publish ([`RunnerError::Fit`]), or - with the published
/// generation's identity attached - when the generation cannot be reopened, the probe cannot
/// produce a report, or the admitted generation cannot be activated.
pub(crate) async fn run<D, E>(
    dataset: &D,
    embedder: &E,
    classifier: &ClassifierInput,
    verdicts: Option<&SuppliedVerdicts>,
    root: &GenerationRoot,
    options: &RunnerOptions,
) -> Result<Outcome, RunnerError<D::Error, E::Error>>
where
    D: Dataset,
    E: CardEmbedder + Sync,
{
    let prior = match options.prior {
        PriorMode::ReuseActive => root
            .current()
            .map_err(RunnerError::Current)?
            .map(|id| root.open(id))
            .transpose()
            .map_err(RunnerError::Prior)?,
        PriorMode::Fresh => None,
    };

    let published = fit(
        dataset,
        embedder,
        &options.fit,
        classifier,
        verdicts,
        prior.as_ref(),
        root,
    )
    .await
    .map_err(RunnerError::Fit)?;
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

    if !report.passes() {
        tracing::warn!(
            generation = %id,
            flags = report.flags.len(),
            "the report refused admission; the generation stays a candidate"
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
fn probe_rng(seed: u64) -> Xoshiro256PlusPlus {
    let mut hasher = Sha256::new();
    #[expect(
        clippy::little_endian_bytes,
        reason = "the derivation preimage pins the canonical little-endian bytes"
    )]
    hasher.update(&seed.to_le_bytes());
    hasher.update(b"admission-probe");

    Xoshiro256PlusPlus::from_seed(hasher.finalize().to_bytes())
}
