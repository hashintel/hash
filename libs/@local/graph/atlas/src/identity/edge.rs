//! The edge row domain.

#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

use zerocopy::{LE, U64};

use super::Identity;

/// A reference to an edge by its position in [`Dataset::edges`].
///
/// Rows are dense and zero-based: the value is the position of the referenced edge in the stream.
/// The little-endian representation is the persisted form, so a column of these ids is written to
/// and read from artifact files without conversion.
///
/// [`Dataset::edges`]: crate::dataset::Dataset::edges
#[derive(
    Debug,
    Copy,
    Clone,
    PartialOrd,
    Ord,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub struct EdgeRowId(U64<LE>);

const impl Identity for EdgeRowId {
    #[inline]
    fn new(row: u64) -> Self {
        Self(U64::new(row))
    }

    #[inline]
    fn get(self) -> u64 {
        self.0.get()
    }
}

impl From<u64> for EdgeRowId {
    #[inline]
    fn from(row: u64) -> Self {
        Self::new(row)
    }
}

impl From<EdgeRowId> for u64 {
    #[inline]
    fn from(id: EdgeRowId) -> Self {
        id.get()
    }
}
