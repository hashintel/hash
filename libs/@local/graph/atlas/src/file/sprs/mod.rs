//! The sparse matrix file, one mappable compressed-sparse-row matrix.
//!
//! Layout version 1 is **mutable**: change the layout to fit what the pipeline needs and increment
//! [`Version`] when you do. The pinned parse rejects bytes of every other version, which is the
//! intended failure mode. A fresh generation replaces the files a layout change strands.
//!
//! This is a combined file: a compressed sparse matrix is three columns (pointers, indices, values)
//! derived together, meaningless apart, and always read together, so all three live in one file and
//! cannot fall out of sync. The regions:
//!
//! ```text
//! | offset | size | region                                          |
//! |--------|------|-------------------------------------------------|
//! | 0      | 8    | magic `SALTSPRS`                                |
//! | 8      | 4    | layout version, `u32` = 1                       |
//! | 12     | 1    | value type tag, [`ValueTag`]                    |
//! | 13     | 1    | index element type, [`IndexVariant`]            |
//! | 14     | 1    | pointer element type, [`IndexVariant`]          |
//! | 15     | 1    | compressed dimension, [`StorageVariant`]        |
//! | 16     | 8    | value entry width in bytes, `u64`               |
//! | 24     | 64   | shape, [`ArrayShape`]: `[rows, columns]`        |
//! | 88     | 8    | stored entries `nnz`, `u64`                     |
//! | 96     | 4000 | padding; writers emit zero, readers ignore      |
//! | 4096   |      | pointers: `iptr[outer + 1]`, ascending from     |
//! |        |      | zero to `nnz`, where `outer` is the compressed  |
//! |        |      | dimension's extent (rows for [`Csr`], columns   |
//! |        |      | for [`Csc`]);                                   |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | indices: `index[nnz]`, strictly ascending       |
//! |        |      | within each pointer range;                      |
//! |        |      | zero padding to the next 4096-byte boundary     |
//! | ...    |      | values: `value[nnz]`, entry-aligned with the    |
//! |        |      | indices                                         |
//! ```
//!
//! [`Csr`]: StorageVariant::Csr
//! [`Csc`]: StorageVariant::Csc
//!
//! The element types describe the regions exactly, and value geometry derives from the recorded
//! width. [`read::SprsFile`]'s typed accessor exists only for the described combination, where the
//! tag, the width, and the index types all match, so nothing reads a region at the wrong width. The
//! shape is a rank-2 [`ArrayShape`]. A shape of any other rank has no region geometry and matches
//! no real file, so a matrix with zero rows or columns is unrepresentable on purpose. All region
//! offsets derive from the header fields with checked arithmetic
//! ([`FileHeader::expected_file_len`]). A header whose geometry overflows matches no real file.
//! Every region starts on a 4096-byte boundary, so the whole-file-mapping alignment guarantee of
//! the array format applies unchanged. Map the whole file and slice it, never mmap at a file
//! offset.
//!
//! [`read::SprsFile`] opens a file under these rules. [`write::write_matrix`] streams a borrowed
//! [`CsMatBase`](sprs::CsMatBase) into them. Reader and writer speak the same matrix types, so
//! reopening a written matrix yields the view it came from.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]
#![expect(
    clippy::little_endian_bytes,
    reason = "the fields are little endian, while the magic discriminant stores native endian, so \
              a cross-endian reader fails loudly at the magic instead of misreading fields"
)]

use core::fmt;

use sprs::{CompressedStorage, SpIndex};
use zerocopy::{FromBytes, Immutable, IntoBytes, KnownLayout, LE, U64, Unalign};

use super::array::{ArrayShape, ArrayVariant, Dim};

pub(crate) mod read;
#[cfg(test)]
mod tests;
pub(crate) mod write;

use crate::file::region::{PAGE, header::header, padded_size};

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

/// A layout version this module implements.
///
/// Byte-level construction admits no other value. Increment on any layout change.
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

