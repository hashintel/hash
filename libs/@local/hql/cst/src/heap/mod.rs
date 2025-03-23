mod ptr;

use alloc::alloc::Allocator;

use bumpalo::Bump;
use hashbrown::DefaultHashBuilder;

pub use self::ptr::P;

pub type Vec<'heap, T> = alloc::vec::Vec<T, &'heap Heap>;
pub type VecDeque<'heap, T> = alloc::collections::vec_deque::VecDeque<T, &'heap Heap>;
pub type HashMap<'heap, K, V> = hashbrown::HashMap<K, V, DefaultHashBuilder, &'heap Heap>;

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

    pub fn vec<T>(&self, capacity: Option<usize>) -> Vec<'_, T> {
        capacity.map_or_else(
            || Vec::new_in(&self),
            |capacity| Vec::with_capacity_in(capacity, &self),
        )
    }

    pub fn hash_map<K, V>(&self, capacity: Option<usize>) -> HashMap<'_, K, V> {
        capacity.map_or_else(
            || HashMap::new_in(&self),
            |capacity| HashMap::with_capacity_in(capacity, &self),
        )
    }

    pub fn dequeue<T>(&self, capacity: Option<usize>) -> VecDeque<'_, T> {
        capacity.map_or_else(
            || VecDeque::new_in(&self),
            |capacity| VecDeque::with_capacity_in(capacity, &self),
        )
    }

    pub fn ptr<T: 'static>(&self, value: T) -> P<'_, T> {
        P::new(value, &self)
    }
}

impl Default for Heap {
    fn default() -> Self {
        Self::new()
    }
}

#[expect(unsafe_code, reason = "proxy to bump")]
unsafe impl Allocator for &Heap {
    fn allocate_zeroed(
        &self,
        layout: std::alloc::Layout,
    ) -> Result<std::ptr::NonNull<[u8]>, std::alloc::AllocError> {
        (&self.bump).allocate_zeroed(layout)
    }

    unsafe fn grow(
        &self,
        ptr: std::ptr::NonNull<u8>,
        old_layout: std::alloc::Layout,
        new_layout: std::alloc::Layout,
    ) -> Result<std::ptr::NonNull<[u8]>, std::alloc::AllocError> {
        unsafe { (&self.bump).grow(ptr, old_layout, new_layout) }
    }

    unsafe fn grow_zeroed(
        &self,
        ptr: std::ptr::NonNull<u8>,
        old_layout: std::alloc::Layout,
        new_layout: std::alloc::Layout,
    ) -> Result<std::ptr::NonNull<[u8]>, std::alloc::AllocError> {
        unsafe { (&self.bump).grow_zeroed(ptr, old_layout, new_layout) }
    }

    unsafe fn shrink(
        &self,
        ptr: std::ptr::NonNull<u8>,
        old_layout: std::alloc::Layout,
        new_layout: std::alloc::Layout,
    ) -> Result<std::ptr::NonNull<[u8]>, std::alloc::AllocError> {
        unsafe { (&self.bump).shrink(ptr, old_layout, new_layout) }
    }

    fn allocate(
        &self,
        layout: std::alloc::Layout,
    ) -> Result<std::ptr::NonNull<[u8]>, std::alloc::AllocError> {
        (&self.bump).allocate(layout)
    }

    unsafe fn deallocate(&self, ptr: std::ptr::NonNull<u8>, layout: std::alloc::Layout) {
        unsafe { (&self.bump).deallocate(ptr, layout) }
    }
}
