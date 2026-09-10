//! Original metadata bytes preserve a generation's content-derived identity.

use std::{fs, io};

use camino::Utf8Path;

use super::{GenerationId, METADATA_FILE, OpenError};
use crate::{file::salt::SaltRepository, integrity::Sha256Digest};

#[cfg(test)]
mod tests;

/// A parsed metadata document with its original, identity-verified bytes.
///
/// Serializing the parsed [`SaltRepository`] can change its JSON formatting and therefore its
/// [`GenerationId`]. Retaining the original bytes preserves that identity when copying the
/// document.
#[derive(Debug, Clone)]
pub(crate) struct GenerationDocument {
    id: GenerationId,
    bytes: Vec<u8>,
    repository: SaltRepository,
}

impl GenerationDocument {
    /// Verifies and parses the original metadata bytes.
    ///
    /// # Errors
    ///
    /// Returns [`OpenError`] for an identity mismatch or an invalid repository document. Identity
    /// verification precedes parsing.
    pub(crate) fn new(id: GenerationId, bytes: Vec<u8>) -> Result<Self, OpenError> {
        let actual = Sha256Digest::of(&bytes);
        if actual != id.digest() {
            return Err(OpenError::Identity { id, actual });
        }

        let repository = serde_json::from_slice(&bytes)?;
        Ok(Self {
            id,
            bytes,
            repository,
        })
    }

    /// Reads and verifies the metadata in a generation directory.
    ///
    /// # Errors
    ///
    /// Returns [`OpenError`] when reading, identity verification or repository parsing fails.
    pub(super) fn read(path: impl AsRef<Utf8Path>, id: GenerationId) -> Result<Self, OpenError> {
        let bytes = match fs::read(path.as_ref().join(METADATA_FILE)) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Err(OpenError::Unpublished(id));
            }
            Err(error) => return Err(error.into()),
        };

        Self::new(id, bytes)
    }

    /// Returns the identity verified against the original bytes.
    #[must_use]
    pub(crate) const fn id(&self) -> GenerationId {
        self.id
    }

    /// Returns the original JSON encoding, including its whitespace.
    #[must_use]
    pub(crate) const fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Returns the repository parsed from the original bytes.
    #[must_use]
    pub(crate) const fn repository(&self) -> &SaltRepository {
        &self.repository
    }
}
