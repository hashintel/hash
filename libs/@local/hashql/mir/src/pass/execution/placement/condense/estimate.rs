use core::{alloc::Allocator, cmp};

use hashql_core::graph::linked::Node;

use super::{Condense, CondenseContext, PlacementRegion};
use crate::{
    body::basic_block::BasicBlockId,
    pass::execution::{
        ApproxCost, Cost,
        target::{TargetArray, TargetId},
    },
};

#[derive(Debug, Copy, Clone)]
struct HeapElement {
    target: TargetId,
    cost: ApproxCost,
}

impl PartialEq for HeapElement {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other).is_eq()
    }
}

impl Eq for HeapElement {}

impl PartialOrd for HeapElement {
    fn partial_cmp(&self, other: &Self) -> Option<cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for HeapElement {
    fn cmp(&self, other: &Self) -> cmp::Ordering {
        self.cost.cmp(&other.cost)
    }
}

struct TargetHeap {
    targets: [HeapElement; TargetId::VARIANT_COUNT],

    index: u8,
    length: u8,
}

impl TargetHeap {
    const EMPTY: Self = Self {
        targets: [HeapElement {
            target: TargetId::Interpreter,
            cost: ApproxCost::ZERO,
        }; TargetId::VARIANT_COUNT],
        index: 0,
        length: 0,
    };

    const fn new() -> Self {
        Self::EMPTY
    }

    fn insert(&mut self, target: TargetId, cost: ApproxCost) {
        assert!(self.length < TargetId::VARIANT_COUNT_U8);

        let index = self.length as usize;
        self.length += 1;

        self.targets[index] = HeapElement { target, cost };
        self.targets[(self.index as usize)..(self.length as usize)].sort_unstable();
    }

    const fn reset(&mut self) {
        self.length = 0;
        self.index = 0;
    }

    const fn pop(&mut self) -> Option<HeapElement> {
        if self.index >= self.length {
            return None;
        }

        let element = self.targets[self.index as usize];
        self.index += 1;

        Some(element)
    }

    const fn is_empty(&self) -> bool {
        self.index >= self.length
    }

    const fn len(&self) -> usize {
        self.length.saturating_sub(self.index) as usize
    }
}

pub(crate) struct CostEstimation<'ctx, 'parent, 'scc, A: Allocator, B: Allocator> {
    condense: &'ctx Condense<'parent, A>,
    context: &'ctx CondenseContext<'scc, B>,

    region: &'ctx Node<PlacementRegion<'scc>>,
    block: BasicBlockId,
}
