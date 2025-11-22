mod hash_map;
pub mod pool;
mod work_queue;

use alloc::alloc::Global;
use core::alloc::Allocator;

use hashbrown::{HashMap, HashSet};

pub use self::{hash_map::HashMapExt, work_queue::WorkQueue};

pub type ConcurrentHashMap<K, V> = scc::HashMap<K, V, foldhash::fast::RandomState>;
pub type ConcurrentHashSet<T> = scc::HashSet<T, foldhash::fast::RandomState>;

pub type FastHashMap<K, V, A = Global> = HashMap<K, V, foldhash::fast::RandomState, A>;
pub type FastHashMapEntry<'map, K, V, A = Global> =
    hashbrown::hash_map::Entry<'map, K, V, foldhash::fast::RandomState, A>;
pub type FastHashSet<T, A = Global> = HashSet<T, foldhash::fast::RandomState, A>;
pub type FastHashSetEntry<'map, T, A = Global> =
    hashbrown::hash_set::Entry<'map, T, foldhash::fast::RandomState, A>;

#[inline]
#[must_use]
pub fn fast_hash_map<K, V>(capacity: usize) -> FastHashMap<K, V> {
    FastHashMap::with_capacity_and_hasher(capacity, foldhash::fast::RandomState::default())
}

#[inline]
#[must_use]
pub fn fast_hash_map_in<K, V, A: Allocator>(capacity: usize, allocator: A) -> FastHashMap<K, V, A> {
    FastHashMap::with_capacity_and_hasher_in(
        capacity,
        foldhash::fast::RandomState::default(),
        allocator,
    )
}

#[inline]
#[must_use]
pub fn fast_hash_set<T>(capacity: usize) -> FastHashSet<T> {
    FastHashSet::with_capacity_and_hasher(capacity, foldhash::fast::RandomState::default())
}

#[inline]
#[must_use]
pub fn fast_hash_set_in<T, A: Allocator>(
    capacity: Option<usize>,
    allocator: A,
) -> FastHashSet<T, A> {
    let Some(capacity) = capacity else {
        return FastHashSet::with_hasher_in(foldhash::fast::RandomState::default(), allocator);
    };

    FastHashSet::with_capacity_and_hasher_in(
        capacity,
        foldhash::fast::RandomState::default(),
        allocator,
    )
}

pub type TinyVec<T> = smallvec::SmallVec<T, 4>;
pub type SmallVec<T> = smallvec::SmallVec<T, 16>;
