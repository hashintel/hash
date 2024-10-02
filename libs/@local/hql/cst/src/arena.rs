use bumpalo::Bump;
use hashbrown::DefaultHashBuilder;

pub type Box<'a, T> = alloc::boxed::Box<T, &'a Bump>;
pub type Vec<'a, T> = alloc::vec::Vec<T, &'a Bump>;
pub type VecDeque<'a, T> = alloc::collections::vec_deque::VecDeque<T, &'a Bump>;
pub type HashMap<'a, K, V> = hashbrown::HashMap<K, V, DefaultHashBuilder, &'a Bump>;

#[derive(Debug)]
pub struct Arena {
    bump: Bump,
}

impl Arena {
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
            || Vec::new_in(&self.bump),
            |capacity| Vec::with_capacity_in(capacity, &self.bump),
        )
    }

    pub fn hash_map<K, V>(&self, capacity: Option<usize>) -> HashMap<'_, K, V> {
        capacity.map_or_else(
            || HashMap::new_in(&self.bump),
            |capacity| HashMap::with_capacity_in(capacity, &self.bump),
        )
    }

    pub fn dequeue<T>(&self, capacity: Option<usize>) -> VecDeque<'_, T> {
        capacity.map_or_else(
            || VecDeque::new_in(&self.bump),
            |capacity| VecDeque::with_capacity_in(capacity, &self.bump),
        )
    }

    pub fn boxed<T>(&self, value: T) -> Box<'_, T> {
        Box::new_in(value, &self.bump)
    }
}

impl Default for Arena {
    fn default() -> Self {
        Self::new()
    }
}
