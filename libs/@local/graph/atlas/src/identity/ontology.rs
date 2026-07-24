//! The ontology type row domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use zerocopy::{LE, U64};

use super::Identity;

/// A reference to a type by its position in [`Dataset::ontology`].
///
/// Rows are dense and zero-based: the value is the position of the referenced type in the stream.
/// The little-endian representation is the persisted form, so a column of these ids is written to
/// and read from artifact files without conversion.
///
/// [`Dataset::ontology`]: crate::dataset::Dataset::ontology
#[derive(
    Debug,
    Copy,
    Clone,
    PartialOrd,
    Ord,
    serde::Serialize,
    serde::Deserialize,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
#[serde(into = "u64", from = "u64")]
pub struct OntologyRowId(U64<LE>);

impl OntologyRowId {
    /// Returns the row as an index into a column of length `bound`.
    ///
    /// [`None`] when the row lies at or beyond the bound, so a caller folds its domain check into
    /// the indexing step.
    #[inline]
    #[must_use]
    pub fn index_below(self, bound: usize) -> Option<usize> {
        usize::try_from(self.get()).ok().filter(|&row| row < bound)
    }
}

const impl Identity for OntologyRowId {
    #[inline]
    fn new(row: u64) -> Self {
        Self(U64::new(row))
    }

    #[inline]
    fn get(self) -> u64 {
        self.0.get()
    }
}

impl From<u64> for OntologyRowId {
    #[inline]
    fn from(row: u64) -> Self {
        Self::new(row)
    }
}

impl From<OntologyRowId> for u64 {
    #[inline]
    fn from(id: OntologyRowId) -> Self {
        id.get()
    }
}
