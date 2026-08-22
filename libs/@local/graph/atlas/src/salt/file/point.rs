//! Mapped representation matrices with their row domain in the handle type.

use core::{error::Error, fmt, marker::PhantomData, ops::Deref, ptr::NonNull};
use std::path::Path;

use hashql_core::id::{Id, IdSlice};

use crate::{
    file::array::{ArrayFile, OpenArrayError},
    math::{FinitePointField, NonFinitePoint, Vec2},
};

/// A coordinate or representation matrix failed to open as `f32` rows of the expected shape.
#[derive(Debug)]
pub(crate) enum OpenPointError {
    /// The underlying array file failed to open.
    Open(OpenArrayError),
    /// The array does not hold `f32` rows of the expected shape.
    InvalidArray,
}

impl From<OpenArrayError> for OpenPointError {
    fn from(error: OpenArrayError) -> Self {
        Self::Open(error)
    }
}

impl fmt::Display for OpenPointError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open(_) => fmt.write_str("the array file does not open"),
            Self::InvalidArray => {
                fmt.write_str("the array does not hold f32 rows of the expected shape")
            }
        }
    }
}

impl Error for OpenPointError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Open(error) => Some(error),
            Self::InvalidArray => None,
        }
    }
}

/// A mapped matrix of aligned `f32` rows, addressed by the row domain `I`.
///
/// The handle owns the mapping and is the matrix: it dereferences to the typed row slice, with
/// the row domain traveling in the type, so a corpus-row matrix and a distinct-row matrix are
/// different types a call cannot confuse. Where a theorem identifies two domains, the
/// identification lives with the theorem's owner - the quotient's `training()` reborrows the corpus
/// under the distinct domain instead of retyping the handle.
pub(crate) struct PointFile<I> {
    /// The mapping. Held for its lifetime alone: every read goes through `rows`.
    file: ArrayFile,
    /// The mapped row slice, validated at construction.
    ///
    /// The pointee lives inside the mapping owned by `file`, whose address is stable under moves
    /// of this handle, so the pointer stays valid for exactly as long as the handle lives.
    rows: NonNull<[Vec2]>,
    _marker: PhantomData<fn(&I)>,
}

impl<I> PointFile<I>
where
    I: Id,
{
    /// Validates an open array file as a matrix of aligned `f32` rows of width `N`.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPointError::InvalidArray`] when the array does not hold aligned `f32` rows
    /// of width `N`.
    pub(crate) fn new(file: ArrayFile) -> Result<Self, OpenPointError> {
        let rows = file.points().ok_or(OpenPointError::InvalidArray)?;
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
    /// Returns [`OpenPointError::Open`] when the file does not open as an array, and
    /// [`OpenPointError::InvalidArray`] when the array does not hold aligned `f32` rows of
    /// width `N`.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenPointError> {
        ArrayFile::open(path)
            .map_err(OpenPointError::from)
            .and_then(Self::new)
    }

    pub(crate) fn finite(self) -> Result<FinitePointFile<I>, NonFinitePoint<I>> {
        let points = &*self;
        let _field = FinitePointField::new(points)?;

        Ok(FinitePointFile { inner: self })
    }
}

// SAFETY: the mapping is read-only for the handle's whole life, `rows` points into memory owned
// by `file` within the same value, and no interior mutability exists, so moving the handle or
// sharing it across threads leaves every read valid.
unsafe impl<I> Send for PointFile<I> {}
// SAFETY: shared access only ever reads the immutable mapping. See the `Send` proof above.
unsafe impl<I> Sync for PointFile<I> {}

impl<I> Deref for PointFile<I>
where
    I: Id,
{
    type Target = IdSlice<I, Vec2>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: `rows` was derived from the mapping owned by `self.file` at construction, the
        // mapping is immutable and lives as long as `self`, and the returned borrow is tied to
        // `&self`, so the pointee is valid and unaliased by writes for the borrow's life.
        let rows = unsafe { &*self.rows.as_ptr() };
        IdSlice::from_raw(rows)
    }
}

pub(crate) struct FinitePointFile<I> {
    inner: PointFile<I>,
}

impl<I> Deref for FinitePointFile<I>
where
    I: Id,
{
    type Target = FinitePointField<I>;

    fn deref(&self) -> &Self::Target {
        let inner = &raw const *self.inner;

        // `new_unchecked` would re-run its debug assert over every point on each deref, so the
        // cast is taken directly.
        // SAFETY: `FinitePointField<I>` is `repr(transparent)` over `IdSlice<I, Vec2>`, so the
        // cast preserves the address and the slice metadata. Its finiteness invariant was proven
        // by `PointFile::finite` over these same rows at this handle's construction, and the
        // mapping is read-only for the handle's whole life, so the proof cannot rot. The borrow
        // is derived from `&self`, so the pointee outlives it.
        unsafe { &*(inner as *const FinitePointField<I>) }
    }
}
