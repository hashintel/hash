/// An arena that can release all of its allocations at once.
///
/// The type that owns an arena implements this trait, and the allocators of the arena borrow that
/// type. [`reset`] takes `&mut self`, which the compiler grants only where no allocator of the
/// arena and no allocation made through one is still in use.
///
/// # Safety
///
/// [`reset`] is safe to call and releases memory that earlier allocations point into. Implementors
/// must ensure that no memory allocated from the arena is reachable while an exclusive borrow of
/// the implementor exists.
///
/// An implementor must not also implement [`PhaseAllocator`]. A reference that a `PhaseAllocator`
/// returns does not borrow the allocator, and it would stay usable after a `reset`.
///
/// [`reset`]: Self::reset
/// [`PhaseAllocator`]: super::PhaseAllocator
pub const unsafe trait ResetAllocator {
    /// Releases every allocation made from the arena.
    ///
    /// Later allocations can reuse the memory.
    fn reset(&mut self);
}
