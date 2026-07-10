//! Zero-copy row access to `f32` matrices stored in files.
//!
//! The sampling pipeline persists embeddings and layout coordinates as flat
//! files of raw `f32` values, row-major with a fixed number of values per
//! row. Those matrices are much larger than the rows any single training
//! step touches, so this module reads them through a shared, page-on-demand
//! mapping instead of loading them up front.
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

/// A read-only matrix of `f32` rows stored in a file.
///
/// Opening a file with [`FloatBytes::from_file`] maps it into memory instead
/// of reading it, so construction costs the same regardless of file size and
/// rows are only paged in when they are accessed. Values are interpreted in
/// native byte order, matching how the sampling pipeline writes them.
///
/// The file is shared-locked for the lifetime of the value, every clone, and
/// every [`Sample`] taken from it. The lock is advisory: cooperating writers
/// know not to touch the file while it is locked, but nothing stops an
/// unrelated process from modifying it. Cloning is cheap and shares the
/// underlying mapping.
#[derive(Debug, Clone)]
pub struct FloatBytes {
    data: Bytes,
    stride: usize,
    len: usize,
}

impl FloatBytes {
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

    /// Returns the row at `index`.
    ///
    /// This takes no copy: the returned [`Sample`] reads straight from the
    /// shared mapping, and the page is faulted in on first access.
    ///
    /// # Panics
    ///
    /// Panics when `index` is out of bounds, that is when
    /// `index >= self.len()`.
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
/// is cheap and shares the mapping; the row is only copied when the caller
/// copies it, for example when collating a training batch.
#[derive(Debug, Clone)]
pub struct Sample(Bytes);

impl Deref for Sample {
    type Target = [f32];

    #[expect(
        clippy::cast_ptr_alignment,
        reason = "see safety comment and debug asserts"
    )]
    fn deref(&self) -> &Self::Target {
        let ptr = self.0.as_ptr().cast::<f32>();
        debug_assert!(
            ptr.is_aligned_to(align_of::<f32>()),
            "The data has been initially aligned for f32, and it's only f32 data, therefore any \
             subslice is trivially aligned for f32 as well"
        );
        debug_assert!(self.0.len().is_multiple_of(size_of::<f32>()));

        let len = self.0.len() / size_of::<f32>();
        // SAFETY: The mapping is aligned for `f32` at construction, every row stride is
        // a whole multiple of `size_of::<f32>()`, and `Bytes` slicing never rebases the
        // buffer, so `ptr` is aligned and `len * 4` bytes are initialized and in bounds.
        unsafe { core::slice::from_raw_parts(ptr, len) }
    }
}
