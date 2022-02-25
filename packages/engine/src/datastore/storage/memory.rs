#![allow(clippy::similar_names)]

use std::{env, os::unix::io::RawFd, path::Path};

use shared_memory::{Shmem, ShmemConf};

use super::{
    ptr::MemoryPtr,
    visitor::{Visit, Visitor, VisitorMut},
    BufferChange,
};
use crate::{datastore::prelude::*, proto::ExperimentId};

pub type Buffers<'a> = (&'a [u8], &'a [u8], &'a [u8], &'a [u8]);

pub fn shmem_id_prefix(experiment_id: &ExperimentId) -> String {
    if cfg!(target_os = "macos") {
        // MacOS shmem seems to be limited to 31 chars, probably remnants of HFS
        // And we need to_string otherwise it's not truncated when formatting
        format!("shm_{:.20}", experiment_id.to_simple().to_string())
    } else {
        format!("shm_{}", experiment_id.to_simple())
    }
}

/// A memory-mapped shared memory segment wrapper.
///
/// Includes tools to work with internal strucure.
///
/// ### Internal Buffers
/// There are 4 main buffers contained in the shared memory which are:
/// 1) Arrow Schema
/// 2) Header
/// 3) Arrow Batch metadata
/// 4) Arrow Batch data
///
/// At the beginning of the shared memory segment there is another
/// small buffer which contains the markers to the four buffers
/// above. This offset buffer can be read with `Memory::markers`
pub struct Memory {
    pub data: Shmem,
    pub size: usize,
    include_terminal_padding: bool,
}

// Memory layout:
// ------------------------------------------------------------------------------------------------
// | [Markers to Schema,Metadata (which are markers and nullcounts of Arrow columns),Column data] |
// |                                [padding to 8-byte alignment]                                 |
// | [                     Arrow Schema (prepended with continuation bytes)                     ] |
// |                            [system-dependent padding (for SIMD)]                             |
// | [                                       Header Data                                        ] |
// |                                [padding to 8-byte alignment]                                 |
// | [                    Arrow Metadata (prepended with continuation bytes)                    ] |
// |                            [system-dependent padding (for SIMD)]                             |
// | [                                       Column Data                                        ] |
// ------------------------------------------------------------------------------------------------
//
// Note column data will not be densely packed as it will leave space for array size fluctuations.

// Constructors for Memory
impl Memory {
    // TODO: unused?
    pub fn as_ptr(&self) -> *const u8 {
        self.data.as_ptr()
    }

    // TODO: `data.as_mut_ptr`, with `&mut self` argument, to avoid
    //       violating Rust's aliasing rules for pointers derived
    //       from const references.
    // TODO: unused?
    pub fn as_mut_ptr(&mut self) -> *mut u8 {
        self.data.as_ptr()
    }

    /// Resize the Shared Memory segment, also performs
    /// reloading
    pub fn resize(&mut self, mut new_size: usize) -> Result<()> {
        new_size = Self::calculate_total_size(new_size, self.include_terminal_padding)?;
        tracing::trace!("Trying to resize memory to: {}", new_size);
        self.data.resize(new_size)?;
        self.size = new_size;
        Ok(())
    }

    fn calculate_total_size(size: usize, include_terminal_padding: bool) -> Result<usize> {
        Ok(if include_terminal_padding {
            // Leave extra padding in the end to minimize number of ftruncate calls
            padding::get_dynamic_buffer_length(size)
        } else {
            size
        })
    }

    /// Reload the shared memory segment when an
    /// external resize has happened
    pub fn reload(&mut self) -> Result<()> {
        self.data.reload()?;
        self.size = self.data.len();
        Ok(())
    }

    // TODO: unused?
    pub fn raw_fd(&self) -> RawFd {
        self.data.raw_fd()
    }

    /// Get the ID of the shared memory segment
    pub fn get_id(&self) -> &str {
        self.data.get_os_id()
    }

    // TODO: unused?
    pub fn unmap(self) {
        self.data.unmap()
    }

    pub fn shared_memory(
        experiment_id: &ExperimentId,
        size: usize,
        droppable: bool,
        include_terminal_padding: bool,
    ) -> Result<Memory> {
        Self::validate_size(size)?;
        let data = ShmemConf::new(droppable)
            .os_id(Self::generate_shmem_id(experiment_id))
            .size(size)
            .create()?;
        Ok(Memory {
            data,
            size,
            include_terminal_padding,
        })
    }

    pub fn shmem_os_id(
        message: &str,
        droppable: bool,
        include_terminal_padding: bool,
    ) -> Result<Memory> {
        if message.contains("shm_") {
            let id = &message;
            let data = ShmemConf::new(droppable).os_id(id).open()?;
            let size = data.len();
            Self::validate_size(size)?;
            Ok(Memory {
                data,
                size,
                include_terminal_padding,
            })
        } else {
            Err(Error::Memory("Expected message to contain \"shm_\"".into()))
        }
    }

