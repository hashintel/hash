//! The policy file: the resolved geometry policy table.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what the pipeline needs and
//! increment [`Version`] when you do. The pinned parse rejects bytes of other versions, which is
//! the intended failure mode; no migration or compatibility machinery exists on purpose until the
//! format stabilizes.
//!
//! One region of fixed-width records behind the pinned header:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTPLCY`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 4    | padding; writers emit zero, readers ignore      |
//! | 16     | 8    | policy count `P`, `u64`                         |
//! | 24     | 4072 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | policies: `PolicyRow[P]`, ascending by relation |
//! ```
//!
//! Each 32-byte [`PolicyRow`] resolves one relation type: the relation's ontology row, the
//! effective attraction and selected class distributions (Coincident and Proximal components;
//! Overlay is the remainder), the calibrated applicability, and the strength multiplier. The file
//! length is `4096 + 32 * P` with checked arithmetic ([`FileHeader::expected_file_len`]); a header
//! whose geometry overflows matches no real file. The region starts on a 4096-byte boundary, so the
//! whole-file-mapping alignment guarantee of the array format applies unchanged: map the whole file
//! and slice, never mmap at a file offset.
//!
//! [`read::PolicyFile`] opens a file under these rules and hands out the raw typed rows;
//! [`write::write_rows`] streams them into place. The format owns geometry alone - the table's
//! domain invariants (strictly ascending relations, probabilities and applicability in `[0, 1]`,
//! finite nonnegative strength) are `salt::policy`'s artifact contract, validated where the domain
//! types live.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{F32, LE, U32, U64, Unalign};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

// A single-variant enum: the derive validates the discriminant, so parsing admits exactly the
// pinned magic value.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(u64)]
enum FileHeaderMagicInner {
    Policy = u64::from_le_bytes(*b"SALTPLCY"),
}

/// The `SALTPLCY` magic. Byte-level construction admits no other value.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct FileHeaderMagic(FileHeaderMagicInner);

impl FileHeaderMagic {
    /// The only value.
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Policy);
}

/// A layout version this module implements.
///
/// Byte-level construction admits no other value; increment on any layout change.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(u32)]
pub(crate) enum Version {
    V0 = 0,
}

/// One resolved relation policy in wire form.
///
/// Any byte pattern parses at this layer; the domain ranges are the typed layer's contract.
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
#[repr(C)]
pub(crate) struct PolicyRow {
    /// The relation type's ontology row.
    pub relation: U64<LE>,
    /// Effective attraction Coincident probability.
    pub attraction_coincident: F32<LE>,
    /// Effective attraction Proximal probability.
    pub attraction_proximal: F32<LE>,
    /// Selected Coincident probability.
    pub selected_coincident: F32<LE>,
    /// Selected Proximal probability.
    pub selected_proximal: F32<LE>,
    /// Calibrated applicability.
    pub applicability: F32<LE>,
    /// Strength multiplier.
    pub strength: F32<LE>,
}

const _: () = assert!(size_of::<PolicyRow>() == 32);

/// The 4096-byte header of a policy file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    /// Alignment filler so the count sits on a natural boundary.
    reserved: U32<LE>,
    policies: U64<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4072;
    /// Size of the header, and the offset of the policies region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for `policies` resolved relations.
    #[must_use]
    pub(crate) const fn new(policies: u64) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            reserved: U32::new(0),
            policies: U64::new(policies),
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the policy count `P`.
    #[inline]
    #[must_use]
    pub(crate) const fn policies(&self) -> u64 {
        self.policies.get()
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns `None` when the geometry
    /// overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let row_bytes = self.policies().checked_mul(size_of::<PolicyRow>() as u64)?;
        (Self::SIZE as u64).checked_add(row_bytes)
    }
}

// Manual impl instead of a derive: `Unalign`'s `Debug` goes through
// `Deref` and would demand `Unaligned` of the pinned enums; `get` only
// needs `Copy`. No equality on purpose: callers compare the observable
// they mean.
impl fmt::Debug for FileHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("FileHeader")
            .field("magic", &self.magic.get())
            .field("version", &self.version.get())
            .field("policies", &self.policies)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);
