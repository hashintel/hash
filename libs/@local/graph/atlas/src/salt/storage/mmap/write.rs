use std::{
    fs::{self, File},
    io::{Seek as _, SeekFrom, Write as _},
};

use camino::Utf8Path;
use sha2::{Digest as _, Sha256};
use tempfile::NamedTempFile;
use zerocopy::{Immutable, IntoBytes};

use super::{
    ArtifactFormat, ArtifactHeader, ArtifactMapError, ArtifactWriteError, BYTE_ORDER_MARKER,
    DESCRIPTOR_BYTES, HEADER_BYTES, MAGIC, MAX_SECTIONS, MIN_SECTION_ALIGNMENT, MappedArtifact,
    ScalarType, SectionError, SectionId, TABLE_ALIGNMENT, WireDescriptor, WireHeader, align_up,
};
use crate::salt::hash::{ContentHash, hash_reader};

const ZERO_BUFFER_BYTES: usize = 4 * 1024;

/// Primitive types supported by typed artifact sections.
pub(crate) trait ArtifactScalar: IntoBytes + Immutable {
    const SCALAR: ScalarType;
}

impl ArtifactScalar for u8 {
    const SCALAR: ScalarType = ScalarType::U8;
}

impl ArtifactScalar for u32 {
    const SCALAR: ScalarType = ScalarType::U32;
}

impl ArtifactScalar for u64 {
    const SCALAR: ScalarType = ScalarType::U64;
}

impl ArtifactScalar for f32 {
    const SCALAR: ScalarType = ScalarType::F32;
}

impl ArtifactScalar for f64 {
    const SCALAR: ScalarType = ScalarType::F64;
}

/// One borrowed typed section to encode without copying its payload.
#[derive(Debug, Copy, Clone)]
pub(crate) struct ArtifactSection<'data> {
    id: SectionId,
    scalar: ScalarType,
    rank: u8,
    alignment: u32,
    shape: [u64; 3],
    bytes: &'data [u8],
}

impl<'data> ArtifactSection<'data> {
    /// Creates a default-aligned section from a typed native-endian slice.
    ///
    /// The artifact writer accepts only little-endian hosts, making the native
    /// byte view identical to the persisted encoding.
    ///
    /// # Errors
    ///
    /// This returns an error unless dimensions have rank 1 through 3, fit
    /// `u64`, and multiply to the supplied value count. Zero dimensions encode
    /// canonical empty sections.
    pub(crate) fn new<T>(
        id: SectionId,
        dimensions: &[usize],
        values: &'data [T],
    ) -> Result<Self, SectionError>
    where
        T: ArtifactScalar,
    {
        if dimensions.is_empty() || dimensions.len() > 3 {
            return Err(SectionError::Rank {
                actual: u8::try_from(dimensions.len()).unwrap_or(u8::MAX),
            });
        }
        let mut shape = [0_u64; 3];
        let mut elements = 1_usize;
        for (axis, &dimension) in dimensions.iter().enumerate() {
            shape[axis] = u64::try_from(dimension).map_err(|_| SectionError::LengthOverflow)?;
            elements = elements
                .checked_mul(dimension)
                .ok_or(SectionError::LengthOverflow)?;
        }
        if elements != values.len() {
            let expected = u64::try_from(elements)
                .map_err(|_error| SectionError::LengthOverflow)?
                .checked_mul(T::SCALAR.width())
                .ok_or(SectionError::LengthOverflow)?;
            let actual = u64::try_from(values.len())
                .map_err(|_error| SectionError::LengthOverflow)?
                .checked_mul(T::SCALAR.width())
                .ok_or(SectionError::LengthOverflow)?;
            return Err(SectionError::Length { expected, actual });
        }
        Ok(Self {
            id,
            scalar: T::SCALAR,
            rank: u8::try_from(dimensions.len()).expect("rank should fit u8"),
            alignment: MIN_SECTION_ALIGNMENT,
            shape,
            bytes: values.as_bytes(),
        })
    }

    /// Overrides the section alignment.
    #[must_use]
    #[inline]
    pub(crate) const fn with_alignment(mut self, alignment: u32) -> Self {
        self.alignment = alignment;
        self
    }
}

