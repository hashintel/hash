mod csp;
mod estimate;

use core::{alloc::Allocator, mem};

use hashql_core::{
    graph::{
        DirectedGraph as _, LinkedGraph, NodeId,
        algorithms::{
            Tarjan,
            tarjan::{MembersRef, StronglyConnectedComponents},
        },
    },
    heap::BumpAllocator,
    id::{self, Id as _, bit_vec::DenseBitSet},
};

use self::{
    csp::{ConstraintSatisfaction, PlacementBlock},
    estimate::{CostEstimation, CostEstimationConfig, HeapElement, TargetHeap},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
    },
    pass::execution::{
        StatementCostVec,
        target::{TargetArray, TargetBitSet},
        terminator_placement::{TerminatorCostVec, TransMatrix},
    },
};

id::newtype!(struct PlacementRegionId(u32 is 0..=0xFFFF_FF00));

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
struct TrivialPlacementRegion {
    block: BasicBlockId,
}

#[derive(Debug)]
struct CyclicPlacementRegion<'alloc> {
    members: &'alloc [BasicBlockId],

    blocks: &'alloc mut [PlacementBlock],
    scratch: &'alloc mut [PlacementBlock],
}

#[derive(Debug)]
enum PlacementRegionKind<'alloc> {
    Trivial(TrivialPlacementRegion),
    Cyclic(CyclicPlacementRegion<'alloc>),
    Unassigned,
}

#[derive(Debug)]
struct PlacementRegion<'alloc> {
    id: PlacementRegionId,
    kind: PlacementRegionKind<'alloc>,
}

#[derive(Debug)]
pub struct BoundaryEdge {
    source: BasicBlockId,
    target: BasicBlockId,
    matrix: TransMatrix,
}

#[derive(Debug, Copy, Clone)]
pub struct CondenseData<'ctx, A: Allocator> {
    pub assignment: &'ctx BasicBlockSlice<TargetBitSet>,
    pub statements: &'ctx TargetArray<StatementCostVec<A>>,
    pub terminators: &'ctx TerminatorCostVec<A>,
}

impl<'ctx, A: Allocator> CondenseData<'ctx, A> {
    fn run_in<'alloc, S>(self, body: &Body<'_>, alloc: &'alloc S) -> Condense<'ctx, 'alloc, A, S>
    where
        S: BumpAllocator,
    {
        let scc = Tarjan::new_in(&body.basic_blocks, alloc).run();
        let scc_members = scc.bump_members();

        // We use a backup slice, instead of directly operating on the target set, so that we're
        // able to switch and backup easily between iterations.
        let targets = {
            let uninit = alloc.allocate_slice_uninit(body.basic_blocks.len());
            BasicBlockSlice::from_raw_mut(uninit.write_filled(None))
        };

        let options = {
            let uninit = alloc.allocate_slice_uninit(body.basic_blocks.len());
            BasicBlockSlice::from_raw_mut(uninit.write_filled(TargetHeap::new()))
        };

        let graph = LinkedGraph::with_capacity_in(scc.node_count(), self.terminators.len(), alloc);

        Condense {
            data: self,
            scc,
            scc_members,
            graph,
            options,
            targets,
            alloc,
        }
    }
}

pub struct Condense<'ctx, 'alloc, A: Allocator, S: BumpAllocator> {
    data: CondenseData<'ctx, A>,

    scc: StronglyConnectedComponents<BasicBlockId, PlacementRegionId, (), &'alloc S>,
    scc_members: MembersRef<'alloc, BasicBlockId, PlacementRegionId>,

    graph: LinkedGraph<PlacementRegion<'alloc>, BoundaryEdge, &'alloc S>,

    options: &'alloc mut BasicBlockSlice<TargetHeap>,
    targets: &'alloc mut BasicBlockSlice<Option<HeapElement>>,

    alloc: &'alloc S,
}

impl<'ctx, 'alloc, A: Allocator, S: BumpAllocator> Condense<'ctx, 'alloc, A, S> {
    fn run(&mut self, body: &Body<'_>) {
        self.fill_graph(body);

        unimplemented!()
    }

    fn run_forwards_loop<B: BumpAllocator>(&mut self, body: &Body<'_>) {
        // Now that we have all the edges we must do a forwards and backwards sweep, scc gives us
        // the reverse topological order, meaning that the forwards is simply the backwards
        // traversal of the scc.

        // TODO: we can probably re-use this buffer
        let mut regions = Vec::with_capacity_in(self.scc.node_count(), self.alloc);
        self.scc.iter_nodes().collect_into(&mut regions);

        debug_assert!(!regions.is_empty()); // there is always at least one region because the start block exists
        let mut ptr = 0;

        while ptr < regions.len() {
            let region_id = regions[ptr];
            let region = &mut self.graph[NodeId::new(region_id.as_usize())];
            let kind = mem::replace(&mut region.data.kind, PlacementRegionKind::Unassigned);

            let kind = match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    let mut heap = CostEstimation {
                        config: CostEstimationConfig::TRIVIAL,
                        condense: self,
                        determine_target: |block| self.targets[block],
                    }
                    .run(body, region_id, block);

                    let Some(elem) = heap.pop() else {
                        // TODO: rewind, because it's not possible, must take CSP into account
                        todo!("rewind");
                    };

                    self.targets[block] = Some(elem);
                    self.options[block] = heap;

                    kind
                }
                PlacementRegionKind::Cyclic(cyclic) => {
                    let mut csp = ConstraintSatisfaction {
                        condense: self,
                        id: region_id,
                        region: cyclic,
                        fixed: DenseBitSet::new_empty(body.basic_blocks.len()),
                        depth: 0,
                    };

                    if !csp.solve(body) {
                        // TODO: wasn't able to find a solution
                        todo!("rewind")
                    }

                    for block in &*csp.region.blocks {
                        csp.condense.targets[block.id] = Some(block.target);
                    }

                    PlacementRegionKind::Cyclic(csp.region)
                }
                PlacementRegionKind::Unassigned => {
                    panic!("previous iteration has not returned this node into the graph")
                }
            };

            self.graph[NodeId::new(region_id.as_usize())].data.kind = kind;

            ptr += 1;
        }
    }

    fn fill_graph(&mut self, body: &Body<'_>) {
        for scc in self.scc.iter_nodes() {
            let members = self.scc_members.of(scc);

            let kind = match members {
                [] => unreachable!(),
                &[member] => PlacementRegionKind::Trivial(TrivialPlacementRegion { block: member }),
                members => {
                    let len = members.len();

                    let blocks = self
                        .alloc
                        .allocate_slice_uninit(len)
                        .write_filled(PlacementBlock::PLACEHOLDER);
                    let scratch = self
                        .alloc
                        .allocate_slice_uninit(len)
                        .write_filled(PlacementBlock::PLACEHOLDER);

                    PlacementRegionKind::Cyclic(CyclicPlacementRegion {
                        members,
                        blocks,
                        scratch,
                    })
                }
            };

            let id = self.graph.add_node(PlacementRegion { id: scc, kind });
            debug_assert_eq!(scc.as_usize(), id.as_usize());
        }

        for (source, source_block) in body.basic_blocks.iter_enumerated() {
            let matrices = self.data.terminators.of(source);
            for (index, target) in source_block.terminator.kind.successor_blocks().enumerate() {
                let source_scc = self.scc.scc(source);
                let target_scc = self.scc.scc(target);

                self.graph.add_edge(
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
