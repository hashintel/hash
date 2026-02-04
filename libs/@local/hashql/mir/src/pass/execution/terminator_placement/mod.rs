use alloc::alloc::Global;
use core::{
    alloc::Allocator,
    iter,
    ops::{Index, IndexMut},
};

use hashql_core::{
    graph::algorithms::{
        Tarjan,
        tarjan::{Metadata, SccId, StronglyConnectedComponents},
    },
    heap::Heap,
    id::{Id as _, bit_vec::BitRelations as _},
};

use super::{
    Cost,
    target::{TargetBitSet, TargetId},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
        basic_blocks::BasicBlocks,
        terminator::TerminatorKind,
    },
    context::MirContext,
    pass::analysis::{
        SizeEstimationAnalysis,
        dataflow::{
            LivenessAnalysis,
            framework::{DataflowAnalysis, DataflowResults},
        },
        size_estimation::BodyFootprint,
    },
};

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct TransMatrix {
    matrix: [Option<Cost>; TargetId::VARIANT_COUNT * TargetId::VARIANT_COUNT],
}

impl TransMatrix {
    pub const fn new() -> Self {
        Self {
            matrix: [None; TargetId::VARIANT_COUNT * TargetId::VARIANT_COUNT],
        }
    }

    #[inline]
    fn index(&self, from: TargetId, to: TargetId) -> usize {
        from.as_usize() * TargetId::VARIANT_COUNT + to.as_usize()
    }

    pub fn get(&self, from: TargetId, to: TargetId) -> Option<Cost> {
        self.matrix[self.index(from, to)]
    }

    pub fn get_mut(&mut self, from: TargetId, to: TargetId) -> &mut Option<Cost> {
        &mut self.matrix[self.index(from, to)]
    }

    pub fn insert(&mut self, from: TargetId, to: TargetId, cost: Cost) {
        self.matrix[self.index(from, to)] = Some(cost);
    }

    pub fn clear(&mut self) {
        self.matrix.fill(None);
    }

    pub fn remove_to_target(&mut self, target: TargetId) {
        for from in TargetId::all() {
            if from == target {
                // self loops are allowed
                continue;
            }

            self.matrix[self.index(from, target)] = None;
        }
    }

    pub fn remove_connections_to(&mut self, target: TargetId) {
        for from in TargetId::all() {
            self.matrix[self.index(from, target)] = None;
            self.matrix[self.index(target, from)] = None;
        }
    }
}

impl Index<(TargetId, TargetId)> for TransMatrix {
    type Output = Option<Cost>;

    fn index(&self, (from, to): (TargetId, TargetId)) -> &Self::Output {
        &self.matrix[self.index(from, to)]
    }
}

impl IndexMut<(TargetId, TargetId)> for TransMatrix {
    fn index_mut(&mut self, (from, to): (TargetId, TargetId)) -> &mut Self::Output {
        &mut self.matrix[self.index(from, to)]
    }
}

pub struct TerminatorCostVec<A: Allocator = Global> {
    offsets: Box<BasicBlockSlice<u32>, A>,
    costs: Vec<TransMatrix, A>,
}

impl<A: Allocator> TerminatorCostVec<A> {
    #[expect(unsafe_code)]
    fn offsets(
        mut iter: impl ExactSizeIterator<Item = u32>,
        alloc: A,
    ) -> (Box<BasicBlockSlice<u32>, A>, usize) {
        let mut offsets = Box::new_uninit_slice_in(iter.len() + 1, alloc);

        let mut offset = 0_u32;

        offsets[0].write(0);

        let (_, rest) = offsets[1..].write_iter(iter::from_fn(|| {
            let next = iter.next()?;

            offset += next;

            Some(offset)
        }));

        debug_assert!(rest.is_empty());
        debug_assert_eq!(iter.len(), 0);

        // SAFETY: We have initialized all elements of the slice.
        let offsets = unsafe { offsets.assume_init() };
        let offsets = BasicBlockSlice::from_boxed_slice(offsets);

        (offsets, offset as usize)
    }

    fn from_iter(iter: impl ExactSizeIterator<Item = u32>, alloc: A) -> Self
    where
        A: Clone,
    {
        let (offsets, length) = Self::offsets(iter, alloc.clone());
        let costs = alloc::vec::from_elem_in(TransMatrix::new(), length, alloc);

        Self { offsets, costs }
    }

    pub fn new(blocks: &BasicBlocks, alloc: A) -> Self
    where
        A: Clone,
    {
        Self::from_iter(
            blocks.iter().map(|block| match &block.terminator.kind {
                TerminatorKind::SwitchInt(switch_int) => switch_int.targets.targets().len() as u32,
                TerminatorKind::Return(_) | TerminatorKind::Unreachable => 0,
                TerminatorKind::Goto(_) | TerminatorKind::GraphRead(_) => 1,
            }),
            alloc,
        )
    }