    fn visitor(&self) -> Visitor<'_> {
        Visitor::new(MemoryPtr::from_memory(self))
    }

    fn visitor_mut(&mut self) -> VisitorMut<'_> {
        VisitorMut::new(MemoryPtr::from_memory(self), self)
    }

    pub fn duplicate_from(memory: &Memory, experiment_id: &ExperimentId) -> Result<Memory> {
        let shmem = &memory.data;
        let data = ShmemConf::new(true)
            .os_id(Self::generate_shmem_id(experiment_id))
            .size(memory.size)
            .create()?;
        unsafe { std::ptr::copy_nonoverlapping(shmem.as_ptr(), data.as_ptr(), memory.size) };
        Ok(Memory {
            data,
            size: memory.size,
            include_terminal_padding: memory.include_terminal_padding,
        })
    }

    fn generate_shmem_id(experiment_id: &ExperimentId) -> String {
        let id_prefix = shmem_id_prefix(experiment_id);
        loop {
            let cur_id = if cfg!(target_os = "macos") {
                // MacOS shmem seems to be limited to 31 chars, probably remnants of HFS
                format!("{}_{:.7}", id_prefix, rand::random::<u16>())
            } else {
                format!("{}_{}", id_prefix, rand::random::<u16>())
            };

            if !Path::new(&format!("/dev/shm/{}", cur_id)).exists() {
                return cur_id;
            }
        }
    }

    fn validate_size(size: usize) -> Result<()> {
        // This comes from the fact we use List and *not* LargeList Arrow types
        // List markers are i32 type, while LargeList markers are i64 type
        if size == 0 {
            return Err(Error::EmptySharedMemory);
        }

        if size as u64 > i32::MAX as u64 {
            return Err(Error::SharedMemoryMaxSize(size as u64, i32::MAX as u64));
        }
        Ok(())
    }

    pub fn validate_markers(&self) -> bool {
        self.visitor().validate_markers(self.get_id(), self.size)
    }

    /// Get the bytes which contain relevant batch data/metadata
    pub fn get_contents_bytes(&self) -> Result<&[u8]> {
        self.visitor().get_all_buffers()
    }

    /// Copy a slice into the shared memory segment, with offset 0
    pub fn overwrite_no_bounds_check(&mut self, src: &[u8]) -> Result<()> {
        unsafe { std::ptr::copy_nonoverlapping(src.as_ptr(), self.data.as_ptr(), src.len()) };
        Ok(())
    }

    pub fn get_batch_buffers(&self) -> Result<Buffers<'_>> {
        let visitor = self.visitor();
        Ok((
            visitor.schema(),
            visitor.header(),
            visitor.meta(),
            visitor.data(),
        ))
    }

    pub fn set_data_length(&mut self, data_length: usize) -> Result<BufferChange> {
        self.visitor_mut().set_data_length(data_length)
    }

    // We can't resize memory on macos
    #[cfg(target_os = "macos")]
    pub fn shrink_memory_with_data_length(&mut self, _data_length: usize) -> Result<BufferChange> {
        Ok(BufferChange(false, false))
    }

    #[cfg(not(target_os = "macos"))]
    pub fn shrink_memory_with_data_length(&mut self, data_length: usize) -> Result<BufferChange> {
        self.visitor_mut().shrink_with_data_length(data_length)
    }

    pub fn set_schema<K: AsRef<[u8]>>(&mut self, schema: &K) -> Result<BufferChange> {
        self.visitor_mut().write_schema_buffer(schema.as_ref())
    }

    // TODO: unused?
    pub fn get_header(&self) -> Result<&[u8]> {
        Ok(self.visitor().header())
    }

    pub fn set_header<K: AsRef<[u8]>>(&mut self, header: &K) -> Result<BufferChange> {
        self.visitor_mut().write_header_buffer(header.as_ref())
    }

    pub fn get_metadata(&self) -> Result<&[u8]> {
        Ok(self.visitor().meta())
    }

    pub fn set_metadata<K: AsRef<[u8]>>(&mut self, metadata: &K) -> Result<BufferChange> {
        self.visitor_mut().write_meta_buffer(metadata.as_ref())
    }

    pub fn get_data_buffer(&self) -> Result<&[u8]> {
        Ok(self.visitor().data())
    }

    pub fn get_data_buffer_len(&self) -> Result<usize> {
        Ok(self.visitor().markers().data_size())
    }

    pub fn get_mut_data_buffer(&mut self) -> Result<&mut [u8]> {
        Ok(self.visitor_mut().data_mut())
    }

    /// Perform a possibly overlapping copy inside the Arrow Batch data buffer.
    ///
    /// # Arguments
    ///
    /// * `src_offset` - Source offset (from the start of the data buffer)
    /// * `dst_offset` - Destination offset (from the start of the data buffer)
    /// * `count` - Number of bytes to be copied
    pub fn copy_in_data_buffer_unchecked(
        &mut self,
        src_offset: usize,
        dst_offset: usize,
        count: usize,
    ) -> Result<()> {
        let visitor = self.visitor_mut();
        visitor
            .data_mut()
            .copy_within(src_offset..src_offset + count, dst_offset);
        Ok(())
    }

    pub fn overwrite_in_data_buffer_unchecked_nonoverlapping(
        &mut self,
        offset: usize,
        data: &[u8],
    ) -> Result<()> {
        let visitor = self.visitor_mut();
        visitor.data_mut()[offset..offset + data.len()].copy_from_slice(data);
        Ok(())
    }

    pub fn from_sizes(
        experiment_id: &ExperimentId,
        schema_size: usize,
        header_size: usize,
        meta_size: usize,
        data_size: usize,
        include_terminal_padding: bool,
    ) -> Result<Memory> {
        let markers = Visitor::markers_from_sizes(schema_size, header_size, meta_size, data_size);
        let mut size = Self::calculate_total_size(
            markers.get_total_contents_size(),
            include_terminal_padding,
        )?;

        if cfg!(target_os = "macos") {
            if let Ok(val) = env::var("OS_MEMORY_ALLOC_OVERRIDE") {
                size = val.parse().expect(&format!(
                    "OS_MEMORY_ALLOC_OVERRIDE was an invalid value: {val}"
                ));
                tracing::debug!(
                    "Memory size was overridden by value set in envvar, set to: {size}"
                );
            }
        }

        let mut memory =
            Memory::shared_memory(experiment_id, size, true, include_terminal_padding)?;

        let mut visitor = memory.visitor_mut();
        let markers_mut = visitor.markers_mut();
        *markers_mut = markers;

        // It is important to also write continuation
        // bytes after changing the markers
        visitor.write_continuations();

        Ok(memory)
    }

    pub fn from_batch_buffers(
        experiment_id: &ExperimentId,
        schema: &[u8],
        header: &[u8],
        meta: &[u8],
        data: &[u8],
        include_terminal_padding: bool,
    ) -> Result<Memory> {
        let markers =
            Visitor::markers_from_sizes(schema.len(), header.len(), meta.len(), data.len());

        let mut size = Self::calculate_total_size(
            markers.get_total_contents_size(),
            include_terminal_padding,
        )?;

        if cfg!(target_os = "macos") {
            if let Ok(val) = env::var("OS_MEMORY_ALLOC_OVERRIDE") {
                size = val.parse().expect(&format!(
                    "OS_MEMORY_ALLOC_OVERRIDE was an invalid value: {val}"
                ));
                tracing::debug!(
                    "Memory size was overridden by value set in envvar, set to: {size}"
                );
            }
        }

        let mut memory =
            Memory::shared_memory(experiment_id, size, true, include_terminal_padding)?;

        let mut visitor = memory.visitor_mut();
        let markers_mut = visitor.markers_mut();
        *markers_mut = markers;

        // It is important to also write continuation
        // bytes after changing the markers
        visitor.write_continuations();

        // We can do this unchecked, because we've already provided the
        // exact amount of space for them
        visitor.write_schema_buffer_unchecked(schema);
        visitor.write_header_buffer_unchecked(header);
        visitor.write_meta_buffer_unchecked(meta);
        visitor.write_data_buffer_unchecked(data);

        Ok(memory)
    }

    pub fn target_total_size_accommodates_data_size(
        &self,
        target_shmem_size: usize,
        data_len: usize,
    ) -> bool {
        self.visitor()
            .target_total_size_accommodates_data_size(target_shmem_size, data_len)
    }
}

