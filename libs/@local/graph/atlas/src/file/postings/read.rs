//! Opened postings files.

use core::{error::Error, fmt};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{
    FromBytes as _, TryFromBytes as _,
    error::{ConvertError, ValidityError},
};

use super::FileHeader;

/// Opening a postings file failed.
#[derive(Debug)]
pub(crate) enum OpenPostingsError {
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

impl fmt::Display for OpenPostingsError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the postings file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header(error) => write!(
                fmt,
                "the leading bytes are not a postings file header: {error}",
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
                "the file holds {actual} bytes where the header describes no postings",
            ),
        }
    }
}

impl Error for OpenPostingsError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header(error) => Some(error),
            Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// A postings file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own regions exactly. The
/// regions are borrowed straight from the whole-file mapping and start
/// 4096-byte aligned: aligned for every scalar and SIMD width. The
/// accessors expose geometry alone; the membership and parent contracts
/// are `salt::postings`'s artifact contract.
#[derive(Debug)]
pub(crate) struct PostingsFile {
    map: Mmap,
}

impl PostingsFile {
    /// Opens and maps the postings file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPostingsError::Io`] when the file cannot be opened
    /// or mapped, [`OpenPostingsError::Header`] when its leading bytes
    /// are not a header this module speaks, and
    /// [`OpenPostingsError::Length`] when the file length contradicts
    /// the header's geometry.
    #[tracing::instrument(skip_all)]
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenPostingsError> {
        let file = File::open(path).map_err(OpenPostingsError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenPostingsError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenPostingsError::Undersized {
                actual: map.len() as u64,
            });
        };

        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(error)) => {
                return Err(OpenPostingsError::Header(error.map_src(|_| ())));
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenPostingsError::Length { expected, actual });
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

    /// Carves one region out of the mapping.
    fn region(&self, offset: u64, len: u64) -> &[u8] {
        // The offsets and products repeat checked computations open
        // already accepted, so none of them can overflow here.
        let offset = usize::try_from(offset).expect("a mapped offset fits the address space");
        let len = usize::try_from(len).expect("a mapped region fits the address space");

        &self.map[offset..offset + len]
    }

    /// Views the representation flags: `ceil(T/64)` words, LSB-first,
    /// bit `t` set when type `t`'s membership run is a dense bitmap.
    #[must_use]
    pub(crate) fn flags(&self) -> &[u64] {
        let bytes = self.region(
            FileHeader::SIZE as u64,
            self.header().flags_words() * size_of::<u64>() as u64,
        );

        <[u64]>::ref_from_bytes(bytes).expect("open validated the region size and alignment")
    }

    /// Views the `T + 1` membership fenceposts, in entry counts.
    #[must_use]
    pub(crate) fn membership_posts(&self) -> &[u64] {
        let bytes = self.region(
            self.header()
                .membership_posts_offset()
                .expect("open validated the geometry"),
            self.posts_bytes(),
        );

        <[u64]>::ref_from_bytes(bytes).expect("open validated the region size and alignment")
    }

    /// Views the `T + 1` parent fenceposts, in id counts.
    #[must_use]
    pub(crate) fn parent_posts(&self) -> &[u64] {
        let bytes = self.region(
            self.header()
                .parent_posts_offset()
                .expect("open validated the geometry"),
            self.posts_bytes(),
        );

        <[u64]>::ref_from_bytes(bytes).expect("open validated the region size and alignment")
    }

    /// Views the `P` parent ids, type-major.
    #[must_use]
    pub(crate) fn parent_ids(&self) -> &[u32] {
        let bytes = self.region(
            self.header()
                .parent_ids_offset()
                .expect("open validated the geometry"),
            self.header().parent_edges() * size_of::<u32>() as u64,
        );

        <[u32]>::ref_from_bytes(bytes).expect("open validated the region size and alignment")
    }

    /// Views the `M` membership entries, type-major.
    #[must_use]
    pub(crate) fn entries(&self) -> &[u32] {
        let bytes = self.region(
            self.header()
                .entries_offset()
                .expect("open validated the geometry"),
            self.header().entries() * size_of::<u32>() as u64,
        );

        <[u32]>::ref_from_bytes(bytes).expect("open validated the region size and alignment")
    }

    /// Returns the byte size of one fencepost region.
    fn posts_bytes(&self) -> u64 {
        self.header()
            .fencepost_count()
            .expect("open validated the geometry")
            * size_of::<u64>() as u64
    }
}
