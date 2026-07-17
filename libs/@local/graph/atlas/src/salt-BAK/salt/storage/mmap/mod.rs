//! Validated, zero-copy views over immutable little-endian artifacts.
//!
//! Each artifact begins with a 64-byte fixed header followed by a table of
//! 48-byte section descriptors. The first section begins at the next 64-byte
//! boundary. Every section also declares a power-of-two alignment of at least
//! 64 bytes.
//!
//! The fixed header contains:
//!
//! - the `SALTMMAP` magic bytes;
//! - format version and artifact kind;
//! - a little-endian marker;
//! - fixed-header and section counts;
//! - total file length; and
//! - a SHA-256 hash over every byte after the fixed header.
//!
//! A descriptor records section identifier, scalar type, rank, alignment,
//! offset, byte length and up to three dimensions. Validation requires section
//! identifiers and byte ranges to be strictly increasing, shapes to agree with
//! scalar widths, ranges to remain inside the mapping, and all alignment gaps
//! to contain zeroes. These rules give every logical artifact one canonical
//! byte representation.
//!
//! # Loading and borrowing
//!
//! [`ArtifactView::new`] validates borrowed bytes. [`MappedArtifact`] snapshots
//! each source into a private unlinked file before mapping and returns
//! [`ArtifactView`] values whose typed sections borrow that mapping. Section
//! headers, descriptors, and numeric arrays are borrowed through `zerocopy`;
//! semantic validation remains explicit and no numeric section is copied.
//!
//! The private snapshot prevents later writes or truncation of the published
//! path from changing live bytes or invalidating the mapping. A shared advisory
//! lock is still taken while copying to coordinate with conforming publishers;
//! correctness does not depend on that lock.
//!
//! # Cost
//!
//! Loading copies `O(file length)` bytes once into private temporary storage.
//! Header and descriptor validation then uses constant additional memory.
//! Payload hash verification and padding checks scan the private snapshot once.
//! Section lookup scans at most 256 descriptors and typed section access is
//! constant time.
#![expect(unsafe_code)]

use std::{
    fs::File,
    io::{self, Read as _, Seek as _, Write as _},
};

use memmap2::{Mmap, MmapOptions};
use tempfile::tempfile;
use zerocopy::{
    FromBytes, Immutable, IntoBytes, KnownLayout,
    byteorder::little_endian::{U16, U32, U64},
};

use crate::salt::hash::ContentHash;

mod error;
mod format;
mod write;

pub(crate) use self::{
    error::{
        ArtifactFormatError, ArtifactMapError, ArtifactWriteError, HeaderError, SectionError,
        SectionTypeError,
    },
    format::{
        ArtifactFormat, ArtifactHeader, ArtifactKind, FormatVersion, ScalarType, SectionDescriptor,
        SectionId,
    },
    write::{ArtifactScalar, ArtifactSection, PublishedArtifact, publish_artifact},
};

const MAGIC: &[u8; 8] = b"SALTMMAP";
const HEADER_BYTES: usize = 64;
const DESCRIPTOR_BYTES: usize = 48;
const TABLE_ALIGNMENT: usize = 64;
const MIN_SECTION_ALIGNMENT: u32 = 64;
const BYTE_ORDER_MARKER: u32 = 0x0102_0304;
const MAX_SECTIONS: u32 = 256;

#[derive(Debug, Copy, Clone, FromBytes, Immutable, IntoBytes, KnownLayout)]
#[repr(C)]
struct WireHeader {
    magic: [u8; 8],
    version: U16,
    kind: U16,
    byte_order: U32,
    header_bytes: U32,
    section_count: U32,
    total_bytes: U64,
    payload_hash: [u8; 32],
}

#[derive(Debug, Copy, Clone, FromBytes, Immutable, IntoBytes, KnownLayout)]
#[repr(C)]
struct WireDescriptor {
    id: U16,
    scalar: u8,
    rank: u8,
    alignment: U32,
    offset: U64,
    length: U64,
    shape: [U64; 3],
}

const _: () = {
    assert!(size_of::<WireHeader>() == HEADER_BYTES);
    assert!(size_of::<WireDescriptor>() == DESCRIPTOR_BYTES);
};

/// A validated borrowed artifact.
///
/// The view exposes only sections whose hash, shape, range, alignment and
/// canonical padding have already been checked. Copying the view preserves the
/// same borrow and does not copy artifact data.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ArtifactView<'artifact> {
    bytes: &'artifact [u8],
    header: ArtifactHeader,
}

