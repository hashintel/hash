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

    pub fn len(&self) -> usize {
        self.len
    }

    pub fn is_empty(&self) -> bool {
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

    fn deref(&self) -> &Self::Target {
        let ptr = self.0.as_ptr().cast::<f32>();
        debug_assert!(
            ptr.is_aligned_to(align_of::<f32>()),
            "The data has been initially aligned for f32, and it's only f32 data, therefore any \
             subslice is trivially aligned for f32 as well"
        );
        debug_assert!(self.0.len().is_multiple_of(size_of::<f32>()));

        let len = self.0.len() / size_of::<f32>();
        unsafe { core::slice::from_raw_parts(ptr, len) }
    }
}
