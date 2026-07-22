//! Raw scalar array files.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what the pipeline needs and
//! increment [`Version`] when you do. The pinned parse rejects bytes of other versions, which is
//! the intended failure mode; no migration or compatibility machinery exists on purpose until the
//! format stabilizes.
//!
//! An array file is a 4096-byte [`FileHeader`] followed by the array's elements, packed
//! little-endian in row-major order with nothing between them:
//!
//! ```text
//! | offset | size | field                                          |
//! |--------|------|------------------------------------------------|
//! | 0      | 8    | magic `SALTARRY`                               |
//! | 8      | 4    | layout version, `u32` = 0                      |
//! | 12     | 1    | element variant, `u8`                          |
//! | 13     | 64   | shape, `[u64; 8]`                              |
//! | 77     | 4019 | padding; writers emit zero, readers ignore     |
//! | 4096   |      | data                                           |
//! ```
//!
//! The shape is the longest prefix of nonzero dimensions; the first zero terminates it and
//! everything after is ignored. An empty shape (leading zero) is a zero-element array, and the
//! header is the whole file. There is no rank field and no invalid shape: every bit pattern means
//! something, so parsing a header never validates more than the magic, version, and variant, which
//! are pinned single-variant enums that fail byte-level parsing for files this module does not
//! speak.
//!
//! The single structural rule lives where it can be checked totally: the file length equals `4096 +
//! element count * element width` ([`FileHeader::expected_file_len`]). A shape whose element count
//! or byte length overflows `u64` matches no real file and is rejected by that same rule.
//!
//! # Mapping and alignment
//!
//! Map the whole file and slice the data at [`FileHeader::SIZE`]; never map at a nonzero file
//! offset. A whole-file mapping starts page-aligned on every supported target, every page size is a
//! multiple of 4096, and the data begins 4096 bytes in, so the data slice is 4096-byte aligned:
//! aligned for every scalar and SIMD width without further checks. This guarantee is a property of
//! mapping; a header read into an arbitrary heap buffer is only as aligned as the buffer.
//!
//! There are no checksums. Torn writes are prevented by writing to a temporary path and renaming
//! into place; corruption detection, where wanted, is a strong hash stored beside the file by
//! whoever names it.
//!
//! [`ArrayFile`] opens a file under these rules and hands out typed views of its data;
//! [`ArrayWriter`] streams rows behind a reserved header for arrays whose leading dimension is
//! discovered by writing.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use zerocopy::{LE, U64, Unalign};

mod read;
#[cfg(test)]
mod tests;
mod write;

pub(crate) use self::{
    read::{ArrayFile, OpenArrayError},
    write::{ArrayWriter, SizedArrayWriter},
};

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
    Salt = u64::from_le_bytes(*b"SALTARRY"),
}

/// The `SALTARRY` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Salt);
}

// A single-variant enum: the derive validates the discriminant, so parsing admits exactly the
// pinned magic value.
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

/// The element type of an array file.
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
#[repr(u8)]
pub(crate) enum ArrayVariant {
    U8 = 0x01,
    U16 = 0x02,
    U32 = 0x03,
    U64 = 0x04,
    U128 = 0x05,
    I8 = 0x06,
    I16 = 0x07,
    I32 = 0x08,
    I64 = 0x09,
    I128 = 0x0A,
    F16 = 0x0B,
    BF16 = 0x0C,
    F32 = 0x0D,
    F64 = 0x0E,
    F128 = 0x0F,
}

impl ArrayVariant {
    /// Returns the element width in bytes.
    #[inline]
    #[must_use]
    pub(crate) const fn width(self) -> u64 {
        match self {
            Self::U8 | Self::I8 => 1,
            Self::U16 | Self::I16 | Self::F16 | Self::BF16 => 2,
            Self::U32 | Self::I32 | Self::F32 => 4,
            Self::U64 | Self::I64 | Self::F64 => 8,
            Self::U128 | Self::I128 | Self::F128 => 16,
        }
    }
}

/// One array dimension.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(transparent)]
pub(crate) struct Dim(U64<LE>);

