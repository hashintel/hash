use alloc::{alloc::Global, vec::Vec};
use core::{
    alloc::Allocator,
    mem::ManuallyDrop,
    ops::{Deref, DerefMut},
};
use std::sync::nonpoison::Mutex;

use super::ResetAllocator;

/// A pool of arenas for code that allocates on more than one thread.
///
/// [`get`] hands the calling thread an arena of its own as a [`PoolGuard`], because an arena such
/// as a [`Scratch`] or a [`Heap`] serves one thread at a time. Dropping the guard resets the arena
/// and returns it to the pool, and a later [`get`] reuses its memory.
///
/// A pool keeps every arena that returns to it. Create the pool with [`bounded`] to limit that
/// number.
///
/// [`Scratch`]: super::Scratch
/// [`Heap`]: super::Heap
/// [`get`]: Self::get
/// [`bounded`]: Self::bounded
pub struct Pool<T, A: Allocator> {
    arenas: Mutex<Vec<T, A>>,
    max_size: usize,
}

impl<T> Pool<T, Global> {
    /// Creates an empty pool that keeps every arena returned to it.
    #[inline]
    #[must_use]
    pub const fn new() -> Self {
        Self::new_in(Global)
    }

    /// Creates an empty pool that keeps at most `max_size` arenas.
    ///
    /// Dropping a guard while the pool holds `max_size` arenas drops the arena of that guard.
    #[inline]
    #[must_use]
    pub const fn bounded(max_size: usize) -> Self {
        Self::bounded_in(max_size, Global)
    }
}

impl<T, A: Allocator> Pool<T, A> {
    /// Creates an empty pool that keeps every arena returned to it and stores them through `alloc`.
    #[inline]
    #[must_use]
    pub const fn new_in(alloc: A) -> Self {
        Self::bounded_in(usize::MAX, alloc)
    }

    /// Creates an empty pool that keeps at most `max_size` arenas and stores them through `alloc`.
    ///
    /// Dropping a guard while the pool holds `max_size` arenas drops the arena of that guard.
    #[inline]
    #[must_use]
    pub const fn bounded_in(max_size: usize, alloc: A) -> Self {
        Self {
            arenas: Mutex::new(Vec::new_in(alloc)),
            max_size,
        }
    }
}

impl<T, A: Allocator> Pool<T, A>
where
    T: ResetAllocator + Default,
{
    /// Takes an arena out of the pool.
    ///
    /// If the pool is empty, this creates an arena with [`Default`].
    #[inline]
    pub fn get(&self) -> PoolGuard<'_, T, A> {
        let arena = self.arenas.lock().pop().unwrap_or_default();

        PoolGuard {
            pool: self,
            arena: ManuallyDrop::new(arena),
        }
    }
}

impl<T> Default for Pool<T, Global> {
    #[inline]
    fn default() -> Self {
        Self::new()
    }
}

/// An arena that [`Pool::get`] took out of its pool.
///
/// Dropping the guard resets the arena and returns it to the pool. If the pool already holds its
/// maximum number of arenas, the guard drops the arena.
#[clippy::has_significant_drop]
pub struct PoolGuard<'pool, T, A: Allocator>
where
    T: ResetAllocator,
{
    pool: &'pool Pool<T, A>,
    arena: ManuallyDrop<T>,
}

impl<T, A: Allocator> Deref for PoolGuard<'_, T, A>
where
    T: ResetAllocator,
{
    type Target = T;

    #[inline]
    fn deref(&self) -> &T {
        &self.arena
    }
}

impl<T, A: Allocator> DerefMut for PoolGuard<'_, T, A>
where
    T: ResetAllocator,
{
    #[inline]
    fn deref_mut(&mut self) -> &mut T {
        &mut self.arena
    }
}

impl<T, A: Allocator> Drop for PoolGuard<'_, T, A>
where
    T: ResetAllocator,
{
    fn drop(&mut self) {
        // SAFETY: `drop` runs once for a value, and no code reads `self.arena` after this call.
        let mut arena = unsafe { ManuallyDrop::take(&mut self.arena) };
        arena.reset();

        let mut arenas = self.pool.arenas.lock();

        if arenas.len() < self.pool.max_size {
            arenas.push(arena);
        }
    }
}

// Threads share a pool, and a guard moves to the thread that uses it.
const _: () = {
    const fn assert_send<T: Send>() {}
    const fn assert_sync<T: Sync>() {}

    assert_send::<Pool<super::Scratch, Global>>();
    assert_sync::<Pool<super::Scratch, Global>>();
    assert_send::<PoolGuard<'_, super::Scratch, Global>>();

    assert_send::<Pool<super::Heap, Global>>();
    assert_sync::<Pool<super::Heap, Global>>();
    assert_send::<PoolGuard<'_, super::Heap, Global>>();
};

#[cfg(test)]
mod tests {
    use alloc::alloc::Global;
    use core::ptr;

    use super::Pool;
    use crate::heap2::{Heap, PhaseAllocator, Scratch, SymbolAllocator as _};

    fn sum_in<'alloc, A>(alloc: A, values: &[u32]) -> u32
    where
        A: PhaseAllocator<'alloc>,
    {
        alloc.alloc_slice_copy(values).iter().sum()
    }

    #[test]
    fn get_reuses_returned_arena() {
        let pool = Pool::<Scratch, Global>::new();

        let guard = pool.get();
        let first = ptr::from_mut(guard.alloc(1_u64));
        drop(guard);

        let guard = pool.get();
        let second = ptr::from_mut(guard.alloc(2_u64));

        assert_eq!(first, second);
        assert_eq!(pool.arenas.lock().len(), 0);

        drop(guard);
        assert_eq!(pool.arenas.lock().len(), 1);
    }

    #[test]
    fn get_creates_arena_for_each_live_guard() {
        let pool = Pool::<Scratch, Global>::new();

        let first = pool.get();
        let second = pool.get();

        assert_eq!(sum_in(&*first, &[1, 2]), 3);
        assert_eq!(sum_in(&*second, &[3, 4]), 7);

        drop(first);
        drop(second);
        assert_eq!(pool.arenas.lock().len(), 2);
    }

    #[test]
    fn bounded_drops_excess_arena() {
        let pool = Pool::<Scratch, Global>::bounded(1);

        let first = pool.get();
        let second = pool.get();
        drop(first);
        drop(second);

        assert_eq!(pool.arenas.lock().len(), 1);
    }

    #[test]
    fn guard_resolves_arena_methods() {
        let pool = Pool::<Heap, Global>::new();

        let guard = pool.get();
        let symbol = guard.alloc_symbol("pooled name");

        assert_eq!(*guard.alloc(symbol), symbol);
        drop(guard);
    }
}