    pub fn of(&self, block: BasicBlockId) -> &[TransMatrix] {
        let range = (self.offsets[block] as usize)..(self.offsets[block.plus(1)] as usize);

        &self.costs[range]
    }

    pub fn of_mut(&mut self, block: BasicBlockId) -> &mut [TransMatrix] {
        let range = (self.offsets[block] as usize)..(self.offsets[block.plus(1)] as usize);

        &mut self.costs[range]
    }
}

struct ComponentCountMetadata;

impl<N, S> Metadata<N, S> for ComponentCountMetadata {
    type Annotation = u32;

    fn annotate_node(&mut self, _: N) -> Self::Annotation {
        1
    }

    fn annotate_scc(&mut self, _: S, _: N) -> Self::Annotation {
        0
    }

    fn merge_into_scc(&mut self, lhs: &mut Self::Annotation, other: Self::Annotation) {
        *lhs += other;
    }

    fn merge_reachable(&mut self, _: &mut Self::Annotation, _: &Self::Annotation) {}
}

fn place<'heap, A: Allocator, F: Allocator>(
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    footprint: &BodyFootprint<F>,
    targets: &BasicBlockSlice<TargetBitSet>,
    alloc: A,
) -> TerminatorCostVec<&'heap Heap> {
    let DataflowResults {
        analysis: _,
        entry_states: _,
        exit_states: liveness,
    } = LivenessAnalysis.iterate_to_fixpoint_in(body, &alloc);

    let scc: StronglyConnectedComponents<BasicBlockId, SccId, ComponentCountMetadata, &A> =
        Tarjan::new_with_metadata_in(&body.basic_blocks, ComponentCountMetadata, &alloc).run();

    let mut output = TerminatorCostVec::new(&body.basic_blocks, context.heap);

    // TODO: entity size estimation we need aka how many entities do we need to send over, right now
    // we only know it's one.

    for (id, block) in body.basic_blocks.iter_enumerated() {
        // TODO: we must find the footprint, and then add that. The problem is how do we condense it
        // down. I would like to get an estimate cost here by averaging the units. For the
        // footprint, we could say that we neglect the env, and set the entity to unknown. What we
        // must make sure is that liveness analysis does not take into consideration partial use of
        // entity if it's in a direct load, because we *really really* like to discourage them.

        let block_targets = targets[id];

        let matrices = output.of_mut(id);
        for (index, successor) in block.terminator.kind.successor_blocks().enumerate() {
            let matrix = &mut matrices[index];

            // First every common ancestor of the block can be set
            let successor_targets = targets[successor];
            let mut common = successor_targets;
            common.intersect(&block_targets);

            for target in &common {
                // Our initial analysis does not attribute costs to edges. This is done in a
                // post-processing step once we know how many variables need to be transferred.
                matrix.insert(target, target, cost!(0));
            }

            // Move to the interpreter is always allowed
            if successor_targets.contains(TargetId::Interpreter) {
                for target in &block_targets {
                    matrix.insert(target, TargetId::Interpreter, cost!(0));
                }
            }

            // Otherwise, it depends on the terminator
            match &block.terminator.kind {
                TerminatorKind::Goto(_) => {
                    // goto allows move to arbitrary targets
                    for source in &block_targets {
                        for target in &successor_targets {
                            matrix.insert(source, target, cost!(0));
                        }
                    }
                }
                TerminatorKind::SwitchInt(_) => {
                    // Due to the complexity, switch does not allow move to arbitrary targets
                }
                TerminatorKind::GraphRead(_) => {
                    // Graph read is only allowed to be Interpreter -> Interpreter
                    matrix.clear();

                    if block_targets.contains(TargetId::Interpreter)
                        && successor_targets.contains(TargetId::Interpreter)
                    {
                        matrix.insert(TargetId::Interpreter, TargetId::Interpreter, cost!(0));
                    }
                }
                TerminatorKind::Return(_) | TerminatorKind::Unreachable => unreachable!(),
            }

            // A move back from a Backend to Postgres is not possible
            matrix.remove_to_target(TargetId::Postgres);

            let &members = scc.annotation(scc.scc(id));
            if members > 1 {
                // Because of the limitations of postgres (we cannot model loops in declarative
                // queries easily), we're unable to provision loops onto the
                // Postgres backend.
                matrix.remove_connections_to(TargetId::Postgres);
            }
        }
    }

    output
}
