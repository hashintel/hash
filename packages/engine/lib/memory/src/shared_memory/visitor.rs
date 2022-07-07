// TODO: DOC: expand upon this description
//! Code to visit different regions of shared memory
//!
//! This module is the *sole* source of truth for keeping track of Arrow continuation bytes.

use std::ops::{Index, IndexMut};

use crate::{
    error::Result,
    shared_memory::{
        continuation::{arrow_continuation, buffer_without_continuation, CONTINUATION},
        markers::{Buffer, Markers},
        ptr::MemoryPtr,
        BufferChange, Segment,
    },
};

pub trait Visit<'mem: 'v, 'v> {
    fn ptr(&self) -> &MemoryPtr;
    fn markers(&self) -> &Markers;

    fn maybe_continuation(buffer: &Buffer) -> usize {
        match *buffer {
            Buffer::Schema => CONTINUATION,
            Buffer::Header => 0,
            Buffer::Meta => CONTINUATION,
            Buffer::Data => 0,
        }
    }

    fn markers_from_sizes(
        schema_size: usize,
        header_size: usize,
        meta_size: usize,
        data_size: usize,
    ) -> Markers {
        Markers::from_sizes(
            CONTINUATION + schema_size,
            header_size,
            CONTINUATION + meta_size,
            data_size,
        )
    }

    fn schema(&'v self) -> &'mem [u8] {
        unsafe {
            buffer_without_continuation(
                self.ptr()
                    .read_exact(self.markers().schema_offset(), self.markers().schema_size()),
            )
        }
    }

    fn header(&'v self) -> &'mem [u8] {
        unsafe {
            self.ptr()
                .read_exact(self.markers().header_offset(), self.markers().header_size())
        }
    }

    fn meta(&'v self) -> &'mem [u8] {
        unsafe {
            buffer_without_continuation(
                self.ptr()
                    .read_exact(self.markers().meta_offset(), self.markers().meta_size()),
            )
        }
    }

    fn data(&'v self) -> &'mem [u8] {
        unsafe {
            self.ptr()
                .read_exact(self.markers().data_offset(), self.markers().data_size())
        }
    }

    fn get_all_buffers(&'v self) -> Result<&'mem [u8]> {
        let total_contents_size = self.markers().get_total_contents_size();
        Ok(unsafe { self.ptr().read_exact(0, total_contents_size) })
    }

    fn target_total_size_accommodates_data_size(
        &self,
        target_total_size: usize,
        data_size: usize,
    ) -> bool {
        return self.markers().data_offset() + data_size <= target_total_size;
    }

    // Validation function for debugging
    fn validate_markers(&self, message: &str, size: usize) -> bool {
        let markers = self.markers();

        let res = markers.schema_offset() == Markers::NUMBER_OF_MARKERS * Markers::MARKER_SIZE
            && markers.schema_offset() + markers.schema_size() <= markers.header_offset()
            && markers.header_offset() + markers.header_size() <= markers.meta_offset()
            && markers.meta_offset() + markers.meta_size() <= markers.data_offset()
            && markers.data_offset() + markers.data_size() <= size;

        if !res {
            tracing::warn!(
                "Invalid markers in shared buffer with id {}. Markers: {:?}, Shared buffer size: \
                 {}",
                message,
                markers,
                size
            );
        }

        res
    }
}

pub(in crate::shared_memory) struct Visitor<'a> {
    ptr: MemoryPtr,
    markers: &'a Markers,
}

impl<'mem: 'v, 'v> Visit<'mem, 'v> for Visitor<'mem> {
    fn ptr(&self) -> &MemoryPtr {
        &self.ptr
    }

    fn markers(&self) -> &Markers {
        self.markers
    }
}

impl<'a> Visitor<'a> {
    pub fn new(ptr: MemoryPtr) -> Visitor<'a> {
        let markers = Markers::new(&ptr);
        Visitor { ptr, markers }
    }
}

pub(in crate::shared_memory) struct VisitorMut<'mem> {
    ptr: MemoryPtr,
    markers: &'mem mut Markers,
    memory: &'mem mut Segment,
}

impl<'mem: 'v, 'v> Visit<'mem, 'v> for VisitorMut<'mem> {
    fn ptr(&self) -> &MemoryPtr {
        &self.ptr
    }

    fn markers(&self) -> &Markers {
        self.markers
    }
}

impl<'mem: 'v, 'v> VisitorMut<'mem> {
    pub fn new(ptr: MemoryPtr, memory: &'mem mut Segment) -> VisitorMut<'mem> {
        let markers = Markers::new_mut(&ptr);
        VisitorMut {
            ptr,
            markers,
            memory,
        }
    }

    pub fn resize(&mut self, size: usize) -> Result<()> {
        self.memory.resize(size)?;
        self.ptr = MemoryPtr::from_memory(self.memory);
        self.markers = Markers::new_mut(&self.ptr);
        Ok(())
    }

    pub fn markers_mut(&mut self) -> &mut Markers {
        self.markers
    }

    pub fn set_data_length(&mut self, size: usize) -> Result<BufferChange> {
        self.prepare_buffer_write(&Buffer::Data, size)
    }

    #[cfg(not(target_os = "macos"))]
    pub fn shrink_with_data_length(&mut self, size: usize) -> Result<BufferChange> {
        use crate::{shared_memory::markers::Val, Error};

        let markers = self.markers_mut();
        if size >= markers.data_size() {
            return Err(Error::ExpectedSmallerNewDataSize(self.memory.id().into()));
        }
        markers[Val::DataSize] = size as u64;

        let total_size = markers.get_total_contents_size();

        self.memory.resize(total_size)?;
        self.ptr = MemoryPtr::from_memory(self.memory);
        Ok(BufferChange::new(false, true))
    }

    // Mutable access to subbuffers

    pub fn schema_mut(&'v self) -> &'mem mut [u8] {
        unsafe {
            self.ptr()
                .read_mut_exact(self.markers().schema_offset(), self.markers().schema_size())
        }
    }

    pub fn header_mut(&'v self) -> &'mem mut [u8] {
        unsafe {
            self.ptr()
                .read_mut_exact(self.markers().header_offset(), self.markers().header_size())
        }
    }

    pub fn meta_mut(&'v self) -> &'mem mut [u8] {
        unsafe {
            self.ptr()
                .read_mut_exact(self.markers().meta_offset(), self.markers().meta_size())
        }
    }

    pub fn data_mut(&'v self) -> &'mem mut [u8] {
        unsafe {
            self.ptr()
                .read_mut_exact(self.markers().data_offset(), self.markers().data_size())
        }
    }

    // Subbuffer write

    pub fn write_schema_buffer(&mut self, bytes: &[u8]) -> Result<BufferChange> {
        self.write_buffer(Buffer::Schema, bytes)
    }

    pub fn write_header_buffer(&mut self, bytes: &[u8]) -> Result<BufferChange> {
        self.write_buffer(Buffer::Header, bytes)
    }

    pub fn write_meta_buffer(&mut self, bytes: &[u8]) -> Result<BufferChange> {
        self.write_buffer(Buffer::Meta, bytes)
    }

    pub fn _write_data_buffer(&mut self, bytes: &[u8]) -> Result<BufferChange> {
        self.write_buffer(Buffer::Data, bytes)
    }

    pub fn write_schema_buffer_unchecked(&mut self, bytes: &[u8]) {
        self.write_buffer_unchecked(Buffer::Schema, bytes)
    }

    pub fn write_header_buffer_unchecked(&mut self, bytes: &[u8]) {
        self.write_buffer_unchecked(Buffer::Header, bytes)
    }

    pub fn write_meta_buffer_unchecked(&mut self, bytes: &[u8]) {
        self.write_buffer_unchecked(Buffer::Meta, bytes)
    }

    pub fn write_data_buffer_unchecked(&mut self, bytes: &[u8]) {
        self.write_buffer_unchecked(Buffer::Data, bytes)
    }

    pub fn write_buffer_unchecked(&mut self, buffer: Buffer, bytes: &[u8]) {
        let continuation = Self::maybe_continuation(&buffer);
        self[buffer][continuation..continuation + bytes.len()].copy_from_slice(bytes);
    }

    pub fn write_buffer(&mut self, buffer: Buffer, bytes: &[u8]) -> Result<BufferChange> {
        let continuation = Self::maybe_continuation(&buffer);
        let total_size = continuation + bytes.len();
        let res = self.prepare_buffer_write(&buffer, total_size)?;
        self[buffer][continuation..total_size].copy_from_slice(bytes);
        Ok(res)
    }

    fn prepare_buffer_write(&mut self, buffer: &Buffer, num_bytes: usize) -> Result<BufferChange> {
        let cur_accommodation_size = self
            .markers()
            .buffer_can_be_extended_to(buffer, self.memory.size);

        let shifted = cur_accommodation_size < num_bytes;

        let mut resized = false;
        if shifted {
            self.markers_mut()[*buffer] = num_bytes as u64;

            let old_markers = self.markers().clone();
            self.markers_mut()
                .extend_buffer_with_shift(buffer, num_bytes);

            let min_size = self.markers().get_total_contents_size();
            resized = min_size > self.memory.size;

            if resized {
                self.resize(min_size)?;
            }

            let mut next = Buffer::last();
            // TODO(optimization) consider hardcoding/macros
            while next != *buffer {
                let old_offset = old_markers.buffer_offset(&next);
                let len = old_markers[next] as usize;
                let new_offset = self.markers().buffer_offset(&next);
                if old_offset != new_offset {
                    self.get_all_mut()
                        .copy_within(old_offset..old_offset + len, new_offset);
                }

                if let Some(prev) = next.previous() {
                    next = prev;
                } else {
                    break;
                }
            }
        }
        self.markers_mut()[*buffer] = num_bytes as u64;
        self.write_continuations();

        Ok(BufferChange::new(shifted, resized))
    }

    pub fn write_schema_continuation(&self) {
        let markers = self.markers();
        let schema_continuation = unsafe {
            self.ptr()
                .read_mut_exact(markers.schema_offset(), CONTINUATION)
        };
        schema_continuation.copy_from_slice(&arrow_continuation(
            markers.header_offset() - markers.schema_offset() - CONTINUATION,
        ));
    }

    pub fn write_meta_continuation(&self) {
        let markers = self.markers();
        let schema_continuation = unsafe {
            self.ptr()
                .read_mut_exact(markers.meta_offset(), CONTINUATION)
        };
        schema_continuation.copy_from_slice(&arrow_continuation(
            markers.data_offset() - markers.meta_offset() - CONTINUATION,
        ));
    }

    pub fn write_continuations(&self) {
        self.write_schema_continuation();
        self.write_meta_continuation();
    }

    fn get_all_mut(&'v self) -> &'mem mut [u8] {
        unsafe { self.ptr().read_mut_exact(0, self.memory.size) }
    }
}

impl Index<Buffer> for VisitorMut<'_> {
    type Output = [u8];

    fn index(&self, index: Buffer) -> &Self::Output {
        match index {
            Buffer::Schema => self.schema(),
            Buffer::Header => self.header(),
            Buffer::Meta => self.meta(),
            Buffer::Data => self.data(),
        }
    }
}

impl IndexMut<Buffer> for VisitorMut<'_> {
    fn index_mut(&mut self, index: Buffer) -> &mut Self::Output {
        match index {
            Buffer::Schema => self.schema_mut(),
            Buffer::Header => self.header_mut(),
            Buffer::Meta => self.meta_mut(),
            Buffer::Data => self.data_mut(),
        }
    }
}
