use core::{error::Error, fmt, marker::PhantomData, ops::Deref, ptr::NonNull};
use std::path::Path;

use hashql_core::id::{Id, IdSlice};

use crate::{
    file::{
        ArtifactFile as _,
        array::{ArrayFile, OpenArrayError},
    },
    math::{FinitePointField, NonFinitePoint, Vec2},
};

/// A failure to open an array as two-component points.
#[derive(Debug)]
pub(crate) enum OpenPointError {
    /// The underlying array file failed to open.
    Open(OpenArrayError),
    /// The array is not native `f32[T, 2]` or an empty native-`f32` array.
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

/// A mapped two-component point column with row domain `I`.
///
/// The row type distinguishes, for example, corpus and distinct-row point columns at typed
/// interfaces. The file itself supplies shape and component bytes, not a row-domain identifier.
/// Choose `I` to match the artifact's provenance.
///
/// Construction accepts finite and non-finite components. [`Self::finite`] checks every point and
/// retains the result in a [`FinitePointFile`]. The mapped file must remain immutable under
/// [`crate::file::region::PageMap`]'s file contract.
pub(crate) struct PointFile<I> {
    /// The validated row slice within `_file`'s mapping, whose address survives handle moves.
    rows: NonNull<[Vec2]>,
    /// Owns the mapping and its shared advisory lock for the lifetime of `rows`.
    _file: ArrayFile,
    _marker: PhantomData<fn(&I)>,
}

impl<I> PointFile<I>
where
    I: Id,
{
    /// Validates an array as a two-component point column.
    ///
    /// Accepts native `f32[T, 2]` or a header-only empty native-`f32` array.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPointError::InvalidArray`] for another element type or shape.
    pub(crate) fn new(file: ArrayFile) -> Result<Self, OpenPointError> {
        let rows = file.points().ok_or(OpenPointError::InvalidArray)?;
        let rows = NonNull::from(rows);

        Ok(Self {
            _file: file,
            rows,
            _marker: PhantomData,
        })
    }

    /// Maps `path` as a two-component point column.
    ///
    /// # Errors
    ///
    /// Returns [`OpenPointError`] for array open failures or a type/shape mismatch.
    pub(crate) fn open(path: impl AsRef<Path>) -> Result<Self, OpenPointError> {
        ArrayFile::open(path)
            .map_err(OpenPointError::from)
            .and_then(Self::new)
    }

    /// Validates every coordinate and retains the mapping as a [`FinitePointFile`].
    ///
    /// Validation takes O(T) time for T points. Later access reuses the check without rescanning or
    /// copying the points.
    ///
    /// # Errors
    ///
    /// Returns the smallest row whose point has a NaN or infinite component.
    pub(crate) fn finite(self) -> Result<FinitePointFile<I>, NonFinitePoint<I>> {
        let points = &*self;
        let _field = FinitePointField::new(points)?;

        Ok(FinitePointFile { inner: self })
    }
}

// SAFETY: `Mmap` is Send and its mapped address survives moves. `rows` points to the validated
// slice owned through `_file`, which keeps the mapping and lock alive. The marker stores no `I`
// value. Therefore transferring the handle preserves the row pointer's validity under PageMap's
// immutable-file contract.
unsafe impl<I> Send for PointFile<I> {}
// SAFETY: `Mmap` is Sync under its immutable-file contract. This handle exposes only shared point
// borrows and never remaps or mutates the file. It stores no `I` value to share. Therefore shared
// access introduces no mutable alias or data race.
unsafe impl<I> Sync for PointFile<I> {}

impl<I> Deref for PointFile<I>
where
    I: Id,
{
    type Target = IdSlice<I, Vec2>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: dereferencing a slice pointer requires a live, aligned, initialized range and
        // shared access for its borrow. `new` saved exactly the slice returned by
        // `ArrayFile::points`, and `_file` retains its mapping without moving the mapped address.
        // PageMap's immutable-file contract preserves those bytes, and the result borrows no longer
        // than `self`. Therefore the stored pointer may be read as this shared slice.
        let rows = unsafe { &*self.rows.as_ptr() };
        IdSlice::from_raw(rows)
    }
}

/// A mapped point column with finite coordinates.
///
/// [`PointFile::finite`] establishes finiteness once. Shared access preserves it without
/// rescanning, under the mapped file's immutability contract.
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

        // the direct cast avoids `new_unchecked`'s debug-only coordinate scan on every access.
        // SAFETY: `FinitePointField<I>` is transparent over `IdSlice<I, Vec2>`, preserving layout
        // and slice metadata. `PointFile::finite` checked these same rows, and the owned immutable
        // mapping retains both their storage and finiteness. The result shares `self`'s borrow
        // lifetime. Therefore the cast preserves the reference's validity and the finite-field
        // invariant.
        unsafe { &*(inner as *const FinitePointField<I>) }
    }
}
