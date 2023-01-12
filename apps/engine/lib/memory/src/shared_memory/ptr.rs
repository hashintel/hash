use crate::shared_memory::Segment;

/// Pointer over any Memory contents, capable of mutation
pub struct MemoryPtr {
    // TODO: Use `NonNull` or a slice as mentioned below
    ptr: *const u8,
}

impl<'s> MemoryPtr {
    pub fn from_memory(memory: &Segment) -> MemoryPtr {
        Self::new(memory.data.as_ptr())
    }

    fn new(ptr: *const u8) -> MemoryPtr {
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

    // TODO: SAFETY section
    pub unsafe fn read_exact(&self, offset: usize, len: usize) -> &'s [u8] {
        std::slice::from_raw_parts(self.ptr.add(offset), len)
    }

    // TODO: Unsound mutation of `&self` -> `&mut [u8]`. Change signature to take `&mut self` and
    //       add lifetime to struct. Avoid pointer arithmetic and use slices instead.
    // TODO: SAFETY section
    pub unsafe fn read_mut_exact(&self, offset: usize, len: usize) -> &'s mut [u8] {
        std::slice::from_raw_parts_mut(self.ptr.add(offset) as *mut _, len)
    }
}
