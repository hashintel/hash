mod estimate;
mod nested;

use core::alloc::Allocator;

use hashql_core::{
    graph::{
        DirectedGraph, LinkedGraph, NodeId,
        algorithms::{
            Tarjan,
            tarjan::{Members, StronglyConnectedComponents},
        },
    },
    heap::BumpAllocator,
    id::{self, Id},
};

use self::estimate::{CostEstimation, CostEstimationConfig, TargetHeap};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
    },
    pass::execution::{
        StatementCostVec,
        target::{TargetArray, TargetBitSet, TargetId},
        terminator_placement::{TerminatorCostVec, TransMatrix},
    },
};

id::newtype!(struct PlacementRegionId(u32 is 0..=0xFFFF_FF00));

pub struct PlacementRegion<'scc> {
    id: PlacementRegionId,
    members: &'scc [BasicBlockId],
}

pub struct BoundaryEdge {
    source: BasicBlockId,
    target: BasicBlockId,
    matrix: TransMatrix,
}

struct CondenseContext<'scc, 'alloc, A: Allocator> {
    scc: &'scc StronglyConnectedComponents<BasicBlockId, PlacementRegionId, (), &'alloc A>,
    scc_members: &'scc Members<BasicBlockId, PlacementRegionId, &'alloc A>,

    graph: LinkedGraph<PlacementRegion<'scc>, BoundaryEdge, &'alloc A>,

    options: &'alloc mut BasicBlockSlice<TargetHeap>,
    targets: &'alloc mut BasicBlockSlice<Option<TargetId>>,

    alloc: &'alloc A,
}

pub struct Condense<'ctx, A: Allocator> {
    pub targets: &'ctx BasicBlockSlice<TargetBitSet>,

    pub statements: &'ctx TargetArray<StatementCostVec<A>>,
    pub terminators: &'ctx TerminatorCostVec<A>,
}

impl<'ctx, A: Allocator> Condense<'ctx, A> {
    fn run_in<'alloc, B>(&self, body: &Body<'_>, alloc: &'alloc B)
    where
        B: BumpAllocator,
    {
        let scc = Tarjan::new_in(&body.basic_blocks, alloc).run();
        let scc_members = scc.members();

        // We use a backup slice, instead of directly operating on the target set, so that we're
        // able to switch and backup easily between iterations.
        let targets = {
            let uninit = alloc.allocate_slice_uninit(body.basic_blocks.len());
            BasicBlockSlice::from_raw_mut(uninit.write_filled(None::<TargetId>))
        };

        let options = {
            let uninit = alloc.allocate_slice_uninit(body.basic_blocks.len());
            BasicBlockSlice::from_raw_mut(uninit.write_filled(TargetHeap::new()))
        };

        let mut context = CondenseContext {
            scc: &scc,
            scc_members: &scc_members,
            graph: LinkedGraph::with_capacity_in(scc.node_count(), self.terminators.len(), alloc),
            options,
            targets,
            alloc,
        };

        self.fill_graph(body, &mut context);

        unimplemented!()
    }

    fn run_forwards_loop<B: BumpAllocator>(
        &self,
        body: &Body<'_>,
        context: &mut CondenseContext<'_, '_, B>,
    ) {
        // TODO: when re-computing the CSP we would shrimply take our queue that we have created
        // (need bump alloc for that), and then just change the first, and do that until the first
        // is completely exhausted (we need to re-compute anyway). A bit of a brute-force but I
        // don't see a better way.
        // NO WAIT, we just choose a mutation that has the lowest cost, and then re-compute the
        // branch.

        // Now that we have all the edges we must do a forwards and backwards sweep, scc gives us
        // the reverse topological order, meaning that the forwards is simply the backwards
        // traversal of the scc.

        // TODO: we can probably re-use this buffer
        let mut regions = Vec::with_capacity_in(context.scc.node_count(), context.alloc);
        context.scc.iter_nodes().collect_into(&mut regions);

        debug_assert!(!regions.is_empty()); // there is always at least one region because the start block exists
        let mut ptr = 0;

        while ptr < regions.len() {
            let region_id = regions[ptr];
            let region = &context.graph[NodeId::new(region_id.as_usize())];

            match region.data.members {
                [] => unreachable!("empty region"),
                &[block] => {
                    // trivial
                    let mut heap = CostEstimation {
                        config: CostEstimationConfig::TRIVIAL,
                        condense: self,
                        context,
                        region,
                    }
                    .run(body, block);

                    let Some(elem) = heap.pop() else {
                        // TODO: rewind, because it's not possible, must take CSP into account
                        todo!("rewind");
                    };

                    context.targets[block] = Some(elem.target);
                    context.options[block] = heap;
                }
                _ => {
                    todo!("solve CSP")
                }
            }

            ptr += 1;
        }
    }

    fn fill_graph<B: Allocator>(&self, body: &Body<'_>, context: &mut CondenseContext<'_, '_, B>) {
        for scc in context.scc.iter_nodes() {
            let id = context.graph.add_node(PlacementRegion {
                id: scc,
                members: context.scc_members.of(scc),
            });
            debug_assert_eq!(scc.as_usize(), id.as_usize());
        }

        for (source, source_block) in body.basic_blocks.iter_enumerated() {
            let matrices = self.terminators.of(source);
            for (index, target) in source_block.terminator.kind.successor_blocks().enumerate() {
                let source_scc = context.scc.scc(source);
                let target_scc = context.scc.scc(target);

                context.graph.add_edge(
                    NodeId::from_usize(source_scc.as_usize()),
                    NodeId::from_usize(target_scc.as_usize()),
                    BoundaryEdge {
                        source,
                        target,
                        matrix: matrices[index],
                    },
                );
            }
        }
    }
}
