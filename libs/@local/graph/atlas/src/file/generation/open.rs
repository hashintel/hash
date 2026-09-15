//! Opening published generations for reading.

use std::{fs, io};

use camino::{Utf8Path, Utf8PathBuf};

use super::{GenerationId, GenerationRoot, METADATA_FILE, OpenError};
use crate::{
    file::{repository::FileName, salt::SaltRepository},
    integrity::Sha256Digest,
};

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
    id: GenerationId,
    path: Utf8PathBuf,
    repository: SaltRepository,
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

        let document = match fs::read(path.join(METADATA_FILE)) {
            Ok(document) => document,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Err(OpenError::Unpublished(id));
            }
            Err(error) => return Err(OpenError::Io(error)),
        };

        let actual = Sha256Digest::of(&document);
        if actual != id.digest() {
            return Err(OpenError::Identity { id, actual });
        }

        let repository = serde_json::from_slice(&document).map_err(OpenError::Document)?;

        Ok(Self {
            id,
            path,
            repository,
        })
    }

    /// Returns the generation's identity.
    #[inline]
    #[must_use]
    pub(crate) const fn id(&self) -> GenerationId {
        self.id
    }

    /// Returns the generation's directory.
    #[inline]
    #[must_use]
    pub(crate) fn path(&self) -> &Utf8Path {
        &self.path
    }

    /// Returns the verified metadata document.
    #[inline]
    #[must_use]
    pub(crate) const fn repository(&self) -> &SaltRepository {
        &self.repository
    }

    /// Returns the path of a published file.
    #[must_use]
    pub(crate) fn path_of(&self, name: &FileName) -> Utf8PathBuf {
        self.path.join(name.as_str())
    }
}
