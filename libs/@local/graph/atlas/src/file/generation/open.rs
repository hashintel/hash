//! Opening published generations for reading.

use camino::{Utf8Path, Utf8PathBuf};

use super::{GenerationDocument, GenerationId, GenerationRoot, OpenError};
use crate::file::{repository::FileName, salt::SaltRepository};

/// A published generation opened for reading.
///
/// The accessors give the generation's identity, the directory, and the parsed metadata document.
///
/// Opening verifies the document against the generation id. The directory's name is the SHA-256 of
/// `metadata.json`. A value of this type therefore names bytes that hash to its id.
/// [`path_of`](Self::path_of) locates artifact files and their format modules open them. Opening
/// the generation checks the document alone. The serving open checks the per-file hashes the
/// document records as it opens each file, through
/// [`RepositoryFile::verify`](crate::file::repository::RepositoryFile::verify).
#[derive(Debug, Clone)]
pub(crate) struct Generation {
    path: Utf8PathBuf,
    document: GenerationDocument,
}

impl Generation {
    /// Opens and verifies the published generation `id` in `root`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenError`] for an unpublished generation, an identity mismatch, an unparsable
    /// document, or a read failure.
    #[tracing::instrument(skip_all)]
    pub(super) fn open(root: &GenerationRoot, id: GenerationId) -> Result<Self, OpenError> {
        let path = root.generation_path(id);
        let document = GenerationDocument::read(&path, id)?;

        Ok(Self { path, document })
    }

    /// Returns the generation's identity.
    #[inline]
    #[must_use]
    pub(crate) const fn id(&self) -> GenerationId {
        self.document.id()
    }

    /// Returns the generation's directory.
    #[inline]
    #[must_use]
    pub(crate) fn path(&self) -> &Utf8Path {
        &self.path
    }

    /// Returns the verified metadata and its original JSON encoding.
    #[must_use]
    pub(crate) const fn document(&self) -> &GenerationDocument {
        &self.document
    }

    /// Transfers ownership of the retained metadata document.
    pub(crate) fn into_document(self) -> GenerationDocument {
        self.document
    }

    /// Returns the verified metadata document.
    #[inline]
    #[must_use]
    pub(crate) const fn repository(&self) -> &SaltRepository {
        self.document.repository()
    }

    /// Returns the path of a published file.
    #[must_use]
    pub(crate) fn path_of(&self, name: &FileName) -> Utf8PathBuf {
        self.path.join(name.as_str())
    }
}
