//! Opened attraction files.

use core::{error::Error, fmt};
use std::{io, path::Path};

use zerocopy::{
    FromBytes as _, TryFromBytes as _,
    error::{ConvertError, ValidityError},
};

use super::{EdgeRecord, FileHeader, GroupRecord};
use crate::file::region::PageMap;

/// Opening an attraction file failed.
#[derive(Debug)]
pub(crate) enum OpenAttractionError {
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

impl fmt::Display for OpenAttractionError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the attraction file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => write!(
                fmt,
                "the leading bytes are not an attraction file header: {error}",
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
                "the file holds {actual} bytes where the header describes no index",
            ),
        }
    }
}

impl Error for OpenAttractionError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// An attraction file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own regions exactly. The
/// regions are borrowed straight from the whole-file mapping and start
/// 4096-byte aligned: aligned for every scalar and SIMD width. The
/// accessors expose geometry alone; the index's domain invariants are
/// `salt::relation`'s artifact contract.
#[derive(Debug)]
pub(crate) struct AttractionFile {
    map: PageMap,
}

impl AttractionFile {
    /// Opens and maps the attraction file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenAttractionError::Io`] when the file cannot be
    /// opened or mapped, [`OpenAttractionError::Header`] when its
    /// leading bytes are not a header this module speaks, and
    /// [`OpenAttractionError::Length`] when the file length contradicts
    /// the header's geometry.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenAttractionError> {
        let map = PageMap::open(path).map_err(OpenAttractionError::Io)?;

        let Some(bytes) = map.header_page() else {
            return Err(OpenAttractionError::Undersized { actual: map.len() });
        };

        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenAttractionError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenAttractionError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        let ptr = self.map.bytes().as_ptr().cast::<FileHeader>();

        // SAFETY: The map is valid for the lifetime of the file, immutable, and the constructor
        // validated that the map is large enough to contain the header and that its bytes parse
        // as one, so the deref target is a valid `FileHeader`.
        unsafe { &*ptr }
    }

    /// Returns the corpus row count `N` the edges index into.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.header().rows()
    }

    /// Views the relation groups, in file order.
    #[must_use]
    pub(crate) fn groups(&self) -> &[GroupRecord] {
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        let bytes = self.map.region(
            FileHeader::SIZE as u64,
            self.header().groups() * size_of::<GroupRecord>() as u64,
        );

        <[GroupRecord]>::ref_from_bytes(bytes).expect("open validated the region size")
    }

    /// Views the edge records, in group-major order.
    #[must_use]
    pub(crate) fn edges(&self) -> &[EdgeRecord] {
        let bytes = self.map.region(
            self.header()
                .edges_offset()
                .expect("open validated the geometry"),
            self.header().edges() * size_of::<EdgeRecord>() as u64,
        );

        <[EdgeRecord]>::ref_from_bytes(bytes).expect("open validated the region size")
    }
}
