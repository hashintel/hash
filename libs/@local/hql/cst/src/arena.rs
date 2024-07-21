use core::alloc::Allocator;

use bumpalo::Bump;

pub type Box<'a, T> = alloc::boxed::Box<T, &'a Bump>;
pub type Vec<'a, T> = alloc::vec::Vec<T, &'a Bump>;

#[derive(Debug)]
pub struct Arena {
    bump: Bump,
}

impl Arena {
    pub fn new() -> Self {
        Self { bump: Bump::new() }
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            bump: Bump::with_capacity(capacity),
        }
    }

    pub fn vec<T>(&self, capacity: Option<usize>) -> Vec<'_, T> {
        match capacity {
            Some(capacity) => Vec::with_capacity_in(capacity, &self.bump),
            None => Vec::new_in(&self.bump),
        }
    }
}
