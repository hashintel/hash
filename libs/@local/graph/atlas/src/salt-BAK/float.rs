//! Zero-copy row access to `f32` matrices backed by files or owned memory.
//!
//! The sampling pipeline persists embeddings and layout coordinates as flat
//! files of raw `f32` values, row-major with a fixed number of values per
//! row. Those matrices are read through a shared, page-on-demand mapping.
//! Intermediate matrices can instead transfer an owned `Vec<f32>` into the
//! same shared [`Bytes`] storage without writing them to disk.
//!
//! The primary type is [`FloatBytes`], which opens such a file and hands out
//! individual rows as [`Sample`]s. Both are cheap to clone and share one
//! mapping, which is what lets dataloader workers on several threads pull
//! rows from the same file without copying it.
#![expect(unsafe_code)]
use core::{num::NonZero, ops::Deref};
use std::{fs::File, io};

use bytes::Bytes;

/// Keeps the mapping and the shared file lock alive together.
///
/// [`Bytes::from_owner`] drops the owner only once every clone and slice of
/// the buffer is gone, so the lock is held exactly as long as any
/// [`FloatBytes`] or [`Sample`] can still read the mapped memory.
struct LockedBytes {
    mmap: memmap2::Mmap,
    _file: File, // retained for the lock
}

impl AsRef<[u8]> for LockedBytes {
    fn as_ref(&self) -> &[u8] {
        self.mmap.as_ref()
    }
}

#[derive(Debug)]
struct OwnedFloats(Vec<f32>);

impl AsRef<[u8]> for OwnedFloats {
    fn as_ref(&self) -> &[u8] {
        let values = self.0.as_slice();
        // SAFETY: `u8` has alignment one, every initialized `f32` consists of exactly
        // `size_of::<f32>()` initialized bytes, and the byte slice shares the lifetime of `values`.
        unsafe { core::slice::from_raw_parts(values.as_ptr().cast::<u8>(), size_of_val(values)) }
    }
}

/// A read-only matrix of `f32` rows backed by shared bytes.
///
/// Opening a file with [`FloatBytes::from_file`] maps it into memory instead
/// of reading it, so construction costs the same regardless of file size and
/// rows are only paged in when they are accessed. [`FloatBytes::from_vec`]
/// instead retains an existing allocation directly. Values use native byte
/// order in both cases.
///
/// File-backed storage is shared-locked for the lifetime of the value, every
/// clone, and every [`Sample`] taken from it. The lock is advisory: cooperating
/// writers know not to touch the file while it is locked, but nothing stops an
/// unrelated process from modifying it. Cloning either backing is cheap and
/// shares the underlying bytes.
#[derive(Debug, Clone)]
pub struct FloatBytes {
    data: Bytes,
    stride: usize,
    len: usize,
}

impl FloatBytes {
    /// Copies native-endian floats into shared owned storage.
    ///
    /// Prefer [`Self::from_vec`] when the caller already owns the allocation.
    ///
    /// # Errors
    ///
    /// Returns an error when `values` is not a whole number of `dim`-value
    /// rows.
    pub fn from_slice(values: &[f32], dim: NonZero<usize>) -> io::Result<Self> {
        Self::from_vec(values.to_vec(), dim)
    }

