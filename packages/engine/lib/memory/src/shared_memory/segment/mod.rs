use std::{env, fmt, mem};

use shared_memory::{Shmem, ShmemConf};
use tracing::trace;

use crate::{
    error::{Error, Result},
    shared_memory::{
        padding,
        ptr::MemoryPtr,
        visitor::{Visit, Visitor, VisitorMut},
        BufferChange, Metaversion,
    },
};

pub mod buffers;
pub mod cleanup;
pub mod memory_id;

pub use buffers::Buffers;
pub use cleanup::cleanup_by_base_id;
pub use memory_id::MemoryId;

/// A thin wrapper around a shared memory segment. Shared memory provides a way for multiple
/// processes to all access a common region of memory (usually the operating system would prohibit
/// processes from accessing the memory of another process directly).
///
/// We use shared memory in hEngine to store data which is shared between agents (for example, we
/// have a batch which stores all the messages each agent has sent/received, one for agent state,
/// and one for storing arbitrary shared data).
///
/// **Important:** to avoid memory leaks, it is essential that all shared memory segments are
/// deallocated promptly once they are no longer required (they are not automatically freed by the
/// operating system - even on process exit!) If a [`Segment`] is dropped (and it created the
/// shared-memory segment) it will be automatically deleted so it is essential that all created
/// segments are eventually [`Drop`]ped.
pub struct Segment {
    pub data: Shmem,
    pub size: usize,
    include_terminal_padding: bool,
}

impl fmt::Debug for Segment {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Segment")
            .field("id (note: not a field)", &self.data.get_os_id())
            .field("size", &self.size)
            .field("include_terminal_padding", &self.include_terminal_padding)
            .finish()
    }
}

impl Drop for Segment {
    fn drop(&mut self) {
        if self.data.is_owner() {
            trace!(
                "unlinking shared memory segment {} (as `is_owner`=true)",
                self.id()
            );
        } else {
            trace!(
                "dropping shared memory segment {} (as `is_owner=false`)",
                self.id()
            )
        }
    }
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
impl Segment {
    // TODO: UNUSED: Needs triage
    pub fn as_ptr(&self) -> *const u8 {
        self.data.as_ptr()
    }

    // TODO: `data.as_mut_ptr`, with `&mut self` argument, to avoid
    //       violating Rust's aliasing rules for pointers derived
    //       from const references.
    // TODO: UNUSED: Needs triage
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

    /// Get the ID of the shared memory segment
    pub fn id(&self) -> &str {
        self.data.get_os_id()
    }

    pub fn shared_memory(
        memory_id: MemoryId,
        size: usize,
        droppable: bool,
        include_terminal_padding: bool,
    ) -> Result<Segment> {
        Self::validate_size(size)?;
        let data = ShmemConf::new(droppable)
            .os_id(&memory_id.to_string())
            .size(size)
            .create()?;
        Ok(Segment {
            data,
            size,
            include_terminal_padding,
        })
    }

