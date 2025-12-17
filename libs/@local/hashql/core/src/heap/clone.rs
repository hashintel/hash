use std::alloc::Allocator;

pub trait CloneIn<A: Allocator>: Sized {
    type Cloned;

    fn clone_in(&self, allocator: A) -> Self::Cloned;
    fn clone_into(source: &Self, into: &mut Self::Cloned, allocator: A) {
        *into = source.clone_in(allocator);
    }
}
