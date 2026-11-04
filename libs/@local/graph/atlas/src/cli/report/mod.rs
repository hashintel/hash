//! Analyses over published generations, one submodule per report.
//!
//! An analysis reads artifacts a fit already published and returns its readings for the host to
//! render. The probe stands outside both halves of that: it solves a corpus a published generation
//! or supplied artifacts carry, and prints each solve's record as it goes. The certified refit and
//! the live assessment also write their evidence record, because a bundle outlives the terminal
//! that shows it.

use core::{
    error::Error,
    fmt::{self, Display},
};

use error_stack::{Report, ResultExt as _};

use self::{
    classifier::{ClassifierArgs, ClassifierVerdict},
    clumps::ClumpArgs,
    knn::{BackendArgs, DescentArgs},
    ladder::{LadderArgs, LadderVerdict},
    probe::ProbeArgs,
    quality::{QualityArgs, QualityVerdict},
    realization::RealizationArgs,
};
use crate::salt::{
    knn::report::{backend, descent},
    quality::report::calibration::Calibration,
};

mod classifier;
mod clumps;
mod knn;
mod ladder;
mod probe;
mod quality;
mod realization;

/// One report invocation's readings, in its own vocabulary.
#[derive(Debug)]
pub(crate) enum ReportVerdict {
    /// The certified classifier refit.
    Classifier(ClassifierVerdict),
    /// The clump grouping's shape per candidate threshold.
    Clumps(Calibration),
    /// The search backend's grid readings.
    KnnBackend(backend::Sweep),
    /// The NN-Descent constructions' readings.
    KnnDescent(descent::Audit),
    /// The condition ladder's relation-effect reading.
    Ladder(LadderVerdict),
    /// One live quality assessment.
    Quality(QualityVerdict),
}

impl Display for ReportVerdict {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Classifier(verdict) => Display::fmt(verdict, fmt),
            Self::Clumps(calibration) => Display::fmt(calibration, fmt),
            Self::KnnBackend(sweep) => Display::fmt(sweep, fmt),
            Self::KnnDescent(audit) => Display::fmt(audit, fmt),
            Self::Ladder(verdict) => Display::fmt(verdict, fmt),
            Self::Quality(verdict) => Display::fmt(verdict, fmt),
        }
    }
}

/// One report invocation's failure, by step.
#[derive(Debug)]
pub(crate) enum ReportError {
    /// Writing the report bundle failed.
    Write,
    /// Serializing the report failed.
    Serialize,
    /// Dialing the store connection failed.
    Connect,
    /// The live assessment failed.
    Assess,
    /// The clump calibration could not read its table.
    Clumps,
    /// The backend sweep failed.
    KnnBackend,
    /// The NN-Descent audit failed.
    KnnDescent,
    /// The realization report refused.
    Realization,
}

impl Display for ReportError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Write => fmt.write_str("the report bundle could not be written"),
            Self::Serialize => fmt.write_str("report serialization failed"),
            Self::Connect => fmt.write_str("the store connection could not be dialed"),
            Self::Assess => fmt.write_str("the live assessment failed"),
            Self::Clumps => fmt.write_str("the clump calibration failed"),
            Self::KnnBackend => fmt.write_str("the backend sweep failed"),
            Self::KnnDescent => fmt.write_str("the NN-Descent audit failed"),
            Self::Realization => fmt.write_str("the realization report refused"),
        }
    }
}

impl Error for ReportError {}

/// The report subcommands, one per analysis.
#[derive(Debug, clap::Subcommand)]
pub(crate) enum ReportCommand {
    /// Refits a published generation's classifier and writes the report bundle.
    ///
    /// The refit reads the staged corpus and certifies the bytes against the deployed artifact.
    Classifier(ClassifierArgs),

    /// Reads the clump grouping's shape at every candidate ε over a published k-NN table.
    Clumps(ClumpArgs),

    /// Sweeps the search backend's build and query breadths over the active generation.
    KnnBackend(BackendArgs),

    /// Audits NN-Descent neighbour constructions over the active generation.
    KnnDescent(DescentArgs),

    /// Reads the condition ladder's relation effect in world units over a published generation.
    ///
    /// The effect is the endpoint-distance contraction of the engaged pairs against the
    /// zero-condition step. The run writes the report bundle.
    Ladder(LadderArgs),

    /// Solves one fold subset from a frozen classifier corpus and dumps every solve record.
    ///
    /// The corpus is a published generation's or supplied artifacts'. A budget-refused solve
    /// additionally traces its stalling inner recurrence.
    Probe(ProbeArgs),

    /// Assesses the active generation's map fidelity over the live store and writes the report.
    Quality(QualityArgs),

    /// Certifies a generation's recorded target readings against the padded pass's realization.
    ///
    /// No published generation records target evidence. Every invocation resolves its generation
    /// and refuses.
    Realization(RealizationArgs),
}

impl ReportCommand {
    /// Runs the selected report.
    ///
    /// The probe dumps its records as it solves and answers `Ok(None)`, the one analysis that
    /// returns no verdict. Realization answers with its refusal instead.
    ///
    /// # Errors
    ///
    /// Returns a [`ReportError`] when the analysis fails or the process cannot write its record.
    pub(crate) async fn run(self) -> Result<Option<ReportVerdict>, Report<ReportError>> {
        let verdict = match self {
            Self::Classifier(args) => ReportVerdict::Classifier(args.run().await?),
            Self::Clumps(args) => {
                ReportVerdict::Clumps(args.run().change_context(ReportError::Clumps)?)
            }
            Self::KnnBackend(args) => {
                ReportVerdict::KnnBackend(args.run().change_context(ReportError::KnnBackend)?)
            }
            Self::KnnDescent(args) => {
                ReportVerdict::KnnDescent(args.run().change_context(ReportError::KnnDescent)?)
            }
            Self::Ladder(args) => ReportVerdict::Ladder(args.run()?),
            Self::Probe(args) => {
                args.run().await;
                return Ok(None);
            }
            Self::Quality(args) => ReportVerdict::Quality(args.run().await?),
            Self::Realization(args) => {
                return Err(Report::new(args.run()).change_context(ReportError::Realization));
            }
        };

        Ok(Some(verdict))
    }
}