    pub fn from_shmem_os_id(
        os_id: &str,
        droppable: bool,
        include_terminal_padding: bool,
    ) -> Result<Segment> {
        if os_id.contains("shm_") {
            let id = &os_id;
            let data = ShmemConf::new(droppable).os_id(id).open()?;
            let size = data.len();
            Self::validate_size(size)?;
            Ok(Segment {
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

    pub fn duplicate(memory: &Segment, memory_id: MemoryId) -> Result<Segment> {
        let shmem = &memory.data;
        let data = ShmemConf::new(true)
            .os_id(&memory_id.to_string())
            .size(memory.size)
            .create()?;
        unsafe { std::ptr::copy_nonoverlapping(shmem.as_ptr(), data.as_ptr(), memory.size) };
        Ok(Segment {
            data,
            size: memory.size,
            include_terminal_padding: memory.include_terminal_padding,
        })
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

    pub fn validate_markers(&self) -> Result<()> {
        if self.visitor().validate_markers(self.id(), self.size) {
            Ok(())
        } else {
            Err(Error::from(
                "Incorrect markers -- possibly buffer locations are wrong or the markers weren't \
                 written correctly, so they don't correspond to the actual locations",
            ))
        }
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
        Ok(Buffers {
            schema: visitor.schema(),
            header: visitor.header(),
            meta: visitor.meta(),
            data: visitor.data(),
        })
    }

    pub fn set_data_length(&mut self, data_length: usize) -> Result<BufferChange> {
        self.visitor_mut().set_data_length(data_length)
    }

    // We can't resize memory on macos
    #[cfg(target_os = "macos")]
    pub fn shrink_memory_with_data_length(&mut self, _data_length: usize) -> Result<BufferChange> {
        Ok(BufferChange::new(false, false))
    }

    #[cfg(not(target_os = "macos"))]
    pub fn shrink_memory_with_data_length(&mut self, data_length: usize) -> Result<BufferChange> {
        self.visitor_mut().shrink_with_data_length(data_length)
    }

    pub fn set_schema<K: AsRef<[u8]>>(&mut self, schema: &K) -> Result<BufferChange> {
        self.visitor_mut().write_schema_buffer(schema.as_ref())
    }

    pub fn get_header(&self) -> Result<&[u8]> {
        Ok(self.visitor().header())
    }

    pub fn set_header<K: AsRef<[u8]>>(&mut self, header: &K) -> Result<BufferChange> {
        self.visitor_mut().write_header_buffer(header.as_ref())
    }

    /// The latest batch version and memory version of this batch that is persisted in memory (in
    /// this experiment as a whole).
    ///
    /// # Panics
    ///
    /// If the metaversion wasn't written properly when the batch was created or the part of memory
    /// containing the metaversion was incorrectly deallocated (or we incorrectly tried to read the
    /// metaversion), this function might fail to read the metaversion.
    pub fn read_persisted_metaversion(&self) -> Metaversion {
        self.try_read_persisted_metaversion()
            .expect("Could not read metaversion")
    }

    /// Same as [`Segment::read_persisted_metaversion`] but returns a [`Result`] instead of
    /// panicking.
    pub fn try_read_persisted_metaversion(&self) -> Result<Metaversion> {
        let header = self.get_header()?;
        let n_header_bytes = header.len();
        let n_metaversion_bytes = 2 * mem::size_of::<u32>();
        if n_header_bytes < n_metaversion_bytes {
            Err(Error::from("Memory header too small to read metaversion"))
        } else {
            let bytes: [u8; 8] = header[..8].try_into().unwrap();
            Metaversion::from_le_bytes(bytes)
        }
    }

    /// Set the latest batch version and memory version of this batch that is persisted in memory
    /// (in this experiment as a whole).
    ///
    /// # Panics
    ///
    /// If the metaversion wasn't written properly when the batch was created or the part of memory
    /// with the metaversion was deallocated later, this might fail to read the metaversion.
    pub fn persist_metaversion(&mut self, metaversion: Metaversion) {
        self.try_persist_metaversion(metaversion)
            .expect("Could not set metaversion")
    }

    /// Same as [`persist_metaversion()`] but returns a `Result` instead of panicking.
    ///
    /// [`persist_metaversion()`]: Self::persist_metaversion
    pub fn try_persist_metaversion(&mut self, metaversion: Metaversion) -> Result<()> {
        let header = self.visitor_mut().header_mut();
        let n_header_bytes = header.len();
        let n_metaversion_bytes = 2 * mem::size_of::<u32>();
        if n_header_bytes < n_metaversion_bytes {
            Err(Error::from("Memory header too small to write metaversion"))
        } else {
            let bytes = metaversion.to_le_bytes();
            header[..n_metaversion_bytes].copy_from_slice(&bytes);
            Ok(())
        }
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
        memory_id: MemoryId,
        schema_size: usize,
        header_size: usize,
        meta_size: usize,
        data_size: usize,
        include_terminal_padding: bool,
    ) -> Result<Segment> {
        let markers = Visitor::markers_from_sizes(schema_size, header_size, meta_size, data_size);
        let mut size = Self::calculate_total_size(
            markers.get_total_contents_size(),
            include_terminal_padding,
        )?;

        if cfg!(target_os = "macos") {
            if let Ok(val) = env::var("OS_MEMORY_ALLOC_OVERRIDE") {
                size = val.parse().unwrap_or_else(|_| {
                    panic!("OS_MEMORY_ALLOC_OVERRIDE was an invalid value: {val}")
                });
                tracing::debug!(
                    "Memory size was overridden by value set in envvar, set to: {size}"
                );
            }
        }

        let mut memory = Segment::shared_memory(memory_id, size, true, include_terminal_padding)?;

        let mut visitor = memory.visitor_mut();
        let markers_mut = visitor.markers_mut();
        *markers_mut = markers;

        // It is important to also write continuation
        // bytes after changing the markers
        visitor.write_continuations();

        Ok(memory)
    }

    pub fn from_batch_buffers(
        memory_id: MemoryId,
        schema: &[u8],
        header: &[u8],
        ipc_message: &[u8],
        data: &[u8],
        include_terminal_padding: bool,
    ) -> Result<Segment> {
        let markers =
            Visitor::markers_from_sizes(schema.len(), header.len(), ipc_message.len(), data.len());

        let mut size = Self::calculate_total_size(
            markers.get_total_contents_size(),
            include_terminal_padding,
        )?;

        if cfg!(target_os = "macos") {
            if let Ok(val) = env::var("OS_MEMORY_ALLOC_OVERRIDE") {
                size = val.parse().unwrap_or_else(|_| {
                    panic!("OS_MEMORY_ALLOC_OVERRIDE was an invalid value: {val}")
                });
                tracing::debug!(
                    "Memory size was overridden by value set in envvar, set to: {size}"
                );
            }
        }

        let mut memory = Segment::shared_memory(memory_id, size, true, include_terminal_padding)?;

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
        visitor.write_meta_buffer_unchecked(ipc_message);
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

#[cfg(all(test, not(miri)))]
pub mod tests {
    use uuid::Uuid;

    use super::*;

    #[test]
    pub fn test_identical_buffers() -> Result<()> {
        let memory_id = MemoryId::new(Uuid::new_v4());
        let buffer1: Vec<u8> = vec![1; 1482];
        let buffer2: Vec<u8> = vec![2; 645];
        let buffer3: Vec<u8> = vec![3; 254];
        let buffer4: Vec<u8> = vec![4; 173];

        let segment =
            Segment::from_batch_buffers(memory_id, &buffer1, &buffer2, &buffer3, &buffer4, true)?;

        let Buffers {
            schema,
            header,
            meta,
            data,
        } = segment.get_batch_buffers()?;

        assert_eq!(buffer1, schema);
        assert_eq!(buffer2, header);
        assert_eq!(buffer3, meta);
        assert_eq!(buffer4, data);
        Ok(())
    }

    #[test]
    pub fn test_message() -> Result<()> {
        let memory_id = MemoryId::new(Uuid::new_v4());
        let buffer1: Vec<u8> = vec![1; 1482];
        let buffer2: Vec<u8> = vec![2; 645];
        let buffer3: Vec<u8> = vec![3; 254];
        let buffer4: Vec<u8> = vec![4; 173];

        let segment =
            Segment::from_batch_buffers(memory_id, &buffer1, &buffer2, &buffer3, &buffer4, true)?;

        let message = segment.id();

        let new_segment = Segment::from_shmem_os_id(message, true, false)?;

        let slice = unsafe {
            let shmem = &segment.data;
            std::slice::from_raw_parts(shmem.as_ptr(), shmem.len())
        };

        let new_slice = unsafe {
            let shmem = &new_segment.data;
            std::slice::from_raw_parts(shmem.as_ptr(), shmem.len())
        };

        assert_eq!(slice, new_slice);

        Ok(())
    }
}
