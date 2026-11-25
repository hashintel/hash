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
/// An implementor must not also implement [`ScopeAllocator`]. A reference that a `ScopeAllocator`
/// returns does not borrow it, and it would stay usable after a `reset`.
///
/// # Example
///
/// ```
/// use hashql_core::heap::{PhaseAllocator as _, ResetAllocator, Scratch};
///
/// // Runs `step` for every input and releases the memory of a step before the next one starts.
/// fn run_each<A>(arena: &mut A, inputs: &[u32], mut step: impl FnMut(&A, u32) -> u32) -> u32
/// where
///     A: ResetAllocator,
/// {
///     let mut total = 0;
///
///     for &input in inputs {
///         total += step(arena, input);
///         arena.reset();
///     }
///
///     total
/// }
///
/// let mut scratch = Scratch::new();
/// let total = run_each(&mut scratch, &[1, 2, 3], |scratch, input| {
///     let doubled = scratch.alloc(input * 2);
///     *doubled
/// });
///
/// assert_eq!(total, 12);
/// ```
///
/// [`reset`]: Self::reset
/// [`ScopeAllocator`]: super::ScopeAllocator
pub const unsafe trait ResetAllocator {
    /// Releases every allocation made from the arena.
    ///
    /// Later allocations can reuse the memory.
    fn reset(&mut self);
}
