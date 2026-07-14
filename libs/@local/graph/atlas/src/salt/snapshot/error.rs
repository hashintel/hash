use core::{error::Error, fmt};

/// A failed authorization query while freezing snapshot visibility.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SnapshotError {
    EntityPermission,
    EntityTypePermission,
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
        }
    }
}

impl Error for SnapshotError {}