impl<'artifact> ArtifactView<'artifact> {
    /// Validates an artifact and its section table.
    ///
    /// # Errors
    ///
    /// This returns an error for incompatible headers, hashes, shapes, ranges,
    /// ordering, alignment, or nonzero padding.
    pub(crate) fn new(
        bytes: &'artifact [u8],
        expected: ArtifactFormat,
    ) -> Result<Self, ArtifactFormatError> {
        if !cfg!(target_endian = "little") {
            return Err(ArtifactFormatError::UnsupportedHostEndianness);
        }
        if bytes.len() < HEADER_BYTES {
            return Err(HeaderError::TooShort {
                actual: bytes.len(),
            }
            .into());
        }
        let (wire, _) =
            WireHeader::ref_from_prefix(bytes).map_err(|_| HeaderError::InvalidLayout)?;
        if &wire.magic != MAGIC {
            return Err(HeaderError::Magic.into());
        }

        let actual = ArtifactFormat {
            version: FormatVersion::new(wire.version.get()),
            kind: ArtifactKind::new(wire.kind.get()),
        };
        if actual != expected {
            return Err(HeaderError::Format { expected, actual }.into());
        }

        let byte_order = wire.byte_order.get();
        if byte_order != BYTE_ORDER_MARKER {
            return Err(HeaderError::ByteOrder { actual: byte_order }.into());
        }
        let header_bytes = wire.header_bytes.get();
        if header_bytes != HEADER_BYTES as u32 {
            return Err(HeaderError::HeaderBytes {
                actual: header_bytes,
            }
            .into());
        }

        let section_count = wire.section_count.get();
        if section_count == 0 || section_count > MAX_SECTIONS {
            return Err(HeaderError::SectionCount {
                actual: section_count,
                maximum: MAX_SECTIONS,
            }
            .into());
        }

        let total_bytes = wire.total_bytes.get();
        let actual_bytes = u64::try_from(bytes.len()).expect("slice length should fit into u64");
        if total_bytes != actual_bytes {
            return Err(HeaderError::TotalBytes {
                declared: total_bytes,
                actual: actual_bytes,
            }
            .into());
        }

        let payload_hash = ContentHash::from_bytes(wire.payload_hash);
        let table_bytes = usize::try_from(section_count)
            .expect("u32 should fit into usize")
            .checked_mul(DESCRIPTOR_BYTES)
            .ok_or(HeaderError::SectionTableOverflow)?;
        let table_end = HEADER_BYTES
            .checked_add(table_bytes)
            .ok_or(HeaderError::SectionTableOverflow)?;
        let data_start =
            align_up(table_end, TABLE_ALIGNMENT).ok_or(HeaderError::SectionTableOverflow)?;
        if data_start > bytes.len() {
            return Err(HeaderError::SectionTableTruncated.into());
        }

        let actual_hash = ContentHash::digest(&bytes[HEADER_BYTES..]);
        if actual_hash != payload_hash {
            return Err(HeaderError::PayloadHash {
                expected: payload_hash,
                actual: actual_hash,
            }
            .into());
        }

        let view = Self {
            bytes,
            header: ArtifactHeader {
                format: actual,
                section_count,
                total_bytes,
                payload_hash,
            },
        };
        view.validate_sections(data_start, table_end)?;
        Ok(view)
    }

    /// Returns the validated header.
    #[must_use]
    #[inline]
    pub(crate) const fn header(self) -> ArtifactHeader {
        self.header
    }

