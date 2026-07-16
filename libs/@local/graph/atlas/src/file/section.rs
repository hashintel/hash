//! Validated section typing: scalar types, array shapes, and section kinds.
//!
//! A [`SectionKind`] couples a blob section's type code with its decoded
//! metadata, so a scalar array cannot exist without a valid
//! [`ScalarArrayLayout`] and a metadata tail cannot disagree with its type.
//! The index is not a [`SectionKind`]: it is container-owned and represented
//! by [`Entry::Index`].
//!
//! [`Entry::Index`]: super::entry::Entry::Index

use zerocopy::{FromBytes as _, IntoBytes as _, byteorder::little_endian::U64};

use super::wire::{self, ENTRY_METADATA_BYTES, MAX_ARRAY_RANK, WireScalarArrayMetadata};

/// A scalar element type of an array section.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u16)]
pub(crate) enum ScalarType {
    U8 = 1,
    U16 = 2,
    U32 = 3,
    U64 = 4,
    I8 = 5,
    I16 = 6,
    I32 = 7,
    I64 = 8,
    F16 = 9,
    Bf16 = 10,
    F32 = 11,
    F64 = 12,
}

impl ScalarType {
    /// Decodes a persisted scalar type value.
    #[must_use]
    pub(crate) const fn from_wire(value: u16) -> Option<Self> {
        match value {
            1 => Some(Self::U8),
            2 => Some(Self::U16),
            3 => Some(Self::U32),
            4 => Some(Self::U64),
            5 => Some(Self::I8),
            6 => Some(Self::I16),
            7 => Some(Self::I32),
            8 => Some(Self::I64),
            9 => Some(Self::F16),
            10 => Some(Self::Bf16),
            11 => Some(Self::F32),
            12 => Some(Self::F64),
            _ => None,
        }
    }

    /// Returns the persisted value.
    #[inline]
    #[must_use]
    pub(crate) const fn to_wire(self) -> u16 {
        self as u16
    }

    /// Returns the element width in bytes.
    #[inline]
    #[must_use]
    pub(crate) const fn width(self) -> u64 {
        match self {
            Self::U8 | Self::I8 => 1,
            Self::U16 | Self::I16 | Self::F16 | Self::Bf16 => 2,
            Self::U32 | Self::I32 | Self::F32 => 4,
            Self::U64 | Self::I64 | Self::F64 => 8,
        }
    }
}

// No zerocopy derives: byte-level construction would bypass the rank and
// dimension invariants.
/// A validated scalar array shape.
///
/// The rank is in `1..=MAX_ARRAY_RANK`, every dimension is nonzero, and the
/// element count fits in `u64`, so [`ArrayShape::element_count`] is total.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ArrayShape {
    dims: [u64; MAX_ARRAY_RANK],
    rank: u16,
}

impl ArrayShape {
    /// Creates a shape from its dimensions.
    ///
    /// Returns `None` when `dims` is empty or holds more than
    /// [`MAX_ARRAY_RANK`] dimensions, when any dimension is zero, or when
    /// the element count overflows `u64`.
    #[must_use]
    pub(crate) fn new(dims: &[u64]) -> Option<Self> {
        if dims.is_empty() || dims.len() > MAX_ARRAY_RANK {
            return None;
        }
        let mut product = 1_u64;
        for &dim in dims {
            if dim == 0 {
                return None;
            }
            product = product.checked_mul(dim)?;
        }

        let mut padded = [0; MAX_ARRAY_RANK];
        padded[..dims.len()].copy_from_slice(dims);
        let rank = u16::try_from(dims.len()).ok()?;
        Some(Self { dims: padded, rank })
    }

    /// Borrows the dimensions.
    #[inline]
    #[must_use]
    pub(crate) const fn dims(&self) -> &[u64] {
        self.dims.split_at(usize::from(self.rank)).0
    }

    /// Returns the rank.
    #[inline]
    #[must_use]
    pub(crate) const fn rank(&self) -> u16 {
        self.rank
    }

    /// Returns the number of elements.
    #[inline]
    #[must_use]
    pub(crate) fn element_count(&self) -> u64 {
        self.dims().iter().product()
    }
}

// No zerocopy derives: byte-level construction would bypass the byte-length
// bound.
/// A validated scalar array section layout.
///
/// The total byte size fits in `u64`, so [`ScalarArrayLayout::byte_length`]
/// is total.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct ScalarArrayLayout {
    scalar: ScalarType,
    shape: ArrayShape,
}

impl ScalarArrayLayout {
    /// Creates a layout from an element type and shape.
    ///
    /// Returns `None` when the total byte size overflows `u64`.
    #[must_use]
    pub(crate) fn new(scalar: ScalarType, shape: ArrayShape) -> Option<Self> {
        shape.element_count().checked_mul(scalar.width())?;
        Some(Self { scalar, shape })
    }

