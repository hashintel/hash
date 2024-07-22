use core::alloc::Allocator;

use bumpalo::Bump;

pub type Box<'a, T> = alloc::boxed::Box<T, &'a Bump>;
pub type Vec<'a, T> = alloc::vec::Vec<T, &'a Bump>;

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

    pub fn boxed<T>(&self, value: T) -> Box<'_, T> {
        Box::new_in(value, &self.bump)
    }
}