    /// Iterates over sections in identifier and file order.
    #[must_use]
    #[inline]
    pub(crate) const fn sections(self) -> Sections<'artifact> {
        Sections {
            artifact: self,
            index: 0,
        }
    }

    /// Finds a section by identifier.
    #[must_use]
    #[inline]
    pub(crate) fn section(self, id: SectionId) -> Option<SectionView<'artifact>> {
        self.sections().find(|section| section.descriptor.id == id)
    }

    fn descriptor(self, index: u32) -> SectionDescriptor {
        debug_assert!(index < self.header.section_count);
        parse_descriptor(self.bytes, index)
            .expect("descriptor should have been validated during construction")
    }

    fn validate_sections(
        self,
        data_start: usize,
        table_end: usize,
    ) -> Result<(), ArtifactFormatError> {
        if let Some(offset) = first_nonzero(&self.bytes[table_end..data_start], table_end) {
            return Err(HeaderError::NonZeroPadding { offset }.into());
        }

        let mut previous_id = 0_u16;
        let mut previous_end = u64::try_from(data_start).expect("slice offset should fit into u64");
        for index in 0..self.header.section_count {
            let descriptor = parse_descriptor(self.bytes, index)?;
            let error = validate_descriptor(
                self.bytes,
                descriptor,
                previous_id,
                previous_end,
                data_start,
            );
            if let Err(error) = error {
                return Err(ArtifactFormatError::Section { index, error });
            }

            let start = usize::try_from(descriptor.offset)
                .expect("validated section offset should fit into usize");
            if let Some(offset) = first_nonzero(
                &self.bytes[usize::try_from(previous_end)
                    .expect("validated section end should fit into usize")
                    ..start],
                usize::try_from(previous_end).expect("validated section end should fit into usize"),
            ) {
                return Err(ArtifactFormatError::Section {
                    index,
                    error: SectionError::NonZeroPadding { offset },
                });
            }

            previous_id = descriptor.id.as_u16();
            previous_end = descriptor
                .offset
                .checked_add(descriptor.length)
                .expect("validated section range should not overflow");
        }

        if previous_end != self.header.total_bytes {
            return Err(HeaderError::TrailingBytes {
                section_end: previous_end,
                total: self.header.total_bytes,
            }
            .into());
        }
        Ok(())
    }
}

/// Iterator over validated artifact sections.
#[derive(Debug, Copy, Clone)]
pub(crate) struct Sections<'artifact> {
    artifact: ArtifactView<'artifact>,
    index: u32,
}

impl<'artifact> Iterator for Sections<'artifact> {
    type Item = SectionView<'artifact>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.index == self.artifact.header.section_count {
            return None;
        }
        let descriptor = self.artifact.descriptor(self.index);
        self.index += 1;
        Some(SectionView {
            bytes: self.artifact.bytes,
            descriptor,
        })
    }

    fn size_hint(&self) -> (usize, Option<usize>) {
        let remaining = self.len();
        (remaining, Some(remaining))
    }
}

impl ExactSizeIterator for Sections<'_> {
    #[inline]
    fn len(&self) -> usize {
        usize::try_from(self.artifact.header.section_count - self.index)
            .expect("u32 should fit into usize")
    }
}

/// A validated zero-copy section.
///
/// Typed access succeeds only when the requested primitive matches the
/// descriptor's [`ScalarType`]. Returned slices point into the original
/// artifact bytes.
#[derive(Debug, Copy, Clone)]
pub(crate) struct SectionView<'artifact> {
    bytes: &'artifact [u8],
    pub descriptor: SectionDescriptor,
}

impl<'artifact> SectionView<'artifact> {
    /// Borrows the encoded section bytes.
    #[must_use]
    pub(crate) fn as_bytes(self) -> &'artifact [u8] {
        let start = usize::try_from(self.descriptor.offset)
            .expect("validated section offset should fit into usize");
        let end = start
            + usize::try_from(self.descriptor.length)
                .expect("validated section length should fit into usize");
        &self.bytes[start..end]
    }

    /// Borrows a `u8` section.
    pub(crate) fn as_u8(self) -> Result<&'artifact [u8], SectionTypeError> {
        self.ensure_scalar(ScalarType::U8)?;
        Ok(self.as_bytes())
    }

    /// Borrows a native `u32` view over a little-endian section.
    #[inline]
    pub(crate) fn as_u32(self) -> Result<&'artifact [u32], SectionTypeError> {
        self.cast(ScalarType::U32)
    }

    /// Borrows a native `u64` view over a little-endian section.
    #[inline]
    pub(crate) fn as_u64(self) -> Result<&'artifact [u64], SectionTypeError> {
        self.cast(ScalarType::U64)
    }

    /// Borrows a native `f32` view over a little-endian section.
    #[inline]
    pub(crate) fn as_f32(self) -> Result<&'artifact [f32], SectionTypeError> {
        self.cast(ScalarType::F32)
    }

    /// Borrows a native `f64` view over a little-endian section.
    #[inline]
    pub(crate) fn as_f64(self) -> Result<&'artifact [f64], SectionTypeError> {
        self.cast(ScalarType::F64)
    }

    fn ensure_scalar(self, expected: ScalarType) -> Result<(), SectionTypeError> {
        if self.descriptor.scalar != expected {
            return Err(SectionTypeError {
                section: self.descriptor.id,
                expected,
                actual: self.descriptor.scalar,
            });
        }
        Ok(())
    }

    fn cast<T>(self, expected: ScalarType) -> Result<&'artifact [T], SectionTypeError>
    where
        T: zerocopy::FromBytes + Immutable,
    {
        self.ensure_scalar(expected)?;
        let bytes = self.as_bytes();
        let count = usize::try_from(self.descriptor.element_count())
            .expect("validated element count should fit into usize");
        let (values, remainder) = <[T]>::ref_from_prefix_with_elems(bytes, count)
            .expect("validated section should have the required size and alignment");
        debug_assert!(remainder.is_empty());
        Ok(values)
    }
}

