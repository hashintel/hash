//! Content identity for a request's visibility filter.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use core::hash::{Hash, Hasher};

use crate::integrity::{Sha256, Sha256Digest, Update as _};

/// A SHA-256 token derived from a filter document's exact bytes.
///
/// Hashing the filter document gives the cache key and fixed-width authority token a shared
/// content identity. No JSON canonicalization occurs. Formatting differences are distinct hash
/// inputs. Equality compares only SHA-256 outputs: collisions are not detected or resolved by
/// comparing retained documents.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct FilterDigest(Sha256Digest);

impl FilterDigest {
    /// Digests a filter document's exact bytes.
    ///
    /// Before hashing, this method prefixes the bytes, distinguishing filter documents from other
    /// content hashed by this crate without parsing or canonicalizing the document.
    pub(crate) fn of(filter: &[u8]) -> Self {
        let mut hasher = Sha256::new();
        hasher.update(b"filter");
        hasher.update(filter);

        Self(hasher.finalize())
    }
}

const impl PartialEq for FilterDigest {
    #[inline]
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

const impl Eq for FilterDigest {}

impl Hash for FilterDigest {
    #[inline]
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}