    /// Returns the element type.
    #[inline]
    #[must_use]
    pub(crate) const fn scalar(&self) -> ScalarType {
        self.scalar
    }

    /// Borrows the shape.
    #[inline]
    #[must_use]
    pub(crate) const fn shape(&self) -> &ArrayShape {
        &self.shape
    }

    /// Returns the total payload size in bytes.
    #[inline]
    #[must_use]
    pub(crate) fn byte_length(&self) -> u64 {
        self.shape.element_count() * self.scalar.width()
    }
}

/// A validated blob section classification with its typed metadata.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SectionKind {
    /// A UTF-8 JSON document.
    Document,
    /// Uninterpreted bytes, including alignment padding.
    Opaque,
    /// A scalar array.
    ScalarArray(ScalarArrayLayout),
    /// `.quad` quadtree topology.
    QuadTree,
    /// Point-cloud data for one quadtree node.
    PointCloud,
}

impl SectionKind {
    /// Returns whether a section type value is a blob section type.
    #[must_use]
    pub(crate) const fn is_blob_type(type_code: u16) -> bool {
        matches!(
            type_code,
            wire::SECTION_TYPE_DOCUMENT
                | wire::SECTION_TYPE_OPAQUE
                | wire::SECTION_TYPE_SCALAR_ARRAY
                | wire::SECTION_TYPE_QUAD_TREE
                | wire::SECTION_TYPE_POINT_CLOUD
        )
    }

    /// Returns the persisted section type value.
    #[inline]
    #[must_use]
    pub(crate) const fn type_code(&self) -> u16 {
        match self {
            Self::Document => wire::SECTION_TYPE_DOCUMENT,
            Self::Opaque => wire::SECTION_TYPE_OPAQUE,
            Self::ScalarArray(_) => wire::SECTION_TYPE_SCALAR_ARRAY,
            Self::QuadTree => wire::SECTION_TYPE_QUAD_TREE,
            Self::PointCloud => wire::SECTION_TYPE_POINT_CLOUD,
        }
    }

    /// Encodes the typed metadata tail, zero-padded to its full width.
    #[must_use]
    pub(crate) fn encode_metadata(&self) -> [u8; ENTRY_METADATA_BYTES] {
        let mut bytes = [0; ENTRY_METADATA_BYTES];
        if let Self::ScalarArray(layout) = self {
            let mut shape = [U64::new(0); MAX_ARRAY_RANK];
            for (slot, &dim) in shape.iter_mut().zip(layout.shape().dims()) {
                *slot = U64::new(dim);
            }
            let raw = WireScalarArrayMetadata {
                scalar: layout.scalar().to_wire().into(),
                rank: layout.shape().rank().into(),
                reserved: 0.into(),
                shape,
            };
            bytes[..size_of::<WireScalarArrayMetadata>()].copy_from_slice(raw.as_bytes());
        }
        bytes
    }

    /// Decodes a blob section type value and its metadata tail.
    ///
    /// Returns `None` when the type value is not a blob section type or the
    /// metadata violates the type's layout, including nonzero padding.
    #[must_use]
    pub(crate) fn decode(type_code: u16, metadata: &[u8; ENTRY_METADATA_BYTES]) -> Option<Self> {
        match type_code {
            wire::SECTION_TYPE_DOCUMENT => wire::all_zero(metadata).then_some(Self::Document),
            wire::SECTION_TYPE_OPAQUE => wire::all_zero(metadata).then_some(Self::Opaque),
            wire::SECTION_TYPE_QUAD_TREE => wire::all_zero(metadata).then_some(Self::QuadTree),
            wire::SECTION_TYPE_POINT_CLOUD => wire::all_zero(metadata).then_some(Self::PointCloud),
            wire::SECTION_TYPE_SCALAR_ARRAY => {
                let (raw, rest) = WireScalarArrayMetadata::read_from_prefix(metadata).ok()?;
                if !wire::all_zero(rest) || raw.reserved.get() != 0 {
                    return None;
                }
                let scalar = ScalarType::from_wire(raw.scalar.get())?;
                let rank = usize::from(raw.rank.get());
                if rank == 0 || rank > MAX_ARRAY_RANK {
                    return None;
                }
                let dims = raw.shape.map(U64::get);
                if !dims[rank..].iter().all(|&dim| dim == 0) {
                    return None;
                }
                let shape = ArrayShape::new(&dims[..rank])?;
                let layout = ScalarArrayLayout::new(scalar, shape)?;
                Some(Self::ScalarArray(layout))
            }
            _ => None,
        }
    }
}
