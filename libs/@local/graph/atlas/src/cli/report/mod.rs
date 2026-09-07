//! Analysis instruments over published generations, one submodule per report.
//!
//! Every instrument reads artifacts a fit already published and returns its readings. The host
//! renders them. The certified refit and the live assessment also write their evidence record,
//! because a bundle outlives the terminal that shows it.

use core::{
    error::Error,
    fmt::{self, Display},
};
use std::io;

use self::{
    classifier::{ClassifierArgs, ClassifierVerdict},
    clumps::ClumpArgs,
    knn::{BackendArgs, DescentArgs},
    ladder::{LadderArgs, LadderVerdict},
    probe::ProbeArgs,
    quality::{QualityArgs, QualityVerdict},
    realization::{RealizationArgs, RealizationError},
};
use crate::{
    identity::NodeRowId,
    salt::{
        knn::{
            descent::NnDescentError,
            report::{AuditError, backend, descent},
        },
        quality::report::{
            calibration::{Calibration, CalibrationError},
            live::AssessError,
        },
    },
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

/// One report invocation's failure.
#[derive(Debug)]
pub(crate) enum ReportError {
    /// Writing the report bundle failed.
    Io(io::Error),
    /// Dialing the store connection failed.
    Connect(super::ConnectError),
    /// The live assessment failed.
    Assess(AssessError),
    /// The clump calibration could not read its table.
    Clumps(CalibrationError),
    /// The backend sweep failed.
    KnnBackend(backend::SweepError),
    /// The NN-Descent audit failed.
    KnnDescent(AuditError<NodeRowId, NnDescentError>),
    /// The realization report refused.
    Realization(RealizationError),
}

impl Display for ReportError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => fmt.write_str("the report bundle could not be written"),
            Self::Connect(_) => fmt.write_str("the store connection could not be dialed"),
            // Each instrument's own chain names the step that failed;
            // this level adds no step of its own.
            Self::Assess(error) => Display::fmt(error, fmt),
            Self::Clumps(error) => Display::fmt(error, fmt),
            Self::KnnBackend(error) => Display::fmt(error, fmt),
            Self::KnnDescent(error) => Display::fmt(error, fmt),
            Self::Realization(error) => Display::fmt(error, fmt),
        }
    }
}

impl Error for ReportError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Connect(error) => Some(error),
            Self::Assess(error) => error.source(),
            Self::Clumps(error) => error.source(),
            Self::KnnBackend(error) => error.source(),
            Self::KnnDescent(error) => error.source(),
            Self::Realization(error) => error.source(),
        }
    }
}

/// The report subcommands, one per instrument.
#[derive(Debug, clap::Subcommand)]
pub(crate) enum ReportCommand {
    /// Refits a published generation's classifier from its staged corpus and certifies the bytes
    /// against the deployed artifact, then writes the report bundle.
    Classifier(ClassifierArgs),

    /// Reads the clump grouping's shape at every candidate ε over a published k-NN table.
    Clumps(ClumpArgs),

    /// Sweeps the search backend's build and query breadths over the active generation.
    KnnBackend(BackendArgs),

    /// Audits NN-Descent neighbour constructions over the active generation.
    KnnDescent(DescentArgs),

    /// Reads the relation effect of the condition ladder in world units over a published
    /// generation - endpoint-distance contraction of the engaged pairs against the zero-condition
    /// step - and writes the report bundle.
    Ladder(LadderArgs),

    /// Solves one fold subset from a frozen classifier corpus - a published generation's or
    /// supplied artifacts' - and dumps every receipt; a budget-refused solve additionally traces
    /// its stalling inner recurrence.
    Probe(ProbeArgs),

    /// Assesses the active generation's map fidelity over the live store and writes the report.
    Quality(QualityArgs),

    /// Certifies a generation's recorded target readings against the padded pass's realization.
    ///
    /// No published generation records target evidence, so every invocation resolves its
    /// generation and refuses.
    Realization(RealizationArgs),
}

impl ReportCommand {
    /// Runs the selected report.
    ///
    /// The probe dumps its receipts as it solves, so it is the one instrument whose product is not
    /// a verdict.
    ///
    /// # Errors
    ///
    /// Returns a [`ReportError`] when the instrument fails or the process cannot write its record.
    pub(crate) async fn run(self) -> Result<Option<ReportVerdict>, ReportError> {
        match self {
            Self::Classifier(args) => args.run().await.map(ReportVerdict::Classifier).map(Some),
            Self::Clumps(args) => args
                .run()
                .map(ReportVerdict::Clumps)
                .map(Some)
                .map_err(ReportError::Clumps),
            Self::KnnBackend(args) => args
                .run()
                .map(ReportVerdict::KnnBackend)
                .map(Some)
                .map_err(ReportError::KnnBackend),
            Self::KnnDescent(args) => args
                .run()
                .map(ReportVerdict::KnnDescent)
                .map(Some)
                .map_err(ReportError::KnnDescent),
            Self::Ladder(args) => args.run().map(ReportVerdict::Ladder).map(Some),
            Self::Probe(args) => {
                args.run().await;
                Ok(None)
            }
            Self::Quality(args) => args.run().await.map(ReportVerdict::Quality).map(Some),
            Self::Realization(args) => Err(args.run()),
        }
    }
}
