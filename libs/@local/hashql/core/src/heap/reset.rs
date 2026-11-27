/// An arena that can release all of its allocations at once.
///
/// The type that owns an arena implements this trait, and the allocators that share the arena
/// borrow that type. [`reset`] takes `&mut self`, which the compiler grants only where no allocator
/// of the arena and no allocation made through one is still in use.
///
/// # Safety
///
/// [`reset`] is safe to call and releases memory that earlier allocations point into. Implementors
/// must ensure that safe code cannot reach an allocation of the arena after [`reset`] has released
/// its memory. An allocator of the arena that does not own the implementor must borrow it, and the
/// references that the allocator returns must not outlive that borrow. [`reset`] must discard every
/// pointer to an allocation that the implementor stores itself.
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
