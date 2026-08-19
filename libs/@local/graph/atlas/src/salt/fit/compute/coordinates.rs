//! The published coordinate column as an owned, typed value.

use core::{error::Error, fmt, ops::Deref, ptr::NonNull};

use hashql_core::id::IdSlice;

use crate::{
    file::{
        array::{ArrayFile, OpenArrayError},
        generation::StagedGeneration,
        repository::RepositoryFile,
    },
    identity::NodeRowId,
    integrity::Sha256Digest,
    math::{FinitePointField, NonFinitePoint, Vec2},
    salt::fit::role::Role,
};

/// The staged coordinate column failed to open as a finite point field.
#[derive(Debug)]
pub(super) enum OpenCoordinatesError {
    /// The staged column failed to open as an array.
    Open(OpenArrayError),
    /// The array does not hold `f32` pairs.
    InvalidArray,
    /// The column carries a non-finite point.
    NonFinite(NonFinitePoint<NodeRowId>),
}

impl fmt::Display for OpenCoordinatesError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open(_) => fmt.write_str("the coordinate column does not open"),
            Self::InvalidArray => fmt.write_str("the coordinate column does not hold f32 pairs"),
            Self::NonFinite(source) => {
                write!(fmt, "the coordinate column is not finite: {source}")
            }
        }
    }
}

impl Error for OpenCoordinatesError {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        match self {
            Self::Open(error) => Some(error),
            Self::NonFinite(source) => Some(source),
            Self::InvalidArray => None,
        }
    }
}

/// The staged coordinate column, mapped, proven finite, and addressed by the corpus row domain.
///
/// The value is the fit's coordinates: it owns the mapping, carries the repository binding the
/// seal publishes, and dereferences to the proven point field. Finiteness is proven once at the
/// open, so every consumer downstream reads a [`FinitePointField`] and re-proves nothing.
pub(super) struct Coordinates {
    /// The staged column's repository binding.
    pub binding: RepositoryFile,
    /// The mapping. Held for its lifetime alone: every read goes through `points`.
    file: ArrayFile,
    /// The mapped point slice, validated as finite at construction.
    ///
    /// The pointee lives inside the mapping owned by `file`, whose address is stable under moves
    /// of this handle, so the pointer stays valid for exactly as long as the handle lives.
    points: NonNull<[Vec2]>,
}

impl Coordinates {
    /// Maps the staged coordinate column back under its sealed digest and proves it finite.
    ///
    /// # Errors
    ///
    /// Returns [`OpenCoordinatesError::Open`] when the staged column does not open as an array,
    /// [`OpenCoordinatesError::InvalidArray`] when the array does not hold `f32` pairs, and
    /// [`OpenCoordinatesError::NonFinite`] when a point of the column is not finite.
    pub(super) fn open(
        staging: &StagedGeneration,
        digest: Sha256Digest,
    ) -> Result<Self, OpenCoordinatesError> {
        let file = ArrayFile::open(staging.path_of(&Role::Coordinates.file_name()))
            .map_err(OpenCoordinatesError::Open)?;
        let points: &[Vec2] = file.points().ok_or(OpenCoordinatesError::InvalidArray)?;
        let points = FinitePointField::new(IdSlice::<NodeRowId, _>::from_raw(points))
            .map_err(OpenCoordinatesError::NonFinite)?;
        let points = NonNull::from(points.as_slice().as_raw());

        Ok(Self {
            binding: Role::Coordinates.file(digest),
            file,
            points,
        })
    }
}

// SAFETY: the mapping is read-only for the handle's whole life, `points` points into memory
// owned by `file` within the same value, and no interior mutability exists, so moving the handle
// or sharing it across threads leaves every read valid.
unsafe impl Send for Coordinates {}
// SAFETY: shared access only ever reads the immutable mapping. See the `Send` proof above.
unsafe impl Sync for Coordinates {}

impl Deref for Coordinates {
    type Target = FinitePointField<NodeRowId>;

    fn deref(&self) -> &Self::Target {
        // SAFETY: `points` was derived from the mapping owned by `self.file` at construction, the
        // mapping is immutable and lives as long as `self`, and the returned borrow is tied to
        // `&self`, so the pointee is valid and unaliased by writes for the borrow's life.
        let points = unsafe { &*self.points.as_ptr() };
        // Finiteness was proven over these exact bytes at the open, and the mapping is immutable.
        FinitePointField::new_unchecked(IdSlice::from_raw(points))
    }
}
