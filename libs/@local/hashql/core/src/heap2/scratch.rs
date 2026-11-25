use super::{
    bump::{Bump, BumpScope},
    macros::{delegate_allocator, delegate_phase_allocator, delegate_reset_allocator},
};

/// An arena for the temporary data of a computation.
///
/// `&Scratch` is a [`PhaseAllocator`]. To open scopes, borrow the arena through [`as_mut_scope`] or
/// [`as_scope`]. Call [`reset`] between the runs of a computation to reuse the memory of one
/// `Scratch` for all of them.
///
/// To intern [`Symbol`]s, use a [`Heap`].
///
/// [`PhaseAllocator`]: super::PhaseAllocator
/// [`as_mut_scope`]: Self::as_mut_scope
/// [`as_scope`]: Self::as_scope
/// [`reset`]: super::ResetAllocator::reset
/// [`Symbol`]: crate::symbol::Symbol
/// [`Heap`]: super::Heap
pub struct Scratch(Bump);

impl Scratch {
    /// Creates an empty arena.
    #[inline]
    #[must_use]
    pub fn new() -> Self {
        Self(Bump::new())
    }

    /// Creates an empty arena that requests about `capacity` bytes of memory up front.
    #[inline]
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self(Bump::with_capacity(capacity))
    }

    /// Borrows the arena for code that shares it.
    ///
    /// The returned arena opens scopes through [`scoped_ref`] alone.
    ///
    /// [`scoped_ref`]: super::ScopeAllocator::scoped_ref
    #[inline]
    #[must_use]
    pub fn as_scope(&self) -> &BumpScope<'_> {
        self.0.as_scope()
    }

    /// Borrows the arena with exclusive access.
    ///
    /// The returned arena opens scopes through [`scoped`], which has none of the restrictions of
    /// [`scoped_ref`].
    ///
    /// [`scoped`]: super::ScopeAllocator::scoped
    /// [`scoped_ref`]: super::ScopeAllocator::scoped_ref
    #[inline]
    #[must_use]
    pub fn as_mut_scope(&mut self) -> &mut BumpScope<'_> {
        self.0.as_mut_scope()
    }
}

impl Default for Scratch {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

delegate_allocator!(Scratch, 0);
delegate_phase_allocator!('alloc, &'alloc Scratch, 0);
delegate_reset_allocator!(Scratch, 0);

#[cfg(test)]
mod tests {
    use alloc::vec::Vec;
    use core::ptr;

    use super::Scratch;
    use crate::heap2::{PhaseAllocator as _, ResetAllocator as _, ScopeAllocator};

    fn sum_scoped<'alloc, S>(alloc: &mut S, values: &[u32]) -> u32
    where
        S: ScopeAllocator<'alloc>,
    {
        alloc.scoped(|scope| scope.alloc_slice_copy(values).iter().sum())
    }

    #[test]
    fn alloc_on_owned_scratch() {
        let scratch = Scratch::new();

        let first = scratch.alloc(1_u32);
        let second = scratch.alloc_slice_copy(&[*first, 2]);

        assert_eq!((*first, &*second), (1, &[1, 2][..]));
    }

    #[test]
    fn collection_in_scratch() {
        let scratch = Scratch::with_capacity(64);

        let mut values = Vec::new_in(&scratch);
        values.extend(0..1024_u32);

        assert_eq!(values.iter().sum::<u32>(), 523_776);
    }

    #[test]
    fn reset_reuses_memory() {
        let mut scratch = Scratch::new();

        let first = ptr::from_mut(scratch.alloc(1_u64));
        scratch.reset();
        let second = ptr::from_mut(scratch.alloc(2_u64));

        assert_eq!(first, second);
    }

    #[test]
    fn scopes_on_owned_scratch() {
        let mut scratch = Scratch::new();

        assert_eq!(sum_scoped(scratch.as_mut_scope(), &[1, 2, 3]), 6);

        let kept = scratch.alloc(4_u32);
        let sum = scratch
            .as_scope()
            .scoped_ref(|scope| *scope.alloc(*kept + 1));

        assert_eq!((*kept, sum), (4, 5));
    }
}