/// An immutable private snapshot of a file-backed artifact.
///
/// The snapshot's writable handle is dropped immediately after mapping. Call
/// [`Self::bytes`] to borrow bytes that cannot be changed through the published
/// artifact path.
#[derive(Debug)]
pub(crate) struct MappedFile {
    map: Option<Mmap>,
}

impl MappedFile {
    /// Copies one regular file into a private snapshot and maps that snapshot.
    ///
    /// # Errors
    ///
    /// This returns an error when locking, bounded snapshotting, or mapping
    /// fails.
    pub(crate) fn map_immutable(mut file: File) -> Result<Self, ArtifactMapError> {
        file.try_lock_shared()
            .map_err(|error| ArtifactMapError::Io(error.into()))?;
        let metadata = file.metadata().map_err(ArtifactMapError::Io)?;
        if !metadata.is_file() {
            return Err(ArtifactMapError::Io(io::Error::new(
                io::ErrorKind::InvalidData,
                "mapped artifact source is not a regular file",
            )));
        }
        file.rewind().map_err(ArtifactMapError::Io)?;
        let expected = metadata.len();
        let mut snapshot = tempfile().map_err(ArtifactMapError::Io)?;
        let copied = io::copy(
            &mut std::io::Read::by_ref(&mut file).take(expected.saturating_add(1)),
            &mut snapshot,
        )
        .map_err(ArtifactMapError::Io)?;
        if copied != expected {
            return Err(ArtifactMapError::Io(io::Error::new(
                io::ErrorKind::InvalidData,
                "mapped artifact length changed while it was snapshotted",
            )));
        }
        snapshot.flush().map_err(ArtifactMapError::Io)?;
        snapshot.rewind().map_err(ArtifactMapError::Io)?;
        let map = if expected == 0 {
            None
        } else {
            let length = usize::try_from(expected).map_err(|_error| {
                ArtifactMapError::Io(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "mapped artifact length does not fit memory",
                ))
            })?;
            // SAFETY: `snapshot` is an unlinked private file. Its only writable
            // handle is dropped before this function returns, while `Mmap`
            // retains the platform mapping independently.
            Some(
                unsafe { MmapOptions::new().len(length).map(&snapshot) }
                    .map_err(ArtifactMapError::Io)?,
            )
        };
        drop(snapshot);
        Ok(Self { map })
    }

    /// Borrows the exact bytes retained by this mapping.
    #[must_use]
    #[inline]
    pub(crate) fn bytes(&self) -> &[u8] {
        self.map.as_deref().unwrap_or_default()
    }
}

/// An immutable file-backed artifact with a validated SALT schema.
#[derive(Debug)]
pub(crate) struct MappedArtifact {
    file: MappedFile,
    header: ArtifactHeader,
}

impl MappedArtifact {
    /// Maps and validates an immutable artifact.
    ///
    /// # Errors
    ///
    /// This returns an error when locking or mapping fails, or the artifact is
    /// invalid.
    pub(crate) fn map_immutable(
        file: File,
        expected: ArtifactFormat,
    ) -> Result<Self, ArtifactMapError> {
        let file = MappedFile::map_immutable(file)?;
        let header = ArtifactView::new(file.bytes(), expected)
            .map_err(ArtifactMapError::Format)?
            .header();
        Ok(Self { file, header })
    }

    /// Borrows the validated artifact.
    #[must_use]
    #[inline]
    pub(crate) fn view(&self) -> ArtifactView<'_> {
        ArtifactView {
            bytes: self.file.bytes(),
            header: self.header,
        }
    }

    /// Borrows the exact immutable bytes retained by this mapping.
    #[must_use]
    #[inline]
    pub(crate) fn bytes(&self) -> &[u8] {
        self.file.bytes()
    }
}

