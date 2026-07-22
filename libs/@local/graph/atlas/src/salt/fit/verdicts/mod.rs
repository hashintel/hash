//! The supplied reviewed-verdicts input of one fit.
//!
//! A reviewed-verdicts document is supplied beside the corpus rather than derived from it - the
//! same input category as the policy override table. [`SuppliedVerdicts`] runs the document's whole
//! wire contract at construction through the verdict reader and keeps the exact wire bytes, so the
//! staged artifact is byte-identical to the supplied file and the digest computed here is the
//! supplied file's identity.
//!
//! The fit carries the document into the generation without acting on it: fan-out from verdicts to
//! row pairs happens at the trainer's phase boundary, which consumes the staged artifact like every
//! other training input.

use core::{error::Error, fmt};
use std::io;

use camino::Utf8Path;

use crate::{
    integrity::{Sha256, Sha256Digest, Update as _},
    salt::projector::verdict::{InvalidReviewedVerdicts, ReviewedVerdicts},
};

#[cfg(test)]
mod tests;

/// The supplied verdicts file could not be admitted.
#[derive(Debug)]
pub(crate) enum SupplyError {
    /// The file could not be read.
    Io(io::Error),
    /// The bytes violate the reviewed-verdicts wire contract.
    Invalid(InvalidReviewedVerdicts),
}

impl fmt::Display for SupplyError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(_) => fmt.write_str("the supplied verdicts file could not be read"),
            Self::Invalid(_) => {
                fmt.write_str("the supplied verdicts file violates the wire contract")
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

/// One validated reviewed-verdicts document with its exact wire bytes.
///
/// A value of this type is admissible by existence: construction validated the document, so a fit
/// holding one stages the bytes verbatim and binds the digest without any further check - and a
/// document that would fail admission is rejected before the fit spends anything.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct SuppliedVerdicts {
    bytes: Box<[u8]>,
    document: ReviewedVerdicts,
    hash: Sha256Digest,
}

impl SuppliedVerdicts {
    /// Validates one document from its exact wire bytes.
    ///
    /// # Errors
    ///
    /// Returns an [`InvalidReviewedVerdicts`] describing the first violated contract clause.
    pub(crate) fn from_bytes(bytes: impl Into<Box<[u8]>>) -> Result<Self, InvalidReviewedVerdicts> {
        let bytes = bytes.into();
        let document = ReviewedVerdicts::from_slice(&bytes)?;

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
    /// Returns a [`SupplyError`] when the file cannot be read or its bytes violate the wire
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
    pub(crate) const fn document(&self) -> &ReviewedVerdicts {
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
