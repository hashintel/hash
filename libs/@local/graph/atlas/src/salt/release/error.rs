use core::{error::Error, fmt};

use super::gate::GateId;

/// A release report that cannot authorize activation.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum ReleaseGateError {
    Duplicate { gate: GateId },
    Missing { gate: GateId },
    Failed { gate: GateId },
}

impl fmt::Display for ReleaseGateError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Duplicate { gate } => {
                write!(formatter, "release gate {gate} appears more than once")
            }
            Self::Missing { gate } => write!(formatter, "release gate {gate} has no evidence"),
            Self::Failed { gate } => write!(formatter, "release gate {gate} did not pass"),
        }
    }
}

impl Error for ReleaseGateError {}
