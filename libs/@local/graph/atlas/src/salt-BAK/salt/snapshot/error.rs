use core::{error::Error, fmt};

use crate::salt::revision::AuthorizationRevision;

/// A failed authorization query while freezing snapshot visibility.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SnapshotError {
    EntityPermission,
    EntityTypePermission,
    CorpusPermission {
        row: usize,
    },
    ExtractionReceipt,
    AuthorizationRevision,
    AuthorizationRevisionChanged {
        before: AuthorizationRevision,
        after: AuthorizationRevision,
    },
}

impl fmt::Display for SnapshotError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EntityPermission => {
                formatter.write_str("could not authorize snapshot entity editions")
            }
            Self::EntityTypePermission => {
                formatter.write_str("could not authorize snapshot entity types")
            }
            Self::CorpusPermission { row } => write!(
                formatter,
                "generation corpus row {row} is not visible at its selected entity edition"
            ),
            Self::ExtractionReceipt => formatter
                .write_str("store extraction receipt is invalid or does not bind the frozen input"),
            Self::AuthorizationRevision => {
                formatter.write_str("could not read the authorization subsystem revision")
            }
            Self::AuthorizationRevisionChanged { before, after } => write!(
                formatter,
                "authorization revision changed from {before} to {after} while freezing the \
                 snapshot"
            ),
        }
    }
}

impl Error for SnapshotError {}
