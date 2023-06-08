//! Each shared memory segment is made up of a set of [`Markers`] and Buffers. The Markers are
//! stored at the start of the segment, and consist of pairs of values for each buffer, the offset
//! (i.e. start index in bytes) and size (i.e. number of bytes). These are laid out contiguously in
//! bytes, in 8 `u64`s next to each other, in the order of the buffers described below. (So the
//! first two u64s are the markers for the schema buffer, the next two are for the header buffer,
//! and so on.)
//!
//! The four buffers are:
//! * The schema buffer -- if the segment has an Arrow record batch, then the schema buffer
//!   optionally contains the bytes of the serialized Arrow schema of that batch.
//! * The header buffer -- this contains the metaversion (memory version, then batch version) of the
//!   written data, followed by an optional name, e.g. the name of a dataset.
//! * The metadata buffer -- if the segment has an Arrow record batch, then this contains the Arrow
//!   metadata part of the batch.
//! * The data buffer -- if the segment has an Arrow record batch, then this contains the Arrow data
//!   part of the batch. Otherwise, this can contain arbitrary data, e.g. datasets.
//!
//! If the segment has an Arrow record batch, then the metadata and data buffers above together form
//! the batch in Arrow format.

// TODO: Make separate (i.e. fifth), fixed-size marker and buffer for (memory part of?) metaversion?
//       This would also require modifying memory loading in the language runners.

use std::{
    mem,
    ops::{Index, IndexMut},
};

use crate::shared_memory::{padding, ptr::MemoryPtr};

#[repr(usize)]
pub enum Val {
    SchemaOffset = 0,
    SchemaSize = 1,
    HeaderOffset = 2,
    HeaderSize = 3,
    MetaOffset = 4,
    MetaSize = 5,
    DataOffset = 6,
    DataSize = 7,
    // TODO: Incorporate `Metaversions` into the markers directly:
    // MetaVersions: 8,
}

#[repr(usize)]
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum Buffer {
    Schema = Val::SchemaSize as usize,
    Header = Val::HeaderSize as usize,
    Meta = Val::MetaSize as usize,
    Data = Val::DataSize as usize,
}

impl Buffer {
    pub fn next_offset(&self, offset: usize, size: usize) -> usize {
        let end_offset = offset + size;
        let padding = match self {
            Buffer::Schema => padding::get_static_buffer_pad(end_offset),
            Buffer::Header => padding::get_static_buffer_pad(end_offset),
            Buffer::Meta => padding::get_static_buffer_pad(end_offset),
            Buffer::Data => 0,
        };
        end_offset + padding
    }

    pub fn next(&self) -> Option<Buffer> {
        match self {
            Buffer::Schema => Some(Buffer::Header),
            Buffer::Header => Some(Buffer::Meta),
            Buffer::Meta => Some(Buffer::Data),
            Buffer::Data => None,
        }
    }

    pub fn previous(&self) -> Option<Buffer> {
        match self {
            Buffer::Schema => None,
            Buffer::Header => Some(Buffer::Schema),
            Buffer::Meta => Some(Buffer::Header),
            Buffer::Data => Some(Buffer::Meta),
        }
    }

    pub fn last() -> Buffer {
        Buffer::Data
    }
}

/// Helper struct to deal with different subcomponent offsets and pads
#[repr(C)]
#[derive(Debug, Clone)]
pub struct Markers {
    inner: [u64; 8],
}

impl Markers {
    /// Each marker is a u64, so it has 8 bytes.
    pub const MARKER_SIZE: usize = mem::size_of::<u64>();
    // Markers:
    // 1) Header offset, 2) Header size, 3) Schema offset, 4) Schema size,
    // 5) Meta offset,   6) Meta size,   7) Data offset,   8) Data size
    pub const NUMBER_OF_MARKERS: usize = 8;
    const TOTAL_MARKERS_SIZE: usize = Self::MARKER_SIZE * Self::NUMBER_OF_MARKERS;
    const TOTAL_OFFSETS_SIZE: usize =
        Self::TOTAL_MARKERS_SIZE + padding::pad_to_8(Self::TOTAL_MARKERS_SIZE);

    /// Get a mutable reference to the offsets buffer in the data
    ///
    /// # Safety
    ///
    /// Depends on if MemoryPtr is to a valid location (with correct alignment) in memory
    ///
    /// This is safe as:
    /// * Markers is of `repr(C)`
    pub fn new<'a>(mem: &MemoryPtr) -> &'a Markers {
        let values = unsafe { mem.read_mut_exact(0, Self::MARKER_SIZE * Self::NUMBER_OF_MARKERS) };
        let (_prefix, shorts, _suffix) = unsafe { values.align_to::<Markers>() };
        &shorts[0]
    }

