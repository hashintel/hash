//! Opening published generations for reading.

use core::{error::Error, fmt};
use std::{fs, io};

use camino::{Utf8Path, Utf8PathBuf};

use super::{GenerationId, GenerationRoot, METADATA_FILE, document_digest};
use crate::{
    file::{repository::FileName, salt::SaltRepository},
    integrity::Sha256Digest,
};

/// A published generation could not be opened.
#[derive(Debug)]
pub enum OpenError {
    /// The generation is not published in this root.
    Unpublished(GenerationId),
    /// The document's bytes do not hash to the generation id.
    Identity {
        /// The generation the caller asked for.
        id: GenerationId,
        /// What the document's bytes actually hash to.
        actual: Sha256Digest,
    },
    /// The document does not parse as a repository this module speaks.
    Document(serde_json::Error),
    /// The document could not be read.
    Io(io::Error),
}

impl fmt::Display for OpenError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unpublished(id) => {
                write!(formatter, "generation {id} is not published in this root")
            }
            Self::Identity { id, actual } => write!(
                formatter,
                "the metadata document of generation {id} hashes to {actual}",
            ),
            Self::Document(error) => {
                write!(
                    formatter,
                    "the metadata document failed to deserialize: {error}"
                )
            }
            Self::Io(error) => write!(formatter, "the metadata document failed to read: {error}"),
        }
    }
}

impl Error for OpenError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Document(error) => Some(error),
            Self::Io(error) => Some(error),
            Self::Unpublished(_) | Self::Identity { .. } => None,
        }
    }
}

/// A published generation opened for reading.
///
/// Its identity, directory, and parsed metadata document.
///
/// Opening verifies the document against the generation id - the directory is named by the SHA-256
/// of `metadata.json` - so a value of this type names bytes that hash to its id. Artifact files are
/// located by [`path_of`](Self::path_of) and opened by their format modules; the per-file hashes
/// the document records are verified by tooling, not on every open.
#[derive(Debug, Clone)]
pub(crate) struct Generation {
    id: GenerationId,
    path: Utf8PathBuf,
    repository: SaltRepository,
}

impl GenerationRoot {
    /// Opens and verifies the published generation `id`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenError::Unpublished`] when the generation is not published in this root,
    /// [`OpenError::Identity`] when the document's bytes do not hash to `id`,
    /// [`OpenError::Document`] when they do not parse as a repository this module speaks, and
    /// [`OpenError::Io`] when they cannot be read.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(&self, id: GenerationId) -> Result<Generation, OpenError> {
        let path = self.generation_path(id);

        // Parsed, never mapped: the document is the JSON root of trust,
        // kilobyte-scale, read once per open, and inspected by humans
        // more often than machines - the palette's one JSON slot.
        let document = match fs::read(path.join(METADATA_FILE)) {
            Ok(document) => document,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Err(OpenError::Unpublished(id));
            }
            Err(error) => return Err(OpenError::Io(error)),
        };

        let actual = document_digest(&document);
        if actual != id.digest() {
            return Err(OpenError::Identity { id, actual });
        }

        let repository = serde_json::from_slice(&document).map_err(OpenError::Document)?;

        Ok(Generation {
            id,
            path,
            repository,
        })
    }
}

impl Generation {
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
