//! The node row domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use zerocopy::{LE, U64};

use super::Identity;

/// A reference to a node by its position in [`Dataset::nodes`].
///
/// Rows are dense and zero-based: the value is the position of the referenced node in the stream.
/// The little-endian representation is the persisted form, so a column of these ids is written to
/// and read from artifact files without conversion.
///
/// [`Dataset::nodes`]: crate::dataset::Dataset::nodes
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
pub struct NodeRowId(U64<LE>);

impl NodeRowId {
    /// Returns the row as a compact 32-bit row reference.
    #[expect(
        clippy::cast_possible_truncation,
        reason = "the serving universes are validated to fit `u32` at open"
    )]
    #[inline]
    #[must_use]
    pub const fn u32(self) -> u32 {
        self.get() as u32
    }
}

const impl Identity for NodeRowId {
    #[inline]
    fn new(row: u64) -> Self {
        Self(U64::new(row))
    }

    #[inline]
    fn get(self) -> u64 {
        self.0.get()
    }
}

impl From<u64> for NodeRowId {
    #[inline]
    fn from(row: u64) -> Self {
        Self::new(row)
    }
}

impl From<u32> for NodeRowId {
    #[inline]
    fn from(row: u32) -> Self {
        Self::from(u64::from(row))
    }
}

impl TryFrom<NodeRowId> for u32 {
    type Error = core::num::TryFromIntError;

    #[inline]
    fn try_from(id: NodeRowId) -> Result<Self, Self::Error> {
        Self::try_from(id.get())
    }
}

impl From<NodeRowId> for u64 {
    #[inline]
    fn from(id: NodeRowId) -> Self {
        id.get()
    }
}

impl From<NodeRowId> for usize {
    #[inline]
    fn from(id: NodeRowId) -> Self {
        id.usize()
    }
}
