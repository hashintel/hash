use core::{alloc::Allocator, marker::PhantomData};
use std::alloc::Global;

#[derive(Clone, Eq, PartialEq, Hash)]
pub struct BitMatrix<R, C, A: Allocator = Global> {
    row_domain_size: usize,
    col_domain_size: usize,
    words: Vec<u64, A>,
    marker: PhantomData<(R, C)>,
}