    /// Get an immutable reference to the offsets buffer in the data
    ///
    /// # Safety
    ///
    /// Depends on if MemoryPtr is to a valid location (with correct alignment) in memory
    ///
    /// This is safe as:
    /// * Markers is of `repr(C)`
    pub fn new_mut<'a>(mem: &MemoryPtr) -> &'a mut Markers {
        let values = unsafe { mem.read_mut_exact(0, Self::MARKER_SIZE * Self::NUMBER_OF_MARKERS) };
        let (_prefix, shorts, _suffix) = unsafe { values.align_to_mut::<Markers>() };
        &mut shorts[0]
    }

    pub fn from_sizes(
        schema_size: usize,
        header_size: usize,
        meta_size: usize,
        data_size: usize,
    ) -> Markers {
        let schema_offset = Self::TOTAL_OFFSETS_SIZE;
        let header_offset = Buffer::Schema.next_offset(schema_offset, schema_size);
        let meta_offset = Buffer::Header.next_offset(header_offset, header_size);
        let data_offset = Buffer::Meta.next_offset(meta_offset, meta_size);

        Markers {
            inner: [
                schema_offset as u64,
                schema_size as u64,
                header_offset as u64,
                header_size as u64,
                meta_offset as u64,
                meta_size as u64,
                data_offset as u64,
                data_size as u64,
            ],
        }
    }
}

// Helper functions
impl Markers {
    pub fn schema_offset(&self) -> usize {
        self[Val::SchemaOffset] as usize
    }

    pub fn schema_size(&self) -> usize {
        self[Val::SchemaSize] as usize
    }

    pub fn header_offset(&self) -> usize {
        self[Val::HeaderOffset] as usize
    }

    pub fn header_size(&self) -> usize {
        self[Val::HeaderSize] as usize
    }

    pub fn meta_offset(&self) -> usize {
        self[Val::MetaOffset] as usize
    }

    pub fn meta_size(&self) -> usize {
        self[Val::MetaSize] as usize
    }

    pub fn data_offset(&self) -> usize {
        self[Val::DataOffset] as usize
    }

    pub fn data_size(&self) -> usize {
        self[Val::DataSize] as usize
    }

    #[must_use]
    pub fn get_total_contents_size(&self) -> usize {
        debug_assert_eq!(
            Buffer::Data.next(),
            None,
            "If the data buffer is not the last buffer, then the markers implementation needs to \
             be updated"
        );
        // The end of the last buffer is the end of the whole segment.
        self.data_offset() + self.data_size()
    }

    #[must_use]
    pub fn buffer_can_be_extended_to(&self, buffer: &Buffer, total_size: usize) -> usize {
        let this_buffer_offset = self.buffer_offset(buffer);
        let next_buffer_offset = buffer
            .next()
            .map_or(total_size, |b| self.inner[b as usize - 1] as usize);
        next_buffer_offset - this_buffer_offset
    }

    pub fn extend_buffer_with_shift(&mut self, buffer: &Buffer, size: usize) {
        let offset = self.buffer_offset(buffer);
        let mut next_buffer_offset = buffer.next_offset(offset, size);
        let mut next = buffer.next();
        while let Some(next_buffer) = next {
            *self.buffer_offset_mut(&next_buffer) = next_buffer_offset as u64;
            let next_buffer_size = self[next_buffer] as usize;
            next_buffer_offset = next_buffer.next_offset(next_buffer_offset, next_buffer_size);
            next = next_buffer.next();
        }
    }

    pub fn buffer_offset(&self, buffer: &Buffer) -> usize {
        self.inner[*buffer as usize - 1] as usize
    }

    fn buffer_offset_mut(&mut self, buffer: &Buffer) -> &mut u64 {
        &mut self.inner[*buffer as usize - 1]
    }
}

impl Index<Val> for Markers {
    type Output = u64;

    fn index(&self, index: Val) -> &Self::Output {
        &self.inner[index as usize]
    }
}

impl IndexMut<Val> for Markers {
    fn index_mut(&mut self, index: Val) -> &mut Self::Output {
        &mut self.inner[index as usize]
    }
}

impl Index<Buffer> for Markers {
    type Output = u64;

    fn index(&self, index: Buffer) -> &Self::Output {
        &self.inner[index as usize]
    }
}

impl IndexMut<Buffer> for Markers {
    fn index_mut(&mut self, index: Buffer) -> &mut Self::Output {
        &mut self.inner[index as usize]
    }
}
