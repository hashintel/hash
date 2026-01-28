use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    iter,
    ops::{Index, IndexMut},
};

use hashql_core::id::Id as _;

use crate::body::{basic_block::BasicBlockSlice, basic_blocks::BasicBlocks, location::Location};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Cost(core::num::niche_types::U32NotAllOnes);

impl Cost {
    pub const fn new(value: u32) -> Option<Self> {
        match core::num::niche_types::U32NotAllOnes::new(value) {
            Some(cost) => Some(Self(cost)),
            None => None,
        }
    }

    #[doc(hidden)]
    #[track_caller]
    pub const fn new_panic(value: u32) -> Self {
        match core::num::niche_types::U32NotAllOnes::new(value) {
            Some(cost) => Self(cost),
            None => panic!("invalid cost value"),
        }
    }

    #[expect(unsafe_code)]
    pub unsafe fn new_unchecked(value: u32) -> Self {
        Self(unsafe { core::num::niche_types::U32NotAllOnes::new_unchecked(value) })
    }
}

pub struct CostVec<A: Allocator = Global> {
    offsets: Box<BasicBlockSlice<u32>, A>,
    costs: Vec<Option<Cost>, A>,
}

impl<A: Allocator> CostVec<A> {
    #[expect(unsafe_code)]
    pub fn new(blocks: &BasicBlocks, alloc: A) -> Self
    where
        A: Clone,
    {
        let mut offsets = Box::new_uninit_slice_in(blocks.len() + 1, alloc.clone());

        let mut offset = 0_u32;
        let mut remaining = blocks.as_raw();

        offsets[0].write(0);
        let (_, rest) = offsets[1..].write_iter(iter::from_fn(|| {
            let (next, rest) = remaining.split_first()?;

            remaining = rest;

            let length = next.statements.len();
            offset += length as u32;

            Some(offset)
        }));

        debug_assert!(rest.is_empty());
        debug_assert!(remaining.is_empty());

        let costs = alloc::vec::from_elem_in(None, offset as usize, alloc);

        // SAFETY: We have initialized all elements of the slice.
        let offsets = unsafe { offsets.assume_init() };
        let offsets = BasicBlockSlice::from_boxed_slice(offsets);

        Self { offsets, costs }
    }

    pub fn get(&self, location: Location) -> Option<Cost> {
        let range = (self.offsets[location.block] as usize)
            ..(self.offsets[location.block.plus(1)] as usize);

        // statement_index is 1 based
        self.costs[range]
            .get(location.statement_index - 1)
            .copied()
            .flatten()
    }
}

impl<A: Allocator> Index<Location> for CostVec<A> {
    type Output = Option<Cost>;

    fn index(&self, index: Location) -> &Self::Output {
        let range =
            (self.offsets[index.block] as usize)..(self.offsets[index.block.plus(1)] as usize);

        &self.costs[range][index.statement_index - 1] // statement_index is 1 based
    }
}

impl<A: Allocator> IndexMut<Location> for CostVec<A> {
    fn index_mut(&mut self, index: Location) -> &mut Self::Output {
        let range =
            (self.offsets[index.block] as usize)..(self.offsets[index.block.plus(1)] as usize);

        &mut self.costs[range][index.statement_index - 1] // statement_index is 1 based
    }
}
