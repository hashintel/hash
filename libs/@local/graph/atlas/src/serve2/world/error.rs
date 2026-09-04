use core::{error::Error, fmt};

use crate::file::repository::FileName;

/// A failure while opening a [`World`].
///
/// [`World`]: super::World
#[derive(Debug)]
pub enum WorldError {
    /// An artifact failed to open.
    Open {
        /// The artifact's repository file name.
        file: FileName,
    },
}

impl fmt::Display for WorldError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open { file } => write!(fmt, "the {file} artifact failed to open"),
        }
    }
}

impl Error for WorldError {}