/// The element type of an index region.
///
/// This is the fixed-width intersection of what a file can store and what [`sprs::SpIndex`]
/// implements: the signed and unsigned widths from 16 to 64 bits. Eight-bit types are not indices
/// to `sprs`, and the target-width `usize`/`isize` have no on-disk form; a matrix held in
/// target-width indices persists through a fixed-width type.
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
pub enum IndexVariant {
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

/// The type tag of a value region.
///
/// A value entry's recorded geometry is its byte width. The tag is the identity layered on top. The
/// scalar tags pin an exact type, so an `f32` region never reads back as `u32`.
/// [`Opaque`](Self::Opaque) records no identity beyond the width. Any two opaque types of one width
/// are interchangeable on the wire, and a type carries that tag exactly when it opts into being so.
/// The scalar discriminants mirror [`ArrayVariant`], so the two formats speak one scalar
/// vocabulary.
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
pub enum ValueTag {
    Opaque = 0x00,
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
    /// The zero-width unit, with an empty value region and `()` for every entry.
    ///
    /// The tag of structure-only matrices, whose payload is the compressed pattern alone.
    Unit = 0x10,
}

impl ValueTag {
    /// Returns the width a scalar tag pins, in bytes.
    ///
    /// [`Opaque`](Self::Opaque) pins no width, so the header's recorded width alone describes its
    /// types.
    #[inline]
    #[must_use]
    pub(crate) const fn width(self) -> Option<u64> {
        match self {
            Self::Opaque => None,
            Self::Unit => Some(0),
            Self::U8 | Self::I8 => Some(1),
            Self::U16 | Self::I16 | Self::F16 | Self::BF16 => Some(2),
            Self::U32 | Self::I32 | Self::F32 => Some(4),
            Self::U64 | Self::I64 | Self::F64 => Some(8),
            Self::U128 | Self::I128 | Self::F128 => Some(16),
        }
    }
}

/// A type a value region stores.
///
/// A value's recorded geometry is `size_of::<Self>()`, written into the header and re-checked
/// against the viewing type, so a region is never sliced or reinterpreted at a width other than the
/// type's own. The [`ValueTag`] is the identity on top of the width. Scalar tags pin the exact
/// type, while width alone identifies [`ValueTag::Opaque`] types, which accept that any equal-width
/// opaque type reads the same region.
// Safe on purpose: both region geometry and byte reinterpretation
// derive from size_of::<Self>() at write and view time alike, so no
// impl-provided width exists to lie about. The compile-time asserts
// below keep the scalar tags' pinned widths honest.
pub(crate) trait SprsValue: FromBytes + IntoBytes + Immutable + KnownLayout + Copy {
    /// The wire identity of `Self` beyond its width.
    const TAG: ValueTag;

    /// Views a value region as its elements.
    ///
    /// `bytes` holds exactly `entries * size_of::<Self>()` bytes on a 4096-byte boundary - the
    /// format's region guarantee. The unit type overrides the byte-reinterpreting default: no value
    /// bytes exist for it, so its elements materialize at the entry count alone.
    fn view_region(bytes: &[u8], entries: usize) -> &[Self] {
        let _: usize = entries;
        <[Self]>::ref_from_bytes(bytes)
            .expect("the region length and alignment are the format's guarantee")
    }
}

/// A scalar type an index region stores.
///
/// The variant is the type's wire identity. An index region reads back as `I` exactly when the
/// header records `I::VARIANT`. Every implementor is an [`SpIndex`], so a mapped region drives
/// sparse algorithms directly.
///
/// `VARIANT.width()` must equal `size_of::<Self>()`: region geometry and byte reinterpretation both
/// derive from the variant's width.
// The trait is safe to implement because the width contract guards correctness rather than
// memory soundness: every region carve re-validates its bytes through a checked cast, so a
// lying `VARIANT` cannot invalidate one.
pub(crate) trait SprsIndex: SpIndex + FromBytes + IntoBytes + Immutable {
    /// The wire identity of `Self`.
    const VARIANT: IndexVariant;
}

// One-line impls over every fixed-width scalar: enough expansions that
// drift between hand-written copies is the likelier bug. The assert
// keeps each scalar tag's pinned width equal to the type's real width.
macro_rules! sprs_value {
    ($($element:ty => $variant:ident,)*) => {
        $(
            const _: () = assert!(
                ValueTag::$variant.width().unwrap() == size_of::<$element>() as u64
            );

            impl SprsValue for $element {
                const TAG: ValueTag = ValueTag::$variant;
            }
        )*
    };
}

macro_rules! sprs_index {
    ($($element:ty => $variant:ident,)*) => {
        $(
            const _: () =
                assert!(IndexVariant::$variant.width() == size_of::<$element>() as u64);

            impl SprsIndex for $element {
                const VARIANT: IndexVariant = IndexVariant::$variant;
            }
        )*
    };
}

const _: () = assert!(ValueTag::Unit.width().unwrap() == size_of::<()>() as u64);

impl SprsValue for () {
    const TAG: ValueTag = ValueTag::Unit;

