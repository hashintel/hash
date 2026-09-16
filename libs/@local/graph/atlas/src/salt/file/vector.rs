use core::{error::Error, fmt, marker::PhantomData, ops::Deref, ptr::NonNull};
use std::path::Path;

use hashql_core::id::{Id, IdSlice};

use crate::{
    file::array::{ArrayFile, OpenArrayError},
    math::AlignedVecN,
};

/// A failure to open an array as SIMD-aligned fixed-width vectors.
#[derive(Debug)]
pub(crate) enum OpenVectorError {
    /// The underlying array file failed to open.
    Open(OpenArrayError),
    /// The element type, shape, or row stride cannot supply the requested aligned vectors.
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

/// A mapped fixed-width vector column with row domain `I`.
///
/// The row type distinguishes, for example, corpus and distinct-row columns at typed interfaces.
/// The file supplies shape and component bytes, not a row-domain identifier. Choose `I` to match
/// the artifact's provenance.
///
/// Every row satisfies [`AlignedVecN`]'s alignment invariant. `N` must be nonzero, and its byte
/// stride must preserve that alignment. Construction accepts non-finite and unnormalized vectors.
/// The mapped file must remain immutable under [`crate::file::region::PageMap`]'s file contract.
pub(crate) struct VectorFile<I, const N: usize> {
    /// The validated row slice within `_file`'s mapping, whose address survives handle moves.
    rows: NonNull<[AlignedVecN<N>]>,
    /// Owns the mapping and its shared advisory lock for the lifetime of `rows`.
    _file: ArrayFile,
    _marker: PhantomData<fn(&I)>,
}

impl<I, const N: usize> VectorFile<I, N>
where
    I: Id,
{
    /// Validates an array as SIMD-aligned rows of width `N`.
    ///
    /// Accepts native `f32[T, N]` or an empty native-`f32` array. `N` must satisfy the type's
    /// nonzero-width and alignment requirements, including for empty input.
    ///
    /// # Errors
    ///
    /// Returns [`OpenVectorError::InvalidArray`] for an incompatible element type, shape, or row
    /// stride.
    pub(crate) fn new(file: ArrayFile) -> Result<Self, OpenVectorError> {
        let rows: &[AlignedVecN<N>] = file.vectors().ok_or(OpenVectorError::InvalidArray)?;
        let rows = NonNull::from(rows);

        Ok(Self {
            _file: file,
            rows,
            _marker: PhantomData,
        })
    }

    /// Maps `path` as SIMD-aligned vector rows of width `N`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenVectorError`] for array open failures or an incompatible element type, shape,
    /// or row stride.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenVectorError> {
        ArrayFile::open(path)
            .map_err(OpenVectorError::from)
            .and_then(Self::new)
    }
}

// SAFETY: `Mmap` is Send and its mapped address survives moves. `rows` points to the validated
// aligned slice owned through `_file`, which keeps the mapping and lock alive. The marker stores no
// `I` value. Therefore transferring the handle preserves the row pointer and alignment under
// PageMap's immutable-file contract.
unsafe impl<I, const N: usize> Send for VectorFile<I, N> {}
// SAFETY: `Mmap` is Sync under its immutable-file contract. This handle exposes only shared vector
// borrows and never remaps or mutates the file. It stores no `I` value to share. Therefore shared
// access introduces no mutable alias or data race.
unsafe impl<I, const N: usize> Sync for VectorFile<I, N> {}

const impl<I, const N: usize> Deref for VectorFile<I, N>
where
    I: Id,
{
    type Target = IdSlice<I, AlignedVecN<N>>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: dereferencing this slice pointer requires shared access to a live initialized
        // range with every row at its promised SIMD alignment. `new` saved exactly the slice
        // returned by `ArrayFile::vectors`, and `_file` retains its mapping without moving the
        // mapped address. PageMap's immutable-file contract preserves those bytes, and the result
        // borrows no longer than `self`. Therefore dereferencing the stored pointer yields a valid
        // shared aligned slice.
        let rows = unsafe { &*self.rows.as_ptr() };
        IdSlice::from_raw(rows)
    }
}
