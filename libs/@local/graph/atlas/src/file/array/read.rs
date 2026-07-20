//! Opened array files.

use core::{error::Error, fmt};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{FromBytes as _, TryFromBytes as _, error::ConvertError};

use super::{ArrayShape, ArrayVariant, FileHeader};
use crate::{
    integrity::Sha256Digest,
    math::{AlignedVecN, Vec2},
};

/// Opening an array file failed.
#[derive(Debug)]
pub enum OpenArrayError {
    /// The file could not be opened or mapped.
    Io(io::Error),
    /// The file is shorter than one header.
    Undersized { actual: u64 },
    /// The leading bytes are not a header this module speaks.
    Header,
    /// The file length contradicts the header's shape.
    Length {
        /// The length the header describes; [`None`] when the shape's
        /// byte length overflows `u64` and matches no real file.
        expected: Option<u64>,
        actual: u64,
    },
}

impl fmt::Display for OpenArrayError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(fmt, "the array file could not be read: {error}"),
            Self::Undersized { actual } => write!(
                fmt,
                "the file holds {actual} bytes, fewer than the {}-byte header",
                FileHeader::SIZE,
            ),
            Self::Header => {
                write!(
                    fmt,
                    "the leading bytes are not an array-file header: The conversion failed \
                     because the source bytes are not a valid value of the destination type."
                )
            }
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
                "the file holds {actual} bytes where the header's byte length overflows",
            ),
        }
    }
}

impl Error for OpenArrayError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Header | Self::Undersized { .. } | Self::Length { .. } => None,
        }
    }
}

/// An array file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own data exactly. The data
/// is borrowed straight from the whole-file mapping and therefore starts
/// 4096-byte aligned: aligned for every scalar and SIMD width, so typed
/// views over it never fail for alignment.
#[derive(Debug)]
pub(crate) struct ArrayFile {
    map: Mmap,
}

impl ArrayFile {
    /// Opens and maps the array file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenArrayError::Io`] when the file cannot be opened or
    /// mapped, [`OpenArrayError::Header`] when its leading bytes are not
    /// a header this module speaks, and [`OpenArrayError::Length`] when
    /// the file length contradicts the header's shape.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenArrayError> {
        let file = File::open(path).map_err(OpenArrayError::Io)?;
        // SAFETY: published artifact files are immutable (the `crate::file`
        // publish contract: temporary path, rename into place, never
        // rewritten), so the mapped bytes cannot change beneath the borrow.
        let map = unsafe { Mmap::map(&file) }.map_err(OpenArrayError::Io)?;

        let Some(bytes) = map.get(..FileHeader::SIZE) else {
            return Err(OpenArrayError::Undersized {
                actual: map.len() as u64,
            });
        };
        let header = match FileHeader::try_read_from_bytes(bytes) {
            Ok(header) => header,
            Err(ConvertError::Validity(_)) => {
                return Err(OpenArrayError::Header);
            }
            Err(ConvertError::Size(_)) => {
                unreachable!("the slice is exactly one header long")
            }
        };

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenArrayError::Length { expected, actual });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    pub(crate) fn header(&self) -> &FileHeader {
        let ptr = self.map.as_ptr().cast::<FileHeader>();

        // SAFETY: The map is valid for the lifetime of the file, immutable, and we have validated
        // in the constructor that the map is large enough to contain the header and that its bytes
        // parse as one, so the deref target is a valid `FileHeader`.
        // We could use `try_from_bytes` here, but that would make that validation at every call
        // site.
        unsafe { &*ptr }
    }

    /// Returns the element variant.
    #[inline]
    #[must_use]
    pub(crate) fn variant(&self) -> ArrayVariant {
        self.header().variant()
    }

    /// Borrows the shape.
    #[inline]
    #[must_use]
    pub(crate) fn shape(&self) -> &ArrayShape {
        &self.header().shape
    }

    /// Borrows the packed elements, 4096-byte aligned.
    #[inline]
    #[must_use]
    pub(crate) fn data(&self) -> &[u8] {
        &self.map[FileHeader::SIZE..]
    }

    /// Views the data as `N`-component SIMD-aligned vectors.
    ///
    /// The view exists exactly when the file holds `f32` elements shaped
    /// `[T, N]`; the returned slice holds the `T` rows in order. A
    /// zero-element file is zero vectors of every dimension, since its
    /// shape records no row width.
    #[must_use]
    pub(crate) fn vectors<const N: usize>(&self) -> Option<&[AlignedVecN<N>]> {
        if self.header().variant() != ArrayVariant::F32 {
            return None;
        }

        match self.header().shape.dims() {
            [] => {}
            &[_, width] if width.get() == N as u64 => {}
            _ => return None,
        }

        let components = <[f32]>::ref_from_bytes(self.data()).ok()?;
        AlignedVecN::from_slice(components)
    }

    /// Views the data as 2D points in row order.
    ///
    /// The view exists exactly when the file holds `f32` elements shaped
    /// `[T, 2]`; the returned slice holds the `T` points in order. A
    /// zero-element file is zero points, since its shape records no row
    /// width.
    #[must_use]
    pub(crate) fn points(&self) -> Option<&[Vec2]> {
        if self.header().variant() != ArrayVariant::F32 {
            return None;
        }

        match self.header().shape.dims() {
            [] => {}
            &[_, width] if width.get() == 2 => {}
            _ => return None,
        }

        <[Vec2]>::ref_from_bytes(self.data()).ok()
    }

    /// Views the data as packed `f32` elements in row-major file order.
    ///
    /// The view exists exactly when the file holds `f32` elements,
    /// whatever its shape.
    #[must_use]
    pub(crate) fn f32_elements(&self) -> Option<&[f32]> {
        if self.header().variant() != ArrayVariant::F32 {
            return None;
        }

        <[f32]>::ref_from_bytes(self.data()).ok()
    }

    /// Views the data as packed `u32` elements in row-major file order.
    ///
    /// The view exists exactly when the file holds `u32` elements,
    /// whatever its shape.
    #[must_use]
    pub(crate) fn u32_elements(&self) -> Option<&[u32]> {
        if self.header().variant() != ArrayVariant::U32 {
            return None;
        }

        <[u32]>::ref_from_bytes(self.data()).ok()
    }

    /// Views the data as `u64` pairs in row order.
    ///
    /// The view exists exactly when the file holds `u64` elements shaped
    /// `[T, 2]`; the returned slice holds the `T` pairs in order. A
    /// zero-element file is zero pairs, since its shape records no row
    /// width.
    #[must_use]
    pub(crate) fn u64_pairs(&self) -> Option<&[[u64; 2]]> {
        if self.header().variant() != ArrayVariant::U64 {
            return None;
        }

        match self.header().shape.dims() {
            [] => {}
            &[_, width] if width.get() == 2 => {}
            _ => return None,
        }

        <[[u64; 2]]>::ref_from_bytes(self.data()).ok()
    }

    /// Views the data as SHA-256 digests in row order.
    ///
    /// The view exists exactly when the file holds `u8` elements shaped
    /// `[T, 32]`; the returned slice holds the `T` digests in order. A
    /// zero-element file is zero digests, since its shape records no
    /// row width.
    #[must_use]
    pub(crate) fn digests(&self) -> Option<&[Sha256Digest]> {
        if self.header().variant() != ArrayVariant::U8 {
            return None;
        }

        match self.header().shape.dims() {
            [] => {}
            &[_, width] if width.get() == 32 => {}
            _ => return None,
        }

        <[Sha256Digest]>::ref_from_bytes(self.data()).ok()
    }
}