    /// Transfers a vector of native-endian floats into shared storage without copying it.
    ///
    /// # Errors
    ///
    /// Returns an error when `values` is not a whole number of `dim`-value
    /// rows.
    pub fn from_vec(values: Vec<f32>, dim: NonZero<usize>) -> io::Result<Self> {
        let dimensions = dim.get();

        if !values.len().is_multiple_of(dimensions) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "buffer holds {} f32 values, which is not a whole number of {dim}-value rows",
                    values.len()
                ),
            ));
        }

        let stride = dimensions.checked_mul(size_of::<f32>()).ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "f32 row stride exceeds usize")
        })?;

        let len = values.len() / dimensions;
        let data = Bytes::from_owner(OwnedFloats(values));

        Ok(Self { data, stride, len })
    }

    /// Maps a file of raw `f32` values as a matrix with `dim` values per row.
    ///
    /// The file must contain nothing but whole rows: its size has to be a
    /// multiple of `dim * 4` bytes. An empty file is valid and yields a
    /// matrix with zero rows.
    ///
    /// # Errors
    ///
    /// This returns an error when the file is already locked exclusively by
    /// another process, when the mapping cannot be created, or when the file
    /// size is not a whole number of rows. The size check catches truncated
    /// files and files written with a different `dim` before they can feed
    /// garbage rows into training.
    #[expect(clippy::missing_panics_doc, clippy::panic_in_result_fn)]
    pub fn from_file(file: File, dim: NonZero<usize>) -> io::Result<Self> {
        file.try_lock_shared()?;

        // SAFETY: The file is shared-locked above, so cooperating processes won't
        // truncate or rewrite it while mapped. The lock is advisory, so this is a
        // convention we rely on, not a guarantee the OS enforces.
        let mmap = unsafe { memmap2::Mmap::map(&file)? };
        let len = mmap.len();

        #[cfg(unix)]
        mmap.advise(memmap2::Advice::Random)?;

        assert!(
            mmap.as_ptr().is_aligned_to(align_of::<f32>()),
            "mmap memory is aligned at a page boundary, and should therefore be trivially aligned \
             for f32"
        );

        let stride = dim.get() * size_of::<f32>();
        if !len.is_multiple_of(stride) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "file holds {len} bytes, which is not a whole number of {dim}-value f32 rows \
                     ({stride} bytes per row); the file is likely truncated or was written with a \
                     different row width"
                ),
            ));
        }

        let bytes = Bytes::from_owner(LockedBytes { mmap, _file: file });

        Ok(Self {
            data: bytes,
            stride,
            len: len / stride,
        })
    }

    /// Returns the number of rows in the matrix.
    pub const fn len(&self) -> usize {
        self.len
    }

    /// Returns the number of `f32` values per row.
    ///
    /// This is the `dim` the matrix was opened with.
    pub const fn dim(&self) -> usize {
        self.stride / size_of::<f32>()
    }

    /// Returns `true` when the matrix has no rows.
    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Borrows the row at `index` as native-endian floats.
    ///
    /// This takes no copy and does not clone the shared mapping handle, which makes it suitable for
    /// tight numerical loops that already borrow the matrix.
    ///
    /// # Panics
    ///
    /// Panics when `index` is out of bounds, that is when `index >= self.len()`.
    pub fn row(&self, index: usize) -> &[f32] {
        let start = index * self.stride;
        native_floats(&self.data[start..start + self.stride])
    }

    /// Returns the row at `index` while retaining the mapping independently.
    ///
    /// This takes no copy: the returned [`Sample`] reads straight from the shared mapping, and the
    /// page is faulted in on first access. Prefer [`FloatBytes::row`] when the row does not need to
    /// outlive the matrix borrow.
    ///
    /// # Panics
    ///
    /// Panics when `index` is out of bounds, that is when `index >= self.len()`.
    pub fn sample(&self, index: usize) -> Sample {
        let bytes = self
            .data
            .slice(index * self.stride..(index + 1) * self.stride);

        Sample(bytes)
    }
}

/// One row of a [`FloatBytes`] matrix.
///
/// A sample behaves like a `&[f32]` of length [`FloatBytes::dim`]. Cloning
/// is cheap and shares the backing storage; the row is only copied when the
/// caller copies it, for example when collating a training batch.
#[derive(Debug, Clone)]
pub struct Sample(Bytes);

impl Deref for Sample {
    type Target = [f32];

    fn deref(&self) -> &Self::Target {
        native_floats(&self.0)
    }
}

#[expect(
    clippy::cast_ptr_alignment,
    reason = "see safety comment and debug assertions"
)]
fn native_floats(bytes: &[u8]) -> &[f32] {
    let ptr = bytes.as_ptr().cast::<f32>();
    debug_assert!(
        ptr.is_aligned_to(align_of::<f32>()),
        "The data was initially aligned for f32 and row offsets are whole f32 values"
    );
    debug_assert!(bytes.len().is_multiple_of(size_of::<f32>()));

    let len = bytes.len() / size_of::<f32>();
    // SAFETY: The mapping is aligned for `f32` at construction, every row stride is a whole
    // multiple of `size_of::<f32>()`, and both borrowed and owned row slices preserve that
    // alignment. Therefore `ptr` is aligned and `len * 4` bytes are initialized and in bounds.
    unsafe { core::slice::from_raw_parts(ptr, len) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retains_owned_float_allocation_without_copying() {
        let values = vec![1.0, 2.0, 3.0, 4.0];
        let pointer = values.as_ptr();
        let matrix = FloatBytes::from_vec(values, const { NonZero::new(2).unwrap() })
            .expect("values contain whole rows");

        assert_eq!(matrix.row(0).as_ptr(), pointer);
        assert_eq!(matrix.row(0), [1.0, 2.0]);
        assert_eq!(matrix.row(1), [3.0, 4.0]);
    }
}
