//! Opened postings files.

use core::{error::Error, fmt};
use std::path::Path;

use zerocopy::{FromBytes as _, LE, U32, U64};

use super::FileHeader;
use crate::file::region::{
    PAGE,
    header::{HeaderError, HeaderMap},
};

/// Opening a postings file failed.
#[derive(Debug)]
pub enum OpenPostingsError {
    /// Reading the header page failed.
    Header(HeaderError),
    /// The file length contradicts the header's geometry.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the header's geometry overflows `u64`, in which case it matches no real
        /// file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenPostingsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the postings file's header page: {error}"),
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
                "the file holds {actual} bytes where the header describes no postings",
            ),
        }
    }
}

impl Error for OpenPostingsError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Length { .. } => None,
        }
    }
}

/// A postings file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural rule, so an open file always
/// describes its own regions exactly. Each accessor borrows its region straight from the whole-file
/// mapping, and every region starts on a 4096-byte boundary, which aligns it for every scalar and
/// SIMD width. The accessors expose geometry alone. The membership and parent contracts are
/// `salt::postings`'s artifact contract.
#[derive(Debug)]
pub(crate) struct PostingsFile {
    map: HeaderMap<FileHeader>,
}

impl PostingsFile {
    /// Opens and maps the postings file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPostingsError::Header`] when the header page cannot be read, and
    /// [`OpenPostingsError::Length`] when the file length contradicts the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenPostingsError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenPostingsError::Header)?;

        let expected = map.header().expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenPostingsError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Returns the type count `T`.
    #[inline]
    #[must_use]
    pub(crate) fn types(&self) -> u64 {
        self.header().types()
    }

    /// Returns the point count `N`.
    #[inline]
    #[must_use]
    pub(crate) fn points(&self) -> u64 {
        self.header().points()
    }

    /// Views the representation flags.
    ///
    /// `ceil(T/64)` words, LSB-first, bit `t` set when type `t`'s membership run is a dense bitmap.
    #[must_use]
    pub(crate) fn flags(&self) -> &[U64<LE>] {
        // The offsets and products in the region reads repeat checked
        // computations open already accepted, so none of them can
        // overflow here.
        let bytes = self
            .map
            .map()
            .region(PAGE, self.header().flags_words() * size_of::<u64>() as u64);

        <[U64<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Views the `T + 1` membership fenceposts, in entry counts.
    #[must_use]
    pub(crate) fn membership_posts(&self) -> &[U64<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .membership_posts_offset()
                .expect("open validated the geometry"),
            self.posts_bytes(),
        );

        <[U64<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Views the `T + 1` parent fenceposts, in id counts.
    #[must_use]
    pub(crate) fn parent_posts(&self) -> &[U64<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .parent_posts_offset()
                .expect("open validated the geometry"),
            self.posts_bytes(),
        );

        <[U64<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Views the `P` parent ids, type-major.
    #[must_use]
    pub(crate) fn parent_ids(&self) -> &[U64<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .parent_ids_offset()
                .expect("open validated the geometry"),
            self.header().parent_edges() * size_of::<u64>() as u64,
        );

        <[U64<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Views the `M` membership entries, type-major.
    #[must_use]
    pub(crate) fn entries(&self) -> &[U32<LE>] {
        let bytes = self.map.map().region(
            self.header()
                .entries_offset()
                .expect("open validated the geometry"),
            self.header().entries() * size_of::<u32>() as u64,
        );

        <[U32<LE>]>::ref_from_bytes(bytes).expect("byte-order integers tolerate any alignment")
    }

    /// Returns the byte size of one fencepost region.
    fn posts_bytes(&self) -> u64 {
        self.header()
            .fencepost_count()
            .expect("open validated the geometry")
            * size_of::<u64>() as u64
    }
}
