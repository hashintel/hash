//! Opened array files.

use core::{error::Error, fmt};
use std::{fs::File, io, path::Path};

use memmap2::Mmap;
use zerocopy::{FromBytes as _, TryFromBytes as _};

use super::{ArrayShape, ArrayVariant, FileHeader};
use crate::math::AlignedVecN;

/// An array file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural
/// rule, so an open file always describes its own data exactly. The data
/// is borrowed straight from the whole-file mapping and therefore starts
/// 4096-byte aligned: aligned for every scalar and SIMD width, so typed
/// views over it never fail for alignment.
#[derive(Debug)]
pub(crate) struct ArrayFile {
    header: FileHeader,
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
            return Err(OpenArrayError::Header);
        };
        let Ok(header) = FileHeader::try_read_from_bytes(bytes) else {
            return Err(OpenArrayError::Header);
        };

        let expected = header.expected_file_len();
        let actual = map.len() as u64;
        if expected != Some(actual) {
            return Err(OpenArrayError::Length { expected, actual });
        }

        Ok(Self { header, map })
    }

    /// Returns the element variant.
    #[inline]
    #[must_use]
    pub(crate) const fn variant(&self) -> ArrayVariant {
        self.header.variant()
    }

    /// Borrows the shape.
    #[inline]
    #[must_use]
    pub(crate) const fn shape(&self) -> &ArrayShape {
        &self.header.shape
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
        if self.header.variant() != ArrayVariant::F32 {
            return None;
        }

        match self.header.shape.dims() {
            [] => {}
            &[_, width] if width.get() == N as u64 => {}
            _ => return None,
        }

        let components = <[f32]>::ref_from_bytes(self.data()).ok()?;
        AlignedVecN::from_slice(components)
    }
}

/// Opening an array file failed.
#[derive(Debug)]
pub(crate) enum OpenArrayError {
    /// The file could not be opened or mapped.
    Io(io::Error),
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
            Self::Header => fmt.write_str("the leading bytes are not an array-file header"),
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
            Self::Header | Self::Length { .. } => None,
        }
    }
}