fn parse_descriptor(bytes: &[u8], index: u32) -> Result<SectionDescriptor, ArtifactFormatError> {
    let start = HEADER_BYTES
        + usize::try_from(index).expect("u32 should fit into usize") * DESCRIPTOR_BYTES;
    let bytes = &bytes[start..start + DESCRIPTOR_BYTES];
    let wire = WireDescriptor::ref_from_bytes(bytes).map_err(|_| ArtifactFormatError::Section {
        index,
        error: SectionError::InvalidLayout,
    })?;
    let scalar = ScalarType::from_u8(wire.scalar).ok_or(ArtifactFormatError::Section {
        index,
        error: SectionError::UnknownScalar {
            actual: wire.scalar,
        },
    })?;
    Ok(SectionDescriptor {
        id: SectionId::new(wire.id.get()),
        scalar,
        rank: wire.rank,
        alignment: wire.alignment.get(),
        offset: wire.offset.get(),
        length: wire.length.get(),
        shape: [
            wire.shape[0].get(),
            wire.shape[1].get(),
            wire.shape[2].get(),
        ],
    })
}

fn validate_descriptor(
    bytes: &[u8],
    descriptor: SectionDescriptor,
    previous_id: u16,
    previous_end: u64,
    data_start: usize,
) -> Result<(), SectionError> {
    let id = descriptor.id.as_u16();
    if id == 0 {
        return Err(SectionError::ZeroId);
    }
    if id <= previous_id {
        return Err(SectionError::IdOrder {
            previous: previous_id,
            actual: id,
        });
    }
    if descriptor.rank == 0 || descriptor.rank > 3 {
        return Err(SectionError::Rank {
            actual: descriptor.rank,
        });
    }
    for (axis, &value) in descriptor.shape.iter().enumerate() {
        let used = axis < usize::from(descriptor.rank);
        if !used && value != 0 {
            return Err(SectionError::Shape {
                axis: u8::try_from(axis).expect("shape axis should fit into u8"),
                value,
            });
        }
    }
    if descriptor.alignment < MIN_SECTION_ALIGNMENT
        || !descriptor.alignment.is_power_of_two()
        || u64::from(descriptor.alignment) < descriptor.scalar.width()
    {
        return Err(SectionError::Alignment {
            actual: descriptor.alignment,
        });
    }

    let minimum =
        previous_end.max(u64::try_from(data_start).expect("slice offset should fit into u64"));
    if descriptor.offset < minimum || descriptor.offset % u64::from(descriptor.alignment) != 0 {
        return Err(SectionError::Offset {
            minimum,
            actual: descriptor.offset,
        });
    }

    let offset = usize::try_from(descriptor.offset).map_err(|_| SectionError::LengthOverflow)?;
    if offset > bytes.len()
        || !bytes.as_ptr().wrapping_add(offset).is_aligned_to(
            usize::try_from(descriptor.alignment).expect("u32 alignment should fit into usize"),
        )
    {
        return Err(SectionError::PointerAlignment {
            alignment: descriptor.alignment,
        });
    }

    let elements = descriptor.shape[..usize::from(descriptor.rank)]
        .iter()
        .try_fold(1_u64, |product, dimension| product.checked_mul(*dimension))
        .ok_or(SectionError::LengthOverflow)?;
    let expected_length = elements
        .checked_mul(descriptor.scalar.width())
        .ok_or(SectionError::LengthOverflow)?;
    if descriptor.length != expected_length {
        return Err(SectionError::Length {
            expected: expected_length,
            actual: descriptor.length,
        });
    }

    let end = descriptor
        .offset
        .checked_add(descriptor.length)
        .ok_or(SectionError::LengthOverflow)?;
    let total = u64::try_from(bytes.len()).expect("slice length should fit into u64");
    if end > total {
        return Err(SectionError::Range { end, total });
    }
    Ok(())
}

fn align_up(value: usize, alignment: usize) -> Option<usize> {
    debug_assert!(alignment.is_power_of_two());
    value
        .checked_add(alignment - 1)
        .map(|value| value & !(alignment - 1))
}

fn first_nonzero(bytes: &[u8], base: usize) -> Option<usize> {
    bytes
        .iter()
        .position(|byte| *byte != 0)
        .map(|offset| base + offset)
}

#[cfg(test)]
mod tests;