/// Identity and disposition of an atomically published artifact.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct PublishedArtifact {
    pub header: ArtifactHeader,
    pub content_hash: ContentHash,
    pub reused_existing: bool,
}

/// Streams a canonical artifact into an immutable destination.
///
/// Section descriptors and zero padding are hashed with payload bytes. The
/// fixed header is backfilled only after that payload hash is known. Publishing
/// uses a same-directory temporary file and no-clobber rename; an existing
/// byte-identical artifact makes the operation idempotent.
///
/// # Errors
///
/// This returns an error for invalid sections, integer overflow, I/O failure,
/// or a different artifact already present at `path`.
#[expect(
    clippy::too_many_lines,
    reason = "the writer keeps hashing, durability, and no-clobber verification in one auditable \
              transaction"
)]
pub(crate) fn publish_artifact(
    path: &Utf8Path,
    format: ArtifactFormat,
    sections: &[ArtifactSection<'_>],
) -> Result<PublishedArtifact, ArtifactWriteError> {
    if !cfg!(target_endian = "little") {
        return Err(ArtifactWriteError::Map(ArtifactMapError::Format(
            super::ArtifactFormatError::UnsupportedHostEndianness,
        )));
    }
    if sections.is_empty() {
        return Err(ArtifactWriteError::EmptySections);
    }
    if sections.len() > MAX_SECTIONS as usize {
        return Err(ArtifactWriteError::TooManySections {
            count: sections.len(),
            maximum: MAX_SECTIONS,
        });
    }
    let descriptors = descriptors(sections)?;
    let total_bytes = descriptors
        .last()
        .map(|descriptor| descriptor.offset.get() + descriptor.length.get())
        .expect("validated section set should be non-empty");
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("artifact path {path} has no parent"),
        )
    })?;
    fs::create_dir_all(parent)?;
    let mut temporary = NamedTempFile::new_in(parent)?;
    temporary.as_file_mut().write_all(&[0_u8; HEADER_BYTES])?;
    let mut payload_hasher = Sha256::new();
    let mut position = HEADER_BYTES;
    for descriptor in &descriptors {
        write_hashed(
            temporary.as_file_mut(),
            &mut payload_hasher,
            descriptor.as_bytes(),
        )?;
        position += DESCRIPTOR_BYTES;
    }
    let data_start =
        align_up(position, TABLE_ALIGNMENT).ok_or(ArtifactWriteError::InvalidSection {
            index: 0,
            error: SectionError::LengthOverflow,
        })?;
    write_zeroes(
        temporary.as_file_mut(),
        &mut payload_hasher,
        data_start - position,
    )?;
    position = data_start;
    for (section, descriptor) in sections.iter().zip(&descriptors) {
        let offset = usize::try_from(descriptor.offset.get()).map_err(|_| {
            ArtifactWriteError::InvalidSection {
                index: 0,
                error: SectionError::LengthOverflow,
            }
        })?;
        write_zeroes(
            temporary.as_file_mut(),
            &mut payload_hasher,
            offset - position,
        )?;
        write_hashed(temporary.as_file_mut(), &mut payload_hasher, section.bytes)?;
        position = offset + section.bytes.len();
    }
    debug_assert_eq!(
        u64::try_from(position).expect("file position should fit u64"),
        total_bytes
    );

    let payload_hash = ContentHash::from_bytes(payload_hasher.finalize().into());
    let header = ArtifactHeader {
        format,
        section_count: u32::try_from(sections.len()).expect("section count should fit u32"),
        total_bytes,
        payload_hash,
    };
    let wire_header = WireHeader {
        magic: *MAGIC,
        version: format.version.as_u16().into(),
        kind: format.kind.as_u16().into(),
        byte_order: BYTE_ORDER_MARKER.into(),
        header_bytes: u32::try_from(HEADER_BYTES)
            .expect("header size should fit u32")
            .into(),
        section_count: header.section_count.into(),
        total_bytes: header.total_bytes.into(),
        payload_hash: *payload_hash.as_bytes(),
    };
    temporary.as_file_mut().seek(SeekFrom::Start(0))?;
    temporary.as_file_mut().write_all(wire_header.as_bytes())?;
    temporary.as_file().sync_all()?;
    temporary.as_file_mut().seek(SeekFrom::Start(0))?;
    let content_hash = hash_reader(temporary.as_file_mut())?;

    let reused_existing = match temporary.persist_noclobber(path) {
        Ok(file) => {
            file.sync_all()?;
            File::open(parent)?.sync_all()?;
            false
        }
        Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {
            let existing_file = File::open(path)?;
            existing_file.sync_all()?;
            let existing = MappedArtifact::map_immutable(existing_file, format)
                .map_err(ArtifactWriteError::Map)?;
            if existing.view().header() != header
                || ContentHash::digest(existing.bytes()) != content_hash
            {
                return Err(ArtifactWriteError::ExistingArtifactMismatch {
                    path: path.to_owned(),
                });
            }
            File::open(parent)?.sync_all()?;
            true
        }
        Err(error) => return Err(ArtifactWriteError::Persist(error)),
    };
    Ok(PublishedArtifact {
        header,
        content_hash,
        reused_existing,
    })
}

