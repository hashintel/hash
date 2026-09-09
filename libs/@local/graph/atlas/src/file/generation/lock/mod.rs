//! Cooperative exclusion between generation activation and removal.
//!
//! The root's persistent lock file serializes both operations across processes. Direct filesystem
//! edits require separate coordination.

use core::{error::Error, fmt};
use std::{
    fs::{self, File},
    io,
};

use super::{CurrentError, GenerationId, GenerationRoot};

#[cfg(test)]
mod tests;

const LOCK_FILE: &str = ".generation.lock";

/// A failure removing an inactive generation.
#[derive(Debug)]
pub(crate) enum RemoveError {
    /// Reading or parsing the current-generation pointer failed.
    Current(CurrentError),
    /// The current-generation pointer still names this generation.
    Active(GenerationId),
    /// Locking the root, removing the directory or syncing the root failed.
    Io(io::Error),
}

impl fmt::Display for RemoveError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Current(error) => write!(
                fmt,
                "could not read the current-generation pointer: {error}"
            ),
            Self::Active(id) => write!(fmt, "generation {id} is active"),
            Self::Io(error) => write!(fmt, "could not persist generation removal: {error}"),
        }
    }
}

impl Error for RemoveError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Current(error) => Some(error),
            Self::Active(_) => None,
        }
    }
}

impl From<io::Error> for RemoveError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<CurrentError> for RemoveError {
    fn from(error: CurrentError) -> Self {
        Self::Current(error)
    }
}

impl GenerationRoot {
    pub(super) fn lock(&self) -> io::Result<File> {
        // The lock file must retain its inode across acquisitions. Removing it would let concurrent
        // opens lock different files for the same root.
        let file = File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(self.path().join(LOCK_FILE))?;
        file.lock()?;
        Ok(file)
    }

    /// Removes an inactive generation while excluding concurrent activation.
    ///
    /// Blocks until the root lock is available and holds it through removal and root
    /// synchronization. Open artifact descriptors remain valid after removal.
    ///
    /// # Errors
    ///
    /// Returns [`RemoveError`] for locking, current-pointer or filesystem failures, including a
    /// still-active generation. A filesystem failure can leave a partially removed directory.
    #[tracing::instrument(skip_all, err, fields(generation = %id))]
    pub(crate) fn remove(&self, id: GenerationId) -> Result<(), RemoveError> {
        let _lock = self.lock()?;
        if self.current()? == Some(id) {
            return Err(RemoveError::Active(id));
        }

        fs::remove_dir_all(self.generation_path(id))?;
        File::open(self.path())?.sync_all()?;
        Ok(())
    }
}
