//! Opened landmark files.

use core::{error::Error, fmt};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{
    FromBytes as _, LE, TryFromBytes as _, U32, U64,
    error::{ConvertError, ValidityError},
};

use super::FileHeader;
use crate::math::Vec2;

/// Opening a landmark file failed.
#[derive(Debug)]
pub(crate) enum OpenLandmarkError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes; [`None`] when the header's
        /// geometry overflows `u64`, in which case it matches no real
        /// file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenLandmarkError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the landmark file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => write!(
                fmt,
                "the leading bytes are not a landmark file header: {error}",
            ),
            Self::Length {
                expected: Some(expected),
                actual,
            } => write!(
                fmt,
                "the file holds {actual} bytes where the header describes {expected}",
            ),
            Self::Length {
                expected: None,
                actual,
            } => write!(
                fmt,
                "the file holds {actual} bytes where the header describes no skeleton",
            ),
        }
    }
}

impl Error for OpenLandmarkError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// A landmark file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own regions exactly. The
/// regions are borrowed straight from the whole-file mapping and start
/// 4096-byte aligned: aligned for every scalar and SIMD width. The
/// accessors expose geometry alone; the skeleton's domain invariants
/// are `salt::landmark`'s artifact contract.
#[derive(Debug)]
pub(crate) struct LandmarkFile {
    map: Mmap,
}

impl LandmarkFile {
    /// Opens and maps the landmark file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenLandmarkError::Io`] when the file cannot be opened
    /// or mapped, [`OpenLandmarkError::Header`] when its leading bytes
    /// are not a header this module speaks, and
    /// [`OpenLandmarkError::Length`] when the file length contradicts
    /// the header's geometry.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenLandmarkError> {
        let file = File::open(path).map_err(OpenLandmarkError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenLandmarkError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenLandmarkError::Undersized {
                actual: map.len() as u64,
            });
        };
        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenLandmarkError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenLandmarkError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        let ptr = self.map.as_ptr().cast::<FileHeader>();

        // SAFETY: The map is valid for the lifetime of the file, immutable, and the constructor
        // validated that the map is large enough to contain the header and that its bytes parse
        // as one, so the deref target is a valid `FileHeader`.
        unsafe { &*ptr }
    }

    /// Returns the landmark count `M`.
    #[inline]
    #[must_use]
    pub(crate) fn landmarks(&self) -> u64 {
        self.header().landmarks()
    }

    /// Returns the corpus row count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.header().rows()
    }

    /// Carves one region out of the mapping.
    fn region(&self, offset: u64, len: u64) -> &[u8] {
        // The offsets and products repeat checked computations open
        // already accepted, so none of them can overflow here.
        let offset = usize::try_from(offset).expect("a mapped offset fits the address space");
        let len = usize::try_from(len).expect("a mapped region fits the address space");
        &self.map[offset..offset + len]
    }

    /// Views the selected node rows, in ordinal order.
    #[must_use]
    pub(crate) fn selected_rows(&self) -> &[U64<LE>] {
        let bytes = self.region(
            FileHeader::SIZE as u64,
            self.landmarks() * size_of::<u64>() as u64,
        );
        <[U64<LE>]>::ref_from_bytes(bytes).expect("open validated the region size")
    }

    /// Views the landmark ordinals, in node-row order.
    #[must_use]
    pub(crate) fn assignment(&self) -> &[U32<LE>] {
        let bytes = self.region(
            self.header()
                .assignment_offset()
                .expect("open validated the geometry"),
            self.rows() * size_of::<u32>() as u64,
        );
        <[U32<LE>]>::ref_from_bytes(bytes).expect("open validated the region size")
    }

    /// Views the layout coordinates, in ordinal order.
    #[must_use]
    pub(crate) fn coordinates(&self) -> &[Vec2] {
        let bytes = self.region(
            self.header()
                .coordinates_offset()
                .expect("open validated the geometry"),
            self.landmarks() * (2 * size_of::<f32>() as u64),
        );

        <[Vec2]>::ref_from_bytes(bytes)
            .expect("open validated the region size and the mapping its alignment")
    }
}
