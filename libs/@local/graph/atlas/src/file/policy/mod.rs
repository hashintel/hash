//! The resolved geometry policy table.
//!
//! Layout version 2 is **mutable**: change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! One region of fixed-width records behind the pinned header:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTPLCY`                                |
//! | 8      | 4    | layout version, `u32` = 2                       |
//! | 12     | 4    | machine information, [`Machine`]                |
//! | 16     | 8    | policy count `P`, `u64`                         |
//! | 24     | 4072 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | policies: `PolicyRow[P]`, ascending by relation |
//! ```
//!
//! Each 56-byte [`PolicyRow`] resolves one relation type: the relation's ontology row, the
//! effective attraction and selected class distributions (Coincident and Proximal components;
//! Overlay is the remainder), the calibrated applicability, and the strength multiplier. The rows
//! store native byte order so the typed layer serves them borrowed straight from the mapping; the
//! header's [`Machine`] word records which order that is, and opening refuses a mismatch, so a
//! cross-endian file fails by name instead of being reinterpreted. The file length is
//! `4096 + 56 · P` with checked arithmetic ([`FileHeader::expected_file_len`]); a header whose
//! geometry overflows matches no real file. The region starts on a 4096-byte boundary, so the
//! whole-file-mapping alignment guarantee of the array format applies unchanged. Map the whole
//! file and slice, never mmap at a file offset.
//!
//! [`read::PolicyFile`] opens a file under these rules and hands out the raw typed rows;
//! [`write::write_rows`] streams them into place. The format owns geometry alone - the table's
//! domain invariants (strictly ascending relations, probabilities and applicability in `[0, 1]`,
//! finite nonnegative strength) are `salt::policy`'s artifact contract, validated where the domain
//! types live.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the fields are little endian, while the magic discriminant stores native endian, so \
              a cross-endian reader fails loudly at the magic instead of misreading fields"
)]

use core::fmt;

use zerocopy::{LE, U64, Unalign};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

use super::region::machine::{Architecture, Machine};
use crate::file::region::{PAGE, header::header};

// The single variant makes the derive validate the discriminant, so parsing admits exactly the
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
/// Byte-level construction admits no other value. Increment it on any layout change.
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
    V2 = 2,
}

/// One resolved relation policy in wire form.
///
/// Any byte pattern parses at this layer. The domain ranges are the typed layer's contract. The
/// fields are native byte order under the header's verified [`Machine`] word, which is what
/// lets the typed layer cast the mapped region in place instead of decoding it.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct PolicyRow {
    /// The relation type's ontology row.
    pub relation: u64,
    /// Effective attraction Coincident probability.
    pub attraction_coincident: f64,
    /// Effective attraction Proximal probability.
    pub attraction_proximal: f64,
    /// Selected Coincident probability.
    pub selected_coincident: f64,
    /// Selected Proximal probability.
    pub selected_proximal: f64,
    /// Calibrated applicability.
    pub applicability: f64,
    /// Strength multiplier.
    pub strength: f32,
    /// Layout filler pinning the tail padding; writers emit zero, readers ignore.
    pub reserved: [u8; 4],
}

const _: () = assert!(size_of::<PolicyRow>() == 56);

/// The header of a policy file.
#[derive(
    Copy,
    Clone,
    zerocopy::TryFromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(C)]
pub(crate) struct FileHeader {
    magic: Unalign<FileHeaderMagic>,
    version: Unalign<Version>,
    machine: Machine,
    policies: U64<LE>,
}

header!(FileHeader, FileHeaderMagic, Version::V2);

impl FileHeader {
    /// Creates a header for `policies` resolved relations.
    #[must_use]
    pub(crate) const fn new(policies: u64) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V2),
            machine: Machine::current(),
            policies: U64::new(policies),
        }
    }

    /// Returns the row region's byte order.
    #[inline]
    #[must_use]
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "the mapped policy-table re-read is the designed reader, not yet implemented"
        )
    )]
    pub(crate) const fn architecture(&self) -> Architecture {
        self.machine.architecture()
    }

    /// Returns the policy count `P`.
    #[inline]
    #[must_use]
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "the mapped policy-table re-read is the designed reader, not yet implemented"
        )
    )]
    pub(crate) const fn policies(&self) -> u64 {
        self.policies.get()
    }

    /// Returns the exact file length the header describes.
    ///
    /// Opening rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "the mapped policy-table re-read is the designed reader, not yet implemented"
        )
    )]
    pub(crate) const fn expected_file_len(&self) -> Option<u64> {
        let row_bytes = self.policies().checked_mul(size_of::<PolicyRow>() as u64)?;
        PAGE.checked_add(row_bytes)
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
            .field("machine", &self.machine)
            .field("policies", &self.policies)
            .finish_non_exhaustive()
    }
}
