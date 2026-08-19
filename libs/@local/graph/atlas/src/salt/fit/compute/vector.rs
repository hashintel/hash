//! Mapped representation matrices with their row domain in the handle type.

use core::{error::Error, fmt, marker::PhantomData, ops::Deref, ptr::NonNull};
use std::path::Path;

use hashql_core::id::{Id, IdSlice};

use crate::{
    file::array::{ArrayFile, OpenArrayError},
    math::AlignedVecN,
};

/// A coordinate or representation matrix failed to open as `f32` rows of the expected shape.
#[derive(Debug)]
pub(crate) enum OpenVectorError {
    /// The underlying array file failed to open.
    Open(OpenArrayError),
    /// The array does not hold `f32` rows of the expected shape.
    InvalidArray,
}

impl From<OpenArrayError> for OpenVectorError {
    fn from(error: OpenArrayError) -> Self {
        Self::Open(error)
    }
}

impl fmt::Display for OpenVectorError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open(_) => fmt.write_str("the array file does not open"),
            Self::InvalidArray => {
                fmt.write_str("the array does not hold f32 rows of the expected shape")
            }
        }
    }
}

impl Error for OpenVectorError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Open(error) => Some(error),
            Self::InvalidArray => None,
        }
    }
}

/// A mapped matrix of aligned `f32` rows, addressed by the row domain `I`.
///
/// The handle owns the mapping and is the matrix: it dereferences to the typed row slice, and the
/// row domain travels in the type, so a corpus-row matrix and a distinct-row matrix are different
/// types a call cannot confuse. Where a theorem identifies two domains,
/// [`cast`](Self::cast) rebinds the same mapping under the other one.
pub(super) struct VectorFile<I, const N: usize> {
    /// The mapping. Held for its lifetime alone: every read goes through `rows`.
    file: ArrayFile,
    /// The mapped row slice, validated at construction.
    ///
    /// The pointee lives inside the mapping owned by `file`, whose address is stable under moves
    /// of this handle, so the pointer stays valid for exactly as long as the handle lives.
    rows: NonNull<[AlignedVecN<N>]>,
    _marker: PhantomData<fn(&I)>,
}

impl<I, const N: usize> VectorFile<I, N>
where
    I: Id,
{
    /// Validates an open array file as a matrix of aligned `f32` rows of width `N`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenVectorError::InvalidArray`] when the array does not hold aligned `f32` rows
    /// of width `N`.
    pub(super) fn new(file: ArrayFile) -> Result<Self, OpenVectorError> {
        let rows: &[AlignedVecN<N>] = file.vectors().ok_or(OpenVectorError::InvalidArray)?;
        let rows = NonNull::from(rows);

        Ok(Self {
            file,
            rows,
            _marker: PhantomData,
        })
    }

    /// Maps the file at `path` as a matrix of aligned `f32` rows of width `N`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenVectorError::Open`] when the file does not open as an array, and
    /// [`OpenVectorError::InvalidArray`] when the array does not hold aligned `f32` rows of
    /// width `N`.
    pub(super) fn open(path: impl AsRef<Path>) -> Result<Self, OpenVectorError> {
        ArrayFile::open(path)
            .map_err(OpenVectorError::from)
            .and_then(Self::new)
    }

    /// Rebinds the mapping under the row domain `J`.
    ///
    /// The bytes and the mapping stay the same, so the call is a domain retype rather than a
    /// copy. The caller owns the identification of the two domains, such as an identity quotient
    /// making the corpus rows the distinct rows.
    pub(super) fn cast<J>(self) -> VectorFile<J, N>
    where
        J: Id,
    {
        VectorFile {
            file: self.file,
            rows: self.rows,
            _marker: PhantomData,
        }
    }
}

// SAFETY: the mapping is read-only for the handle's whole life, `rows` points into memory owned
// by `file` within the same value, and no interior mutability exists, so moving the handle or
// sharing it across threads leaves every read valid.
unsafe impl<I, const N: usize> Send for VectorFile<I, N> {}
// SAFETY: shared access only ever reads the immutable mapping. See the `Send` proof above.
unsafe impl<I, const N: usize> Sync for VectorFile<I, N> {}

const impl<I, const N: usize> Deref for VectorFile<I, N>
where
    I: Id,
{
    type Target = IdSlice<I, AlignedVecN<N>>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: `rows` was derived from the mapping owned by `self.file` at construction, the
        // mapping is immutable and lives as long as `self`, and the returned borrow is tied to
        // `&self`, so the pointee is valid and unaliased by writes for the borrow's life.
        let rows = unsafe { &*self.rows.as_ptr() };
        IdSlice::from_raw(rows)
    }
}
