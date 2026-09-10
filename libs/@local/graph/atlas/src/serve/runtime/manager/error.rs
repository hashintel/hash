use core::{error::Error, fmt};

/// A generation maintenance configuration or operation failure.
#[derive(Debug)]
pub(crate) enum ManagerError {
    /// The current-pointer polling interval is zero.
    InvalidInterval,
    /// Reading the current-generation pointer failed.
    Current,
    /// Opening the generation's metadata failed.
    Open,
    /// Initializing the generation's runtime failed.
    Runtime,
    /// Removing an expired generation failed.
    Remove,
    /// An offloaded operation failed to return a value.
    Offload,
}

impl fmt::Display for ManagerError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInterval => {
                fmt.write_str("the current-pointer polling interval must be non-zero")
            }
            Self::Current => fmt.write_str("could not read the current-generation pointer"),
            Self::Open => fmt.write_str("could not open the generation metadata"),
            Self::Runtime => fmt.write_str("could not initialize the generation runtime"),
            Self::Remove => fmt.write_str("could not remove the expired generation"),
            Self::Offload => fmt.write_str("the generation maintenance worker failed"),
        }
    }
}

impl Error for ManagerError {}
