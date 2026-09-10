//! Per-run scratch storage, with directory cleanup and completion of individual files.

use std::{
    fs::{self, File},
    io,
};

use camino::{Utf8Path, Utf8PathBuf};
use uuid::Uuid;

#[cfg(test)]
pub(crate) mod tests;

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

    pub(crate) fn path(&self) -> &Utf8Path {
        &self.path
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

pub(crate) struct ScratchFile {
    pub file: tokio::fs::File,
    path: Utf8PathBuf,
}

impl ScratchFile {
    /// Creates a unique input file in `directory`.
    ///
    /// # Errors
    ///
    /// Returns an error if creating the file fails.
    pub(crate) async fn new(directory: &Utf8Path) -> io::Result<Self> {
        let path = directory.join(format!("input-{}", Uuid::now_v7()));
        let file = tokio::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .await?;

        Ok(Self { file, path })
    }

    /// Retains a completed input or removes a failed transfer's partial file.
    ///
    /// # Errors
    ///
    /// Returns the original transfer error after attempting to remove the partial file.
    pub(crate) async fn finish<E>(self, result: Result<(), E>) -> Result<Utf8PathBuf, E> {
        drop(self.file);

        if let Err(error) = result {
            drop(tokio::fs::remove_file(&self.path).await);
            return Err(error);
        }

        Ok(self.path)
    }
}
