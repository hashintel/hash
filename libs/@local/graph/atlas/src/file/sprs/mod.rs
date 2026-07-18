//! The sparse matrix file: one compressed-sparse-row matrix, mappable.
//!
//! Layout version 0 is **mutable**: change the layout freely to fit what
//! the pipeline needs and increment [`Version`] when you do. The pinned
//! parse rejects bytes of other versions, which is the intended failure
//! mode; no migration or compatibility machinery exists on purpose until
//! the format stabilizes.
//!
//! This is a combined file: a CSR matrix is three columns - row
//! pointers, column indices, values - derived together, meaningless
//! apart, and always read together, so all three live in one file and
//! cannot fall out of sync. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTSPRS`                                |
//! | 8      | 4    | layout version, `u32` = 0                       |
//! | 12     | 1    | value element type, [`ArrayVariant`]            |
//! | 13     | 1    | index element type, [`IndexVariant`]            |
//! | 14     | 1    | row-pointer element type, [`IndexVariant`]      |
//! | 15     | 64   | shape, [`ArrayShape`]: `[rows, columns]`        |
//! | 79     | 8    | stored entries `nnz`, `u64`                     |
//! | 87     | 4009 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | row pointers: `iptr[rows + 1]`, ascending from  |
//! |        |      | zero to `nnz`;                                  |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | column indices: `index[nnz]`, strictly          |
//! |        |      | ascending within each row;                      |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | values: `value[nnz]`, entry-aligned with the    |
//! |        |      | column indices                                  |
//! ```
//!
//! The element types describe the regions exactly; [`read::SprsFile`]'s
//! typed accessor exists only for the described combination, so a file
//! is never read at the wrong width. The shape is a rank-2
//! [`ArrayShape`]: a shape of any other rank has no region geometry and
//! matches no real file, so a matrix with zero rows or columns is
//! unrepresentable on purpose. All region offsets derive from the
//! header fields with checked arithmetic
//! ([`FileHeader::expected_file_len`]); a header whose geometry
//! overflows matches no real file. Every region starts on a 4096-byte
//! boundary, so the whole-file-mapping alignment guarantee of the array
//! format applies unchanged: map the whole file and slice, never mmap
//! at a file offset.
//!
//! [`read::SprsFile`] opens a file under these rules;
//! [`write::write_matrix`] streams a borrowed
//! [`CsMatBase`](sprs::CsMatBase) into them. Reader and writer speak
//! the same matrix types, so a written matrix reopens as the view it
//! was written from.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the magic is pinned to the same canonical little-endian bytes on every platform"
)]

use core::fmt;

use sprs::SpIndex;
use zerocopy::{FromBytes, Immutable, IntoBytes, LE, U64, Unalign};

use super::array::{ArrayShape, ArrayVariant, Dim};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

/// Size of one page-aligned region unit, and of the header.
const PAGE: u64 = FileHeader::SIZE as u64;

// not pretty, but allows us to pin a specific version, required for the derive
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
    Sprs = u64::from_le_bytes(*b"SALTSPRS"),
}

/// The `SALTSPRS` magic. Byte-level construction admits no other value.
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
    pub(crate) const MAGIC: Self = Self(FileHeaderMagicInner::Sprs);
}

/// A layout version this module implements. Byte-level construction
/// admits no other value; increment on any layout change.
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

/// The element type of an index region.
///
/// This is the fixed-width intersection of what a file can store and
/// what [`sprs::SpIndex`] implements: the signed and unsigned widths
/// from 16 to 64 bits. Eight-bit types are not indices to `sprs`, and
/// the target-width `usize`/`isize` have no on-disk form; a matrix
/// held in target-width indices persists through a fixed-width type.
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
pub(crate) enum IndexVariant {
    U16 = 0x00,
    U32 = 0x01,
    U64 = 0x02,
    I16 = 0x03,
    I32 = 0x04,
    I64 = 0x05,
}

impl IndexVariant {
    /// Returns the element width in bytes.
    #[inline]
    #[must_use]
    pub(crate) const fn width(self) -> u64 {
        match self {
            Self::U16 | Self::I16 => 2,
            Self::U32 | Self::I32 => 4,
            Self::U64 | Self::I64 => 8,
        }
    }
}

/// A scalar type a value region stores.
///
/// The variant is the type's wire identity: a value region reads back
/// as `N` exactly when the header records `N::VARIANT`.
pub(crate) trait SprsValue: FromBytes + IntoBytes + Immutable + Copy {
    /// The wire identity of `Self`.
    const VARIANT: ArrayVariant;
}

/// A scalar type an index region stores.
///
/// The variant is the type's wire identity: an index region reads back
/// as `I` exactly when the header records `I::VARIANT`. Every
/// implementor is an [`SpIndex`], so a mapped region drives sparse
/// algorithms directly.
pub(crate) trait SprsIndex: SpIndex + FromBytes + IntoBytes + Immutable {
    /// The wire identity of `Self`.
    const VARIANT: IndexVariant;
}

