//! The edge row domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use hashql_core::id::Id;

hashql_core::id::newtype! {
    /// A reference to an edge by its position in [`Dataset::edges`].
    ///
    /// Rows are dense and zero-based: the value is the position of the referenced edge in the stream.
    /// The little-endian representation is the persisted form, so a column of these ids is written to
    /// and read from artifact files without conversion.
    ///
    /// [`Dataset::edges`]: crate::dataset::Dataset::edges
    #[id(endian = little, unaligned)]
    pub struct EdgeRowId(u64)
}

impl From<EdgeRowId> for u64 {
    #[inline]
    fn from(id: EdgeRowId) -> Self {
        id.as_u64()
    }
}