fn descriptors(
    sections: &[ArtifactSection<'_>],
) -> Result<Vec<WireDescriptor>, ArtifactWriteError> {
    let table_bytes = sections
        .len()
        .checked_mul(DESCRIPTOR_BYTES)
        .and_then(|bytes| HEADER_BYTES.checked_add(bytes))
        .and_then(|end| align_up(end, TABLE_ALIGNMENT))
        .ok_or(ArtifactWriteError::InvalidSection {
            index: 0,
            error: SectionError::LengthOverflow,
        })?;
    let mut previous_id = 0_u16;
    let mut end = u64::try_from(table_bytes).expect("table offset should fit u64");
    let mut descriptors = Vec::new();
    descriptors
        .try_reserve_exact(sections.len())
        .map_err(|_error| ArtifactWriteError::Allocation {
            buffer: "artifact section descriptors",
            elements: sections.len(),
        })?;
    for (index, section) in sections.iter().enumerate() {
        let id = section.id.as_u16();
        let error = if id == 0 {
            Some(SectionError::ZeroId)
        } else if id <= previous_id {
            Some(SectionError::IdOrder {
                previous: previous_id,
                actual: id,
            })
        } else if section.alignment < MIN_SECTION_ALIGNMENT || !section.alignment.is_power_of_two()
        {
            Some(SectionError::Alignment {
                actual: section.alignment,
            })
        } else {
            None
        };
        if let Some(error) = error {
            return Err(ArtifactWriteError::InvalidSection { index, error });
        }
        let offset = align_up(
            usize::try_from(end).map_err(|_| ArtifactWriteError::InvalidSection {
                index,
                error: SectionError::LengthOverflow,
            })?,
            usize::try_from(section.alignment).expect("u32 alignment should fit usize"),
        )
        .ok_or(ArtifactWriteError::InvalidSection {
            index,
            error: SectionError::LengthOverflow,
        })?;
        let length =
            u64::try_from(section.bytes.len()).map_err(|_| ArtifactWriteError::InvalidSection {
                index,
                error: SectionError::LengthOverflow,
            })?;
        end = u64::try_from(offset)
            .expect("section offset should fit u64")
            .checked_add(length)
            .ok_or(ArtifactWriteError::InvalidSection {
                index,
                error: SectionError::LengthOverflow,
            })?;
        descriptors.push(WireDescriptor {
            id: id.into(),
            scalar: section.scalar as u8,
            rank: section.rank,
            alignment: section.alignment.into(),
            offset: u64::try_from(offset)
                .expect("section offset should fit u64")
                .into(),
            length: length.into(),
            shape: section.shape.map(Into::into),
        });
        previous_id = id;
    }
    Ok(descriptors)
}

#[inline]
fn write_hashed(file: &mut File, hasher: &mut Sha256, bytes: &[u8]) -> Result<(), std::io::Error> {
    file.write_all(bytes)?;
    hasher.update(bytes);
    Ok(())
}

fn write_zeroes(
    file: &mut File,
    hasher: &mut Sha256,
    mut count: usize,
) -> Result<(), std::io::Error> {
    const ZEROES: [u8; ZERO_BUFFER_BYTES] = [0; ZERO_BUFFER_BYTES];
    while count != 0 {
        let chunk = count.min(ZEROES.len());
        write_hashed(file, hasher, &ZEROES[..chunk])?;
        count -= chunk;
    }
    Ok(())
}
