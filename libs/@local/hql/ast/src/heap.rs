use core::alloc::Allocator;

use bumpalo::Bump;

pub type Box<'heap, T> = alloc::boxed::Box<T, &'heap Heap>;
pub type Vec<'heap, T> = alloc::vec::Vec<T, &'heap Heap>;
pub type VecDeque<'heap, T> = alloc::collections::vec_deque::VecDeque<T, &'heap Heap>;
pub type HashMap<'heap, K, V, S = foldhash::fast::RandomState> =
    hashbrown::HashMap<K, V, S, &'heap Heap>;

#[derive(Debug)]
pub struct Heap {
    bump: Bump,
}

impl Heap {
    #[must_use]
    pub fn new() -> Self {
        Self { bump: Bump::new() }
    }

    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            bump: Bump::with_capacity(capacity),
        }
    }

    pub fn vec<T>(&self, capacity: Option<usize>) -> Vec<T> {
        capacity.map_or_else(
            || Vec::new_in(self),
            |capacity| Vec::with_capacity_in(capacity, self),
        )
    }

    pub fn hash_map<K, V>(&self, capacity: Option<usize>) -> HashMap<K, V> {
        capacity.map_or_else(
            || HashMap::with_hasher_in(foldhash::fast::RandomState::default(), self),
            |capacity| {
                HashMap::with_capacity_and_hasher_in(
                    capacity,
                    foldhash::fast::RandomState::default(),
                    self,
                )
            },
        )
    }

    pub fn dequeue<T>(&self, capacity: Option<usize>) -> VecDeque<T> {
        capacity.map_or_else(
            || VecDeque::new_in(self),
            |capacity| VecDeque::with_capacity_in(capacity, self),
        )
    }

    pub fn boxed<T>(&self, value: T) -> Box<T> {
        alloc::boxed::Box::new_in(value, self)
    }
}

impl Default for Heap {
    fn default() -> Self {
        Self::new()
    }
}

#[expect(unsafe_code, reason = "proxy to bump")]
// SAFETY: this simply delegates to the bump allocator
unsafe impl Allocator for &Heap {
    fn allocate_zeroed(
        &self,
        layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        (&self.bump).allocate_zeroed(layout)
    }

    unsafe fn grow(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { (&self.bump).grow(ptr, old_layout, new_layout) }
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { (&self.bump).grow_zeroed(ptr, old_layout, new_layout) }
    }

    unsafe fn shrink(
        &self,
        ptr: core::ptr::NonNull<u8>,
        old_layout: core::alloc::Layout,
        new_layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { (&self.bump).shrink(ptr, old_layout, new_layout) }
    }

    fn allocate(
        &self,
        layout: core::alloc::Layout,
    ) -> Result<core::ptr::NonNull<[u8]>, core::alloc::AllocError> {
        (&self.bump).allocate(layout)
    }

    unsafe fn deallocate(&self, ptr: core::ptr::NonNull<u8>, layout: core::alloc::Layout) {
        // SAFETY: this simply delegates to the bump allocator
        unsafe { (&self.bump).deallocate(ptr, layout) }
    }
}
