use core::{alloc::Allocator, marker::PhantomData};
use std::alloc::Global;

pub struct BitVec<I, A: Allocator = Global> {
    domain_size: usize,
    words: Box<[u64], A>,
    marker: PhantomData<I>,
}

// TODO: finish, take a look at the existing BitSet impl in hashql-core, reference that this is
// going to be superseded by it at some point.