impl Dim {
    /// The shape terminator.
    pub(crate) const ZERO: Self = Self(U64::ZERO);

    /// Creates a dimension.
    #[inline]
    #[must_use]
    pub(crate) const fn new(value: u64) -> Self {
        Self(U64::new(value))
    }

    /// Returns the dimension's extent.
    #[inline]
    #[must_use]
    pub(crate) const fn get(self) -> u64 {
        self.0.get()
    }
}

/// A scalar array shape: the longest prefix of nonzero dimensions.
///
/// The first zero dimension terminates the shape and everything after it is ignored, so every bit
/// pattern is a meaningful shape and there is nothing to validate. An empty shape (a leading zero)
/// is a zero-element array.
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::FromBytes,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::KnownLayout,
    zerocopy::Unaligned,
)]
#[repr(transparent)]
pub(crate) struct ArrayShape {
    pub dims: [Dim; Self::MAX_RANK],
}

impl ArrayShape {
    /// Maximum number of dimensions.
    pub(crate) const MAX_RANK: usize = 8;

    /// Creates a shape from its dimensions.
    ///
    /// Returns `None` when `dims` holds more than [`Self::MAX_RANK`] dimensions. A zero dimension
    /// is allowed; it terminates the shape there.
    #[must_use]
    pub(crate) const fn new(dims: &[Dim]) -> Option<Self> {
        if dims.len() > Self::MAX_RANK {
            return None;
        }

        let mut padded = [Dim::ZERO; Self::MAX_RANK];
        padded[..dims.len()].copy_from_slice(dims);

        Some(Self { dims: padded })
    }

    /// Borrows the dimensions: the longest nonzero prefix.
    #[must_use]
    pub(crate) fn dims(&self) -> &[Dim] {
        let rank = self
            .dims
            .iter()
            .position(|dim| dim.get() == 0)
            .unwrap_or(Self::MAX_RANK);

        &self.dims[..rank]
    }

    /// Returns the number of elements.
    ///
    /// The empty shape has zero elements; a shape whose product overflows `u64` returns `None` and
    /// matches no real file.
    #[must_use]
    pub(crate) fn element_count(&self) -> Option<u64> {
        let dims = self.dims();
        if dims.is_empty() {
            return Some(0);
        }

        dims.iter()
            .try_fold(1_u64, |count, dim| count.checked_mul(dim.get()))
    }
}

/// The 4096-byte header of an array file.
///
/// The data follows at offset [`Self::SIZE`], so a whole-file mapping yields a 4096-byte-aligned
/// data slice.
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
    pub magic: Unalign<FileHeaderMagic>,
    pub version: Unalign<Version>,
    pub variant: ArrayVariant,
    pub shape: ArrayShape,
    pub padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4019;
    /// Size of the header, and the offset of the data.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header.
    #[must_use]
    pub(crate) const fn new(variant: ArrayVariant, shape: ArrayShape) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            variant,
            shape,
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the element variant.
    #[inline]
    #[must_use]
    pub(crate) const fn variant(&self) -> ArrayVariant {
        self.variant
    }

    /// Borrows the shape.
    #[inline]
    #[must_use]
    pub(crate) const fn shape(&self) -> &ArrayShape {
        &self.shape
    }

    /// Returns the data length in bytes.
    ///
    /// Returns `None` on `u64` overflow, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn byte_length(&self) -> Option<u64> {
        self.shape
            .element_count()?
            .checked_mul(self.variant.width())
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected: it is the format's single
    /// structural rule. Returns `None` on `u64` overflow, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        self.byte_length()?.checked_add(Self::SIZE as u64)
    }
}

// Manual impl instead of a derive: `Unalign`'s `Debug` goes through
// `Deref` and would demand `Unaligned` of the pinned enums; `get` only
// needs `Copy`. No equality on purpose: header equality is ambiguous
// (bytes? semantics? padding?), so callers compare the observable they
// mean.
impl fmt::Debug for FileHeader {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("FileHeader")
            .field("magic", &self.magic.get())
            .field("version", &self.version.get())
            .field("variant", &self.variant)
            .field("shape", &self.shape)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);
