//! The supplied annotation-corpus input of one fit.
//!
//! A fit receives an annotation corpus beside the dataset rather than deriving one from it, the
//! same input category as the reviewed verdicts. [`SuppliedAnnotations`] runs the document's whole
//! wire contract at construction through the annotation reader and keeps the exact wire bytes, so
//! the staged artifact is byte-identical to the supplied file and the digest computed here is the
//! supplied file's identity.
//!
//! The fit consumes the document through the training-set assembly: the classifier stage fits the
//! relation-policy model from the assembled corpus and evaluates it on the corpus's holdout cards.

use core::{error::Error, fmt};
use std::io;

use camino::Utf8Path;

use crate::{
    integrity::{Sha256, Sha256Digest, Update as _},
    salt::policy::annotation::{AnnotationCorpus, InvalidAnnotationCorpus},
};

#[cfg(test)]
mod tests;

/// The supplied annotation-corpus file failed admission.
#[derive(Debug)]
pub enum SupplyError {
    /// Reading the file failed.
    Io(io::Error),
    /// The bytes violate the annotation-corpus wire contract.
    Invalid(InvalidAnnotationCorpus),
}

impl fmt::Display for SupplyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => fmt.write_str("the supplied annotation-corpus file could not be read"),
            Self::Invalid(_) => {
                fmt.write_str("the supplied annotation-corpus file violates the wire contract")
            }
        }
    }
}

impl Error for SupplyError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Invalid(error) => Some(error),
        }
    }
}

/// One validated annotation-corpus document with its exact wire bytes.
///
/// A value of this type is admissible by existence. Construction validated the document, so a fit
/// holding one stages the bytes verbatim and binds the digest without any further check. Admission
/// rejects a document that would fail it before the fit spends anything.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SuppliedAnnotations {
    /// The exact wire bytes, kept beside their parse: staging writes these verbatim, so the
    /// published digest binds precisely what admission validated. A re-serialization of
    /// [`document`](Self::document) would bind different bytes; a staging-time re-read of the
    /// source would bind unvalidated ones.
    bytes: Box<[u8]>,
    document: AnnotationCorpus,
    hash: Sha256Digest,
}

impl SuppliedAnnotations {
    /// Validates one document from its exact wire bytes.
    ///
    /// # Errors
    ///
    /// Returns an [`InvalidAnnotationCorpus`] describing the first violated contract clause.
    pub(crate) fn from_bytes(bytes: impl Into<Box<[u8]>>) -> Result<Self, InvalidAnnotationCorpus> {
        let bytes = bytes.into();
        let document = AnnotationCorpus::from_slice(&bytes)?;

        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let hash = hasher.finalize();

        Ok(Self {
            bytes,
            document,
            hash,
        })
    }

    /// Reads and validates the document at `path`.
    ///
    /// # Errors
    ///
    /// Returns a [`SupplyError`] when reading the file fails or its bytes violate the wire
    /// contract.
    pub(crate) fn open(path: impl AsRef<Utf8Path>) -> Result<Self, SupplyError> {
        let bytes = std::fs::read(path.as_ref().as_std_path()).map_err(SupplyError::Io)?;
        Self::from_bytes(bytes).map_err(SupplyError::Invalid)
    }

    /// Returns the exact wire bytes, as staged.
    #[inline]
    #[must_use]
    pub(crate) fn bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// Returns the validated document.
    #[inline]
    #[must_use]
    pub(crate) const fn document(&self) -> &AnnotationCorpus {
        &self.document
    }

    /// Returns the SHA-256 of the wire bytes.
    ///
    /// The supplied file's identity, as the generation manifest records it.
    #[inline]
    #[must_use]
    pub(crate) const fn hash(&self) -> Sha256Digest {
        self.hash
    }
}
