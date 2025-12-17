use core::alloc::Allocator;

use super::{Heap, Scratch};

// TODO: in 2025-12-17 move to Allocator trait
pub trait BumpAllocator {
    fn reset(&mut self);
}

impl BumpAllocator for Heap {
    fn reset(&mut self) {
        self.reset();
    }
}

impl BumpAllocator for Scratch {
    fn reset(&mut self) {
        self.reset();
    }
}

impl<A> BumpAllocator for &mut A
where
    A: BumpAllocator,
{
    fn reset(&mut self) {
        A::reset(self);
    }
}
