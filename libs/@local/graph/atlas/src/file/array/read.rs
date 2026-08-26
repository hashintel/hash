//! Opened array files.

use core::{error::Error, fmt};
use std::path::Path;

use hashql_core::id::{Id, IdSlice};
use zerocopy::{FromBytes as _, LE, U64};

use super::{Architecture, ArrayVariant, FileHeader, write::ColumnScalar};
use crate::{
    file::region::{
        PAGE_BYTES,
        header::{HeaderError, HeaderMap},
    },
    integrity::Sha256Digest,
    math::{AlignedVecN, Vec2},
};

/// Opening an array file failed.
#[derive(Debug)]
pub enum OpenArrayError {
    /// Reading the header page failed.
    Header(HeaderError),
    /// The file length contradicts the header's shape.
    Length {
        /// The length the header describes.
        ///
        /// [`None`] when the shape's byte length overflows `u64` and matches no real file.
        expected: Option<u64>,
        actual: u64,
    },
    /// The other byte order wrote the file's native elements.
    ForeignArchitecture {
        /// The architecture that wrote the file.
        architecture: Architecture,
    },
}

impl fmt::Display for OpenArrayError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Header(error) => write!(fmt, "the array file's header page: {error}"),
            Self::ForeignArchitecture { architecture } => write!(
                fmt,
                "the file's elements are native to a {architecture} writer and unreadable on this \
                 architecture",
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
                "the file holds {actual} bytes where the header's byte length overflows",
            ),
        }
    }
}

impl Error for OpenArrayError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Header(error) => Some(error),
            Self::Length { .. } | Self::ForeignArchitecture { .. } => None,
        }
    }
}

/// An array file mapped read-only into memory.
///
/// Opening parses the header and checks the format's single structural rule, so an open file always
/// describes its own data exactly. Views borrow the data straight from the whole-file mapping,
/// which starts 4096-byte aligned: aligned for every scalar and SIMD width, so typed views over it
/// never fail for alignment.
#[derive(Debug)]
pub(crate) struct ArrayFile {
    map: HeaderMap<FileHeader>,
}

impl ArrayFile {
    /// Opens and maps the array file at `path`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenArrayError::Header`] when the header page cannot be read,
    /// [`OpenArrayError::Length`] when the file length contradicts the header's shape, and
    /// [`OpenArrayError::ForeignArchitecture`] when the other byte order wrote the file's native
    /// elements.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenArrayError> {
        let map = HeaderMap::<FileHeader>::open(path).map_err(OpenArrayError::Header)?;
        let header = map.header();

        let expected = header.expected_file_len();
        let actual = map.len();
        if expected != Some(actual) {
            return Err(OpenArrayError::Length { expected, actual });
        }

        if header.variant().byte_order_sensitive() && header.architecture() != Architecture::HOST {
            return Err(OpenArrayError::ForeignArchitecture {
                architecture: header.architecture(),
            });
        }

        Ok(Self { map })
    }

    /// Borrows the parsed header at the head of the mapping.
    #[inline]
    #[must_use]
    pub(crate) fn header(&self) -> &FileHeader {
        self.map.header()
    }

    /// Borrows the packed elements, 4096-byte aligned.
    #[inline]
    #[must_use]
    pub(crate) fn data(&self) -> &[u8] {
        &self.map.map().bytes()[PAGE_BYTES..]
    }

    /// Views the data as one typed column: the read form of a [`SizedColumn`] write.
    ///
    /// The element type stamps the variant and the trailing row shape at the write, and this
    /// view exists exactly when the file carries that stamp, so both directions read one law and
    /// a view under the wrong element type cannot exist. The empty shape is the zero-row column.
    ///
    /// [`SizedColumn`]: super::SizedColumn
    #[must_use]
    pub(crate) fn column<I, T>(&self) -> Option<&IdSlice<I, T>>
    where
        I: Id,
        T: ColumnScalar + zerocopy::FromBytes + zerocopy::KnownLayout,
    {
        if self.header().variant() != T::VARIANT {
            return None;
        }

        match self.header().shape.dims() {
            [] => {}
            [_, trailing @ ..] if trailing == T::TRAILING => {}
            _ => return None,
        }

        let elements = <[T]>::ref_from_bytes(self.data()).ok()?;
        Some(IdSlice::from_raw(elements))
    }

    /// Views the data as `N`-component SIMD-aligned vectors.
    ///
    /// The view exists exactly when the file holds `f32` elements shaped `[T, N]`; the returned
    /// slice holds the `T` rows in order. A zero-element file is zero vectors of every dimension,
    /// since its shape records no row width.
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
    /// The view exists exactly when the file holds `f32` elements shaped `[T, 2]`; the returned
    /// slice holds the `T` points in order. A zero-element file is zero points, since its shape
    /// records no row width.
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
    /// The view exists exactly when the file holds `f32` elements, whatever its shape. The elements
    /// are native: the open only admits files this host's byte order wrote.
    #[must_use]
    pub(crate) fn f32_elements(&self) -> Option<&[f32]> {
        if self.header().variant() != ArrayVariant::F32 {
            return None;
        }

        <[f32]>::ref_from_bytes(self.data()).ok()
    }

    // NOTE: **why** are they still used in tests? Makes no sense. Shouldn't they use `column()`
    /// Views the data as little-endian `u32` elements.
    ///
    /// The view exists exactly when the file holds little-endian `u32` elements in a flat shape;
    /// the empty shape is the zero-element file. The element type carries the byte order, so the
    /// view is exact on every architecture.
    #[must_use]
    #[cfg(test)]
    pub(crate) fn u32_le_elements(&self) -> Option<&[zerocopy::U32<LE>]> {
        use zerocopy::U32;

        if self.header().variant() != ArrayVariant::U32Le {
            return None;
        }

        match self.header().shape.dims() {
            [] | [_] => {}
            _ => return None,
        }

        <[U32<LE>]>::ref_from_bytes(self.data()).ok()
    }

    /// Views the data as little-endian `u64` elements.
    ///
    /// The view exists exactly when the file holds little-endian `u64` elements in a flat shape;
    /// the empty shape is the zero-element file. The element type carries the byte order, so the
    /// view is exact on every architecture.
    #[must_use]
    #[cfg(test)]
    pub(crate) fn u64_le_elements(&self) -> Option<&[U64<LE>]> {
        if self.header().variant() != ArrayVariant::U64Le {
            return None;
        }

        match self.header().shape.dims() {
            [] | [_] => {}
            _ => return None,
        }

        <[U64<LE>]>::ref_from_bytes(self.data()).ok()
    }

    /// Views the data as little-endian `u64` pairs in row order.
    ///
    /// The view exists exactly when the file holds little-endian `u64` elements shaped `[T, 2]`;
    /// the returned slice holds the `T` pairs in order. A zero-element file is zero pairs, since
    /// its shape records no row width. The element type carries the byte order, so the view is
    /// exact on every architecture.
    #[must_use]
    pub(crate) fn u64_le_pairs(&self) -> Option<&[[U64<LE>; 2]]> {
        if self.header().variant() != ArrayVariant::U64Le {
            return None;
        }

        match self.header().shape.dims() {
            [] => {}
            &[_, width] if width.get() == 2 => {}
            _ => return None,
        }

        <[[U64<LE>; 2]]>::ref_from_bytes(self.data()).ok()
    }

    /// Views the data as SHA-256 digests in row order.
    ///
    /// The view exists exactly when the file holds `u8` elements shaped `[T, 32]`; the returned
    /// slice holds the `T` digests in order. A zero-element file is zero digests, since its shape
    /// records no row width.
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
