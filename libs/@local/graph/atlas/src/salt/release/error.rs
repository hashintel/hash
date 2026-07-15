use core::{error::Error, fmt};
use std::io;

use super::{evidence::GateEvidenceError, gate::GateId};
use crate::salt::activation::ActivationError;

/// A release report that cannot authorize activation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ReleaseGateError {
    Version { actual: u32 },
    NonCanonicalOrder,
    Duplicate { gate: GateId },
    Missing { gate: GateId },
}

impl fmt::Display for ReleaseGateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Version { actual } => {
                write!(
                    formatter,
                    "release gate report version {actual} is unsupported"
                )
            }
            Self::NonCanonicalOrder => {
                formatter.write_str("release gate outcomes are not in canonical order")
            }
            Self::Duplicate { gate } => {
                write!(formatter, "release gate {gate} appears more than once")
            }
            Self::Missing { gate } => write!(formatter, "release gate {gate} has no evidence"),
        }
    }
}

impl Error for ReleaseGateError {}

/// A failure to persist complete gate evidence and its candidate marker.
#[derive(Debug)]
pub(crate) enum ReleasePublishError {
    Io(io::Error),
    Json(serde_json::Error),
    Persist(tempfile::PersistError),
    Gate(ReleaseGateError),
    Evidence(GateEvidenceError),
    ExistingReportMismatch,
    Activation(ActivationError),
}

impl fmt::Display for ReleasePublishError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "could not write release report: {error}"),
            Self::Json(error) => write!(formatter, "could not encode release report: {error}"),
            Self::Persist(error) => write!(formatter, "could not publish release report: {error}"),
            Self::Gate(error) => error.fmt(formatter),
            Self::Evidence(error) => error.fmt(formatter),
            Self::ExistingReportMismatch => {
                formatter.write_str("existing immutable release report has different content")
            }
            Self::Activation(error) => error.fmt(formatter),
        }
    }
}

impl Error for ReleasePublishError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Json(error) => Some(error),
            Self::Persist(error) => Some(error),
            Self::Gate(error) => Some(error),
            Self::Evidence(error) => Some(error),
            Self::Activation(error) => Some(error),
            Self::ExistingReportMismatch => None,
        }
    }
}

impl From<io::Error> for ReleasePublishError {
    #[inline]
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for ReleasePublishError {
    #[inline]
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}

impl From<ReleaseGateError> for ReleasePublishError {
    #[inline]
    fn from(error: ReleaseGateError) -> Self {
        Self::Gate(error)
    }
}

impl From<GateEvidenceError> for ReleasePublishError {
    #[inline]
    fn from(error: GateEvidenceError) -> Self {
        Self::Evidence(error)
    }
}

impl From<ActivationError> for ReleasePublishError {
    #[inline]
    fn from(error: ActivationError) -> Self {
        Self::Activation(error)
    }
}
