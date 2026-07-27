//! The ontology type row domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use hashql_core::id::Id;

hashql_core::id::newtype! {
    /// A reference to a type by its position in [`Dataset::ontology`].
    ///
    /// Rows are dense and zero-based: the value is the position of the referenced type in the stream.
    /// The little-endian representation is the persisted form, so a column of these ids is written to
    /// and read from artifact files without conversion.
    ///
    /// [`Dataset::ontology`]: crate::dataset::Dataset::ontology
    #[derive(
        serde::Serialize,
        serde::Deserialize,
    )]
    #[id(endian = little, unaligned)]
    #[serde(into = "u64", try_from = "u64")]
    pub struct OntologyRowId(u64)
}

impl OntologyRowId {
    /// Returns the row as an index into a column of length `bound`.
    ///
    /// [`None`] when the row lies at or beyond the bound, so a caller folds its domain check into
    /// the indexing step.
    #[inline]
    #[must_use]
    pub fn index_below(self, bound: usize) -> Option<usize> {
        usize::try_from(self.as_u64())
            .ok()
            .filter(|&row| row < bound)
    }
}

impl From<OntologyRowId> for u64 {
    #[inline]
    fn from(id: OntologyRowId) -> Self {
        id.as_u64()
    }
}