#[cfg(test)]
pub mod tests {
    use uuid::Uuid;

    use super::*;
    use crate::error::Result;

    #[test]
    pub fn test_identical_buffers() -> Result<()> {
        let experiment_id = Uuid::new_v4();
        let buffer1: Vec<u8> = vec![1; 1482];
        let buffer2: Vec<u8> = vec![2; 645];
        let buffer3: Vec<u8> = vec![3; 254];
        let buffer4: Vec<u8> = vec![4; 173];

        let memory = Memory::from_batch_buffers(
            &experiment_id,
            &buffer1,
            &buffer2,
            &buffer3,
            &buffer4,
            true,
        )?;

        let (new_buffer1, new_buffer2, new_buffer3, new_buffer4) = memory.get_batch_buffers()?;

        assert_eq!(buffer1, new_buffer1);
        assert_eq!(buffer2, new_buffer2);
        assert_eq!(buffer3, new_buffer3);
        assert_eq!(buffer4, new_buffer4);
        Ok(())
    }

    #[test]
    pub fn test_message() -> Result<()> {
        let experiment_id = Uuid::new_v4();
        let buffer1: Vec<u8> = vec![1; 1482];
        let buffer2: Vec<u8> = vec![2; 645];
        let buffer3: Vec<u8> = vec![3; 254];
        let buffer4: Vec<u8> = vec![4; 173];

        let memory = Memory::from_batch_buffers(
            &experiment_id,
            &buffer1,
            &buffer2,
            &buffer3,
            &buffer4,
            true,
        )?;

        let message = memory.get_id();

        let new_memory = Memory::shmem_os_id(&message, true, false)?;

        let slice = unsafe {
            let shmem = &memory.data;
            std::slice::from_raw_parts(shmem.as_ptr(), shmem.len())
        };

        let new_slice = unsafe {
            let shmem = &new_memory.data;
            std::slice::from_raw_parts(shmem.as_ptr(), shmem.len())
        };

        assert_eq!(slice, new_slice);

        Ok(())
    }
}
