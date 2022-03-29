use crate::datastore::storage::memory::Memory;

/// Pointer over any Memory contents, capable of mutation
pub struct MemoryPtr {
    ptr: *const u8,
}

impl<'s> MemoryPtr {
    pub fn from_memory(memory: &Memory) -> MemoryPtr {
        Self::new(memory.data.as_ptr())
    }

    pub fn new(ptr: *const u8) -> MemoryPtr {
        MemoryPtr { ptr }
    }

    /// Add to the underlying pointer
    ///
    /// # Safety
    ///
    /// As safe as `std::ptr::add`
    pub unsafe fn _add(&self, offset: usize) -> *const u8 {
        self.ptr.add(offset)
    }

    #[allow(clippy::missing_safety_doc)]
    pub unsafe fn read_exact(&self, offset: usize, len: usize) -> &'s [u8] {
        std::slice::from_raw_parts(self.ptr.add(offset), len)
    }

    #[allow(clippy::missing_safety_doc)]
    pub unsafe fn read_mut_exact(&self, offset: usize, len: usize) -> &'s mut [u8] {
        std::slice::from_raw_parts_mut(self.ptr.add(offset) as *mut _, len)
    }
}
