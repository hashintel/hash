//! Shared object paths for publishing and acquiring generations.
//!
//! [`RemoteRoot`] locates current and previous pointers below `generations/`. Its repository and
//! active prefixes locate immutable [`RemoteGeneration`] publications, each completed by its
//! metadata document.

use super::{GenerationId, METADATA_FILE};
use crate::file::{
    repository::FileName,
    storage::path::{FilePath, error::FilePathError},
};

/// The object prefix of one repository or active generation.
pub(crate) struct RemoteGeneration {
    path: FilePath,
}

impl RemoteGeneration {
    /// Returns the prefix containing this generation's metadata and artifacts.
    pub(crate) const fn directory(&self) -> &FilePath {
        &self.path
    }

    /// Locates the document completing this publication.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] if constructing the object path fails.
    pub(crate) fn metadata(&self) -> Result<FilePath, FilePathError> {
        self.path.join(METADATA_FILE)
    }

    /// Locates an artifact by its validated repository name.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] if constructing the object path fails.
    pub(crate) fn artifact(&self, name: &FileName) -> Result<FilePath, FilePathError> {
        self.path.join(name.as_str())
    }
}

/// The parent location of a remote `generations/` namespace.
#[repr(transparent)]
pub(crate) struct RemoteRoot(FilePath);

impl RemoteRoot {
    /// Borrows `path` as the parent of a `generations/` namespace.
    pub(crate) const fn from_ref(path: &FilePath) -> &Self {
        // SAFETY: `repr(transparent)` gives `RemoteRoot` the layout and alignment of its sole
        // `FilePath` field. Every valid `FilePath` is a valid `RemoteRoot`, and the cast preserves
        // the allocation and shared borrow's lifetime. Therefore dereferencing the cast pointer as
        // `&RemoteRoot` is sound.
        unsafe { &*(&raw const *path).cast::<Self>() }
    }

    /// Locates the selected generation's identity.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] if constructing the object path fails.
    pub(crate) fn current(&self) -> Result<FilePath, FilePathError> {
        self.0.join("generations/current")
    }

    /// Locates the advisory identity replaced by the last promotion.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] if constructing the object path fails.
    pub(crate) fn previous(&self) -> Result<FilePath, FilePathError> {
        self.0.join("generations/previous")
    }

    /// Locates an uploaded publication independently of admission.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] if constructing the prefix fails.
    pub(crate) fn repository(&self, id: GenerationId) -> Result<RemoteGeneration, FilePathError> {
        Ok(RemoteGeneration {
            path: self.0.join(&format!("generations/repository/{id}"))?,
        })
    }

    /// Locates a publication eligible for current-pointer selection.
    ///
    /// # Errors
    ///
    /// Returns [`FilePathError`] if constructing the prefix fails.
    pub(crate) fn active(&self, id: GenerationId) -> Result<RemoteGeneration, FilePathError> {
        Ok(RemoteGeneration {
            path: self.0.join(&format!("generations/active/{id}"))?,
        })
    }
}
