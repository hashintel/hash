//! The node row domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use hashql_core::id::Id as _;

hashql_core::id::newtype! {
    /// A reference to a node by its position in [`Dataset::nodes`].
    ///
    /// Rows are dense and zero-based: the value is the position of the referenced node in the stream.
    /// The little-endian representation is the persisted form, so a column of these ids is written to
    /// and read from artifact files without conversion.
    ///
    /// [`Dataset::nodes`]: crate::dataset::Dataset::nodes
    #[derive(
        serde::Serialize,
        serde::Deserialize,
    )]
    #[id(endian = little, unaligned, const)]
    #[serde(into = "u64", try_from = "u64")]
    pub struct NodeRowId(u64)
}

impl TryFrom<NodeRowId> for u32 {
    type Error = core::num::TryFromIntError;

    #[inline]
    fn try_from(id: NodeRowId) -> Result<Self, Self::Error> {
        Self::try_from(id.as_u64())
    }
}

impl From<NodeRowId> for u64 {
    #[inline]
    fn from(id: NodeRowId) -> Self {
        id.as_u64()
    }
}

impl From<NodeRowId> for usize {
    #[inline]
    fn from(id: NodeRowId) -> Self {
        id.as_usize()
    }
}