// One-line impls over every fixed-width scalar: enough expansions that
// drift between hand-written copies is the likelier bug.
macro_rules! sprs_value {
    ($($element:ty => $variant:ident,)*) => {
        $(impl SprsValue for $element {
            const VARIANT: ArrayVariant = ArrayVariant::$variant;
        })*
    };
}

macro_rules! sprs_index {
    ($($element:ty => $variant:ident,)*) => {
        $(impl SprsIndex for $element {
            const VARIANT: IndexVariant = IndexVariant::$variant;
        })*
    };
}

sprs_value! {
    u8 => U8,
    u16 => U16,
    u32 => U32,
    u64 => U64,
    u128 => U128,
    i8 => I8,
    i16 => I16,
    i32 => I32,
    i64 => I64,
    i128 => I128,
    f32 => F32,
    f64 => F64,
}

sprs_index! {
    u16 => U16,
    u32 => U32,
    u64 => U64,
    i16 => I16,
    i32 => I32,
    i64 => I64,
}

/// The 4096-byte header of a sparse matrix file.
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
    value: ArrayVariant,
    index: IndexVariant,
    iptr: IndexVariant,
    shape: ArrayShape,
    nnz: U64<LE>,
    padding: [u8; Self::PADDING],
}

impl FileHeader {
    const PADDING: usize = 4009;
    /// Size of the header, and the offset of the row-pointer region.
    pub(crate) const SIZE: usize = 4096;

    /// Creates a header for an `nnz`-entry matrix shaped `[rows,
    /// columns]` with the given element types.
    #[must_use]
    pub(crate) const fn new(
        value: ArrayVariant,
        index: IndexVariant,
        iptr: IndexVariant,
        shape: ArrayShape,
        nnz: u64,
    ) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V0),
            value,
            index,
            iptr,
            shape,
            nnz: U64::new(nnz),
            padding: [0; Self::PADDING],
        }
    }

    /// Returns the value element type.
    #[inline]
    #[must_use]
    pub(crate) const fn value(&self) -> ArrayVariant {
        self.value
    }

    /// Returns the column-index element type.
    #[inline]
    #[must_use]
    pub(crate) const fn index(&self) -> IndexVariant {
        self.index
    }

    /// Returns the row-pointer element type.
    #[inline]
    #[must_use]
    pub(crate) const fn iptr(&self) -> IndexVariant {
        self.iptr
    }

    /// Returns the number of stored entries.
    #[inline]
    #[must_use]
    pub(crate) const fn nnz(&self) -> u64 {
        self.nnz.get()
    }

    /// Returns the `(rows, columns)` shape.
    ///
    /// Returns `None` unless the shape has rank 2, in which case no
    /// real file matches the header.
    #[must_use]
    pub(crate) fn matrix_shape(&self) -> Option<(u64, u64)> {
        match *self.shape.dims() {
            [rows, columns] => Some((rows.get(), columns.get())),
            _ => None,
        }
    }

    /// Returns the offset of the column-index region.
    ///
    /// The row-pointer region sits between the header and this offset,
    /// zero padded to the boundary. Returns `None` when the geometry
    /// overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn indices_offset(&self) -> Option<u64> {
        let (rows, _) = self.matrix_shape()?;
        let iptr_bytes = rows.checked_add(1)?.checked_mul(self.iptr.width())?;
        PAGE.checked_add(iptr_bytes.checked_next_multiple_of(PAGE)?)
    }

    /// Returns the offset of the value region.
    ///
    /// The column-index region sits between the previous offset and
    /// this one, zero padded to the boundary. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches
    /// the header.
    #[must_use]
    pub(crate) fn values_offset(&self) -> Option<u64> {
        let index_bytes = self.nnz.get().checked_mul(self.index.width())?;
        self.indices_offset()?
            .checked_add(index_bytes.checked_next_multiple_of(PAGE)?)
    }

    /// Returns the exact file length the header describes.
    ///
    /// A file whose length differs from this value is rejected. Returns
    /// `None` when the geometry overflows `u64`, in which case no real
    /// file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let value_bytes = self.nnz.get().checked_mul(self.value.width())?;
        self.values_offset()?.checked_add(value_bytes)
    }
}

// Manual impl instead of a derive: `Unalign`'s `Debug` goes through
// `Deref` and would demand `Unaligned` of the pinned enums; `get` only
// needs `Copy`. No equality on purpose: callers compare the observable
// they mean.
impl fmt::Debug for FileHeader {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("FileHeader")
            .field("magic", &self.magic.get())
            .field("version", &self.version.get())
            .field("value", &self.value)
            .field("index", &self.index)
            .field("iptr", &self.iptr)
            .field("shape", &self.shape)
            .field("nnz", &self.nnz)
            .finish_non_exhaustive()
    }
}

const _: () = assert!(size_of::<FileHeader>() == FileHeader::SIZE);
