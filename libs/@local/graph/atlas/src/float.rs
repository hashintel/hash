#![expect(unsafe_code)]
use core::{num::NonZero, ops::Deref};
use std::{fs::File, io};

use bytes::Bytes;

struct LockedBytes {
    mmap: memmap2::Mmap,
    _file: File, // retained for the lock
}

impl AsRef<[u8]> for LockedBytes {
    fn as_ref(&self) -> &[u8] {
        self.mmap.as_ref()
    }
}

#[derive(Debug, Clone)]
pub struct FloatBytes {
    data: Bytes,
    stride: usize,
    len: usize,
}

impl FloatBytes {
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

        let bytes = Bytes::from_owner(LockedBytes { mmap, _file: file });
        let stride = dim.get() * size_of::<f32>();
        let items = len.div_floor(stride);

        Ok(Self {
            data: bytes,
            stride,
            len: items,
        })
    }

    pub const fn len(&self) -> usize {
        self.len
    }

    /// Number of `f32` values per row.
    pub const fn dim(&self) -> usize {
        self.stride / size_of::<f32>()
    }

    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    pub fn sample(&self, index: usize) -> Sample {
        let bytes = self
            .data
            .slice(index * self.stride..(index + 1) * self.stride);

        Sample(bytes)
    }
}

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
