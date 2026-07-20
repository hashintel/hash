//! Opened identity files.

use core::{error::Error, fmt};
use std::{io, path::Path};

use zerocopy::{
    TryFromBytes as _,
    error::{ConvertError, ValidityError},
};

use super::FileHeader;
use crate::file::region::PageMap;

/// Opening an identity file failed.
#[derive(Debug)]
pub enum OpenIdentityError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header(ValidityError<(), FileHeader>),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes; [`None`] when the header's
        /// geometry overflows `u64` or its width or stride is zero, in
        /// which case it matches no real file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenIdentityError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the identity file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => write!(
                fmt,
                "the leading bytes are not an identity file header: {error}",
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
                "the file holds {actual} bytes where the header describes no table",
            ),
        }
    }
}

impl Error for OpenIdentityError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// An identity file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own regions exactly. The
/// regions are borrowed straight from the whole-file mapping and start
/// 4096-byte aligned. Ids are opaque `K`-byte strings at this layer, so
/// the regions come out as raw bytes of validated length; the typed
/// table over them, and its domain invariants, are
/// `salt::fit::prepare::identity`'s contract.
#[derive(Debug)]
pub(crate) struct IdentityFile {
    map: PageMap,
}

impl IdentityFile {
    /// Opens and maps the identity file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenIdentityError::Io`] when the file cannot be opened
    /// or mapped, [`OpenIdentityError::Header`] when its leading bytes
    /// are not a header this module speaks, and
    /// [`OpenIdentityError::Length`] when the file length contradicts
    /// the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenIdentityError> {
        let map = PageMap::open(path).map_err(OpenIdentityError::Io)?;

        let Some(bytes) = map.header_page() else {
            return Err(OpenIdentityError::Undersized { actual: map.len() });
        };
        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenIdentityError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenIdentityError::Length { expected, actual });
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

    /// Returns the id width `K`, in bytes.
    #[inline]
    #[must_use]
    pub(crate) fn key_width(&self) -> u32 {
        self.header().key_width()
    }

    /// Returns the row count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn rows(&self) -> u64 {
        self.header().rows()
    }

    /// Returns the index stride: pairs per index key.
    #[inline]
    #[must_use]
    pub(crate) fn stride(&self) -> u32 {
        self.header().stride()
    }

    /// Views the id column: `N` ids of `K` bytes, in row order.
    #[must_use]
    pub(crate) fn ids(&self) -> &[u8] {
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        self.map.region(
            FileHeader::SIZE as u64,
            self.rows() * u64::from(self.key_width()),
        )
    }

    /// Views the index keys: one `K`-byte id per stride of pairs.
    #[must_use]
    pub(crate) fn index_keys(&self) -> &[u8] {
        let keys = self
            .header()
            .index_keys()
            .expect("open validated the stride");
        self.map.region(
            self.header()
                .index_offset()
                .expect("open validated the geometry"),
            keys * u64::from(self.key_width()),
        )
    }

    /// Views the lookup pairs: `N` entries of `K + 8` bytes, ascending
    /// by id bytes.
    #[must_use]
    pub(crate) fn pairs(&self) -> &[u8] {
        self.map.region(
            self.header()
                .pairs_offset()
                .expect("open validated the geometry"),
            self.rows() * self.header().pair_size(),
        )
    }
}