    fn view_region(_bytes: &[u8], entries: usize) -> &[Self] {
        // SAFETY: `()` is zero-sized, so the slice covers no bytes: `NonNull::dangling` is non-null
        // and aligned, zero bytes are valid for reads at any address, and no element count of a
        // zero-sized type overflows `isize` in bytes. Every value of the unit type is trivially
        // initialized and valid.
        unsafe { core::slice::from_raw_parts(core::ptr::NonNull::dangling().as_ptr(), entries) }
    }
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

// The scalar tags mirror ArrayVariant's discriminants, so the two formats speak one scalar
// vocabulary. The asserts below keep the two sets of discriminants equal.
macro_rules! tag_mirrors_variant {
    ($($variant:ident,)*) => {
        const _: () = {
            $(assert!(ValueTag::$variant as u8 == ArrayVariant::$variant as u8);)*
        };
    };
}

tag_mirrors_variant! {
    U8, U16, U32, U64, U128, I8, I16, I32, I64, I128, F16, BF16, F32, F64, F128,
}

/// The compressed dimension of the stored matrix.
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
pub(crate) enum StorageVariant {
    /// Row-compressed: the pointer region spans the rows.
    Csr = 0x00,
    /// Column-compressed: the pointer region spans the columns.
    Csc = 0x01,
}

impl From<CompressedStorage> for StorageVariant {
    #[inline]
    fn from(storage: CompressedStorage) -> Self {
        match storage {
            CompressedStorage::CSR => Self::Csr,
            CompressedStorage::CSC => Self::Csc,
        }
    }
}

/// The header of a sparse matrix file.
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
    value: ValueTag,
    index: IndexVariant,
    iptr: IndexVariant,
    order: StorageVariant,
    value_width: U64<LE>,
    shape: ArrayShape,
    nnz: U64<LE>,
}

header!(FileHeader);

impl FileHeader {
    /// Creates a matrix header from its full geometry.
    ///
    /// An `nnz`-entry matrix shaped `[rows, columns]`, with the given element types and compressed
    /// dimension.
    #[must_use]
    pub(crate) const fn new(
        value: ValueTag,
        value_width: u64,
        index: IndexVariant,
        iptr: IndexVariant,
        order: StorageVariant,
        shape: ArrayShape,
        nnz: u64,
    ) -> Self {
        Self {
            magic: Unalign::new(FileHeaderMagic::MAGIC),
            version: Unalign::new(Version::V1),
            value,
            index,
            iptr,
            order,
            value_width: U64::new(value_width),
            shape,
            nnz: U64::new(nnz),
        }
    }

    /// Returns the value type tag.
    #[inline]
    #[must_use]
    pub(crate) const fn value(&self) -> ValueTag {
        self.value
    }

    /// Returns the value entry width in bytes.
    #[inline]
    #[must_use]
    pub(crate) const fn value_width(&self) -> u64 {
        self.value_width.get()
    }

    /// Returns the column-index element type.
    #[inline]
    #[must_use]
    pub(crate) const fn index(&self) -> IndexVariant {
        self.index
    }

    /// Returns the pointer element type.
    #[inline]
    #[must_use]
    pub(crate) const fn iptr(&self) -> IndexVariant {
        self.iptr
    }

    /// Returns the compressed dimension.
    #[inline]
    #[must_use]
    pub(crate) const fn order(&self) -> StorageVariant {
        self.order
    }

    /// Returns the number of stored entries.
    #[inline]
    #[must_use]
    pub(crate) const fn nnz(&self) -> u64 {
        self.nnz.get()
    }

    /// Returns the `(rows, columns)` shape.
    ///
    /// Returns `None` unless the shape has rank 2, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn matrix_shape(&self) -> Option<(u64, u64)> {
        match *self.shape.dims() {
            [rows, columns] => Some((rows.get(), columns.get())),
            _ => None,
        }
    }

    /// Returns the compressed dimension's extent.
    ///
    /// Returns `None` unless the shape has rank 2, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn outer_count(&self) -> Option<u64> {
        let (rows, columns) = self.matrix_shape()?;
        Some(match self.order {
            StorageVariant::Csr => rows,
            StorageVariant::Csc => columns,
        })
    }

    /// Returns the offset of the index region.
    ///
    /// The pointer region sits between the header and this offset, zero padded to the boundary.
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn indices_offset(&self) -> Option<u64> {
        let iptr = padded_size(self.outer_count()?.checked_add(1)?, self.iptr.width())?;
        PAGE.checked_add(iptr)
    }

    /// Returns the offset of the value region.
    ///
    /// The index region sits between the previous offset and this one, zero padded to the boundary.
    /// Returns `None` when the geometry overflows `u64`, in which case no real file matches the
    /// header.
    #[must_use]
    pub(crate) fn values_offset(&self) -> Option<u64> {
        self.indices_offset()?
            .checked_add(padded_size(self.nnz.get(), self.index.width())?)
    }

    /// Returns the exact file length the header describes.
    ///
    /// The open path rejects a file whose length differs from this value. Returns `None` when the
    /// geometry overflows `u64`, in which case no real file matches the header.
    #[must_use]
    pub(crate) fn expected_file_len(&self) -> Option<u64> {
        let value_bytes = self.nnz.get().checked_mul(self.value_width.get())?;
        self.values_offset()?.checked_add(value_bytes)
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
            .field("value", &self.value)
            .field("value_width", &self.value_width)
            .field("index", &self.index)
            .field("iptr", &self.iptr)
            .field("order", &self.order)
            .field("shape", &self.shape)
            .field("nnz", &self.nnz)
            .finish_non_exhaustive()
    }
}
