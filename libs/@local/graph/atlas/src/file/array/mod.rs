//! Raw scalar array files.
//!
//! Layout version 1 is mutable, so change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! An array file is a 4096-byte [`FileHeader`] followed by the array's elements, packed in
//! row-major order with nothing between them:
//!
//! ```text
//! | offset | size | field                                          |
//! |--------|------|------------------------------------------------|
//! | 0      | 8    | magic `SALTARRY`                               |
//! | 8      | 4    | layout version, `u32` = 1                      |
//! | 12     | 4    | machine information, [`Machine`]               |
//! | 16     | 1    | element variant, `u8`                          |
//! | 17     | 64   | shape, `[u64; 8]`                              |
//! | 81     | 4015 | padding; writers emit zero, readers ignore     |
//! | 4096   |      | data                                           |
//! ```
//!
//! # Byte order
//!
//! Element bytes are the writer's native byte order, and the header's machine information
//! ([`Machine`]) records the writer's architecture. The open refuses a file whose multi-byte
//! native elements use the other byte order, so every view a reader obtains is exact on its own
//! host. Variants that pin a byte order in the element type itself - [`ArrayVariant::U64Le`] -
//! are readable on every architecture and carry the pin in the view's type. The machine
//! information is a byte array, so it means the same bits on every host.
//!
//! The shape is the longest prefix of nonzero dimensions. The first zero terminates it, and the
//! parse ignores everything after. An empty shape (leading zero) is a zero-element array, and the
//! header is the whole file. No rank field and no invalid shape exist: every bit pattern means
//! something, so parsing a header never validates more than the magic, version, and variant. The
//! magic and the version are single-variant enums, and the variant is a closed enum of pinned
//! discriminants, so byte-level parsing fails for files this module does not speak.
//!
//! The open checks the format's single structural rule in full. The file length equals `4096 +
//! element count · element width` ([`FileHeader::expected_file_len`]). A shape whose element count
//! or byte length overflows `u64` matches no real file, and that same rule rejects it.
//!
//! # Mapping and alignment
//!
//! Map the whole file and slice the data at offset 4096, never at a nonzero file offset. A
//! whole-file mapping starts page-aligned on every supported target, every page size is a multiple
//! of 4096, and the data begins 4096 bytes in, so the data slice is 4096-byte aligned: aligned for
//! every scalar and SIMD width without further checks. This guarantee is a property of mapping. A
//! header read into an arbitrary heap buffer inherits only the buffer's alignment.
//!
//! The format has no checksums. Writing to a temporary path and renaming into place prevents a torn
//! write. Whoever names a file stores a strong hash beside it when corruption detection matters.
//!
//! [`ArrayFile`] opens a file under these rules and hands out typed views of its data.
//! [`ArrayWriter`] streams rows behind a reserved header for arrays whose leading dimension the
//! writer counts while streaming.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the fields are little endian, while the magic discriminant stores native endian, so \
              a cross-endian reader fails loudly at the magic instead of misreading fields"
)]

use core::fmt;

use zerocopy::{LE, U64, Unalign};

mod read;
#[cfg(test)]
mod tests;
mod write;

pub(crate) use self::{
    read::{ArrayFile, OpenArrayError},
    write::{ArrayWriter, ColumnScalar, SizedArrayWriter, SizedColumn},
};
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

// The single variant makes the derive validate the discriminant, so parsing admits exactly the
// pinned layout version.
/// A layout version this module implements.
///
/// Byte-level construction admits no other value. Increment this version on any layout change.
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
    V1 = 1,
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
    zerocopy::Unaligned,
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
    // The little-endian block mirrors the native block in order:
    // these variants carry their byte order in the element type and
    // read identically on every architecture.
    U8Le = 0x10,
    U16Le = 0x11,
    U32Le = 0x12,
    U64Le = 0x13,
    U128Le = 0x14,
    I8Le = 0x15,
    I16Le = 0x16,
    I32Le = 0x17,
    I64Le = 0x18,
    I128Le = 0x19,
    F16Le = 0x1A,
    BF16Le = 0x1B,
    F32Le = 0x1C,
    F64Le = 0x1D,
    F128Le = 0x1E,
}

impl ArrayVariant {
    /// Returns the element width in bytes.
    #[inline]
    #[must_use]
    pub(crate) const fn width(self) -> u64 {
        match self {
            Self::U8 | Self::I8 | Self::U8Le | Self::I8Le => 1,
            Self::U16
            | Self::I16
            | Self::F16
            | Self::BF16
            | Self::U16Le
            | Self::I16Le
            | Self::F16Le
            | Self::BF16Le => 2,
            Self::U32 | Self::I32 | Self::F32 | Self::U32Le | Self::I32Le | Self::F32Le => 4,
            Self::U64 | Self::I64 | Self::F64 | Self::U64Le | Self::I64Le | Self::F64Le => 8,
            Self::U128 | Self::I128 | Self::F128 | Self::U128Le | Self::I128Le | Self::F128Le => 16,
        }
    }

    /// Returns whether the variant pins its elements little-endian.
    pub(crate) const fn little_endian(self) -> bool {
        matches!(
            self,
            Self::U8Le
                | Self::U16Le
                | Self::U32Le
                | Self::U64Le
                | Self::U128Le
                | Self::I8Le
                | Self::I16Le
                | Self::I32Le
                | Self::I64Le
                | Self::I128Le
                | Self::F16Le
                | Self::BF16Le
                | Self::F32Le
                | Self::F64Le
                | Self::F128Le
        )
    }

    /// Returns whether the element bytes mean different values under different byte orders.
    ///
    /// Single-byte elements and variants that pin their byte order in the element type read
    /// identically everywhere. Every other variant is native to the architecture that wrote it.
    pub(crate) const fn byte_order_sensitive(self) -> bool {
        self.width() > 1 && !self.little_endian()
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

/// A scalar array shape, the longest prefix of nonzero dimensions.
///
/// The first zero dimension terminates the shape and the parse ignores everything after it, so
/// every bit pattern is a valid shape and nothing needs validation. An empty shape (a leading zero)
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
    /// Returns `None` when `dims` holds more than [`Self::MAX_RANK`] dimensions. `dims` may hold a
    /// zero dimension, which terminates the shape there.
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

/// The header of an array file.
///
/// The data follows at offset 4096, so a whole-file mapping yields a 4096-byte-aligned data slice.
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
    pub magic: Unalign<FileHeaderMagic>,
    pub version: Unalign<Version>,
    pub machine: Machine,
    pub variant: ArrayVariant,
    pub shape: ArrayShape,
}

header!(FileHeader, FileHeaderMagic, Version::V1);

impl FileHeader {
    /// Creates a header recording this host as the writer architecture.
    #[must_use]
    pub(crate) const fn new(variant: ArrayVariant, shape: ArrayShape) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V1),
            machine: Machine::current(),
            variant,
            shape,
        }
    }

    /// Returns the element variant.
    #[inline]
    #[must_use]
    pub(crate) const fn variant(&self) -> ArrayVariant {
        self.variant
    }

    /// Returns the architecture that wrote the file.
    #[inline]
    #[must_use]
    pub(crate) const fn architecture(&self) -> Architecture {
        self.machine.architecture()
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
    /// The open rejects a file whose length differs from this value, which is the format's single
    /// structural rule. Returns `None` on `u64` overflow, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        self.byte_length()?.checked_add(PAGE)
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
