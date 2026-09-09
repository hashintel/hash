//! Transient per-run scratch directories, dropped when their handle goes out of scope.

use std::{
    fs::{self, File},
    io,
};

use camino::Utf8PathBuf;

/// A dot-prefixed directory for one run's transient working state.
///
/// Dropping the handle removes the whole directory.
#[derive(Debug)]
#[clippy::has_significant_drop]
pub(crate) struct ScratchDirectory {
    path: Utf8PathBuf,
}

impl ScratchDirectory {
    /// Adopts an existing directory as a scratch root.
    ///
    /// Dropping the value removes the directory and everything inside.
    pub(crate) const fn new(path: Utf8PathBuf) -> Self {
        Self { path }
    }

    /// Creates (or reuses) a named subdirectory and returns its path.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the subdirectory fails.
    pub(crate) fn directory(&self, name: &str) -> io::Result<Utf8PathBuf> {
        let path = self.path.join(name);
        fs::create_dir_all(&path)?;

        Ok(path)
    }

    /// Creates a named file directly under the scratch root and returns it with its path.
    ///
    /// # Errors
    ///
    /// Returns an error when creating the scratch root or the file fails.
    pub(crate) fn file(&self, name: &str) -> io::Result<(Utf8PathBuf, File)> {
        let path = self.path.join(name);
        fs::create_dir_all(&self.path)?;

        File::create(&path).map(|file| (path, file))
    }
}

impl Drop for ScratchDirectory {
    fn drop(&mut self) {
        drop(fs::remove_dir_all(&self.path));
    }
}
