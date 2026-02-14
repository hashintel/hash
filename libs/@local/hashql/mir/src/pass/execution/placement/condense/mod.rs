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
    heap::{BumpAllocator, Heap},
    id::{self, Id as _, bit_vec::DenseBitSet},
};

use self::{
    csp::{ConstraintSatisfaction, PlacementBlock},
    estimate::{CostEstimation, CostEstimationConfig, HeapElement, TargetHeap},
};
use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice, BasicBlockVec},
    },
    pass::execution::{
        ApproxCost, StatementCostVec,
        target::{TargetArray, TargetBitSet, TargetId},
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
    fixed: DenseBitSet<BasicBlockId>,
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
    fn run<'heap>(&mut self, body: &Body<'heap>) -> BasicBlockVec<TargetId, &'heap Heap> {
        self.fill_graph(body);

        let mut regions = Vec::with_capacity_in(self.scc.node_count(), self.alloc);
        self.scc.iter_nodes().collect_into(&mut regions);

        if !self.run_forwards_loop(body, &regions) {
            todo!("issue diagnostic")
        }
        if !self.run_backwards_loop(body, &regions) {
            todo!("issue diagnostic")
        }

        // flush the result to the actual target slices
        let mut output =
            BasicBlockVec::with_capacity_in(body.basic_blocks.len(), *body.local_decls.allocator());
        for target in &*self.targets {
            let Some(elem) = target else {
                unreachable!("all targets must've been assigned")
            };

            output.push(elem.target);
        }

        output
    }

    /// Walk backward from `failed` through the assignment stack, looking for a region that can
    /// change its assignment. Returns the index to resume the forward pass from, or `None` if
    /// all possibilities are exhausted.
    fn rewind(
        &mut self,
        body: &Body<'_>,
        regions: &[PlacementRegionId],
        failed: usize,
    ) -> Option<usize> {
        // Walk backward through already-processed regions
        let mut candidate = failed;

        while candidate > 0 {
            candidate -= 1;

            let region_id = regions[candidate];
            let region = &mut self.graph[NodeId::new(region_id.as_usize())];
            let kind = mem::replace(&mut region.data.kind, PlacementRegionKind::Unassigned);

            match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    if let Some(elem) = self.options[block].pop() {
                        // Found an alternative — apply the new assignment, and resume from the next
                        // region.
                        self.targets[block] = Some(elem);

                        self.graph[NodeId::new(region_id.as_usize())].data.kind = kind;
                        return Some(candidate + 1);
                    }

                    // This trivial region is also exhausted — undo its assignment and keep
                    // walking back.
                    self.targets[block] = None;
                    self.graph[NodeId::new(region_id.as_usize())].data.kind = kind;
                }
                PlacementRegionKind::Cyclic(cyclic) => {
                    let mut csp = ConstraintSatisfaction {
                        condense: self,
                        id: region_id,
                        region: cyclic,
                        depth: 0,
                    };

                    if csp.next(body) {
                        // Found a perturbation — flush the new assignments, and resume.
                        for block in &*csp.region.blocks {
                            csp.condense.targets[block.id] = Some(block.target);
                        }

                        self.graph[NodeId::new(region_id.as_usize())].data.kind =
                            PlacementRegionKind::Cyclic(csp.region);
                        return Some(candidate + 1);
                    }

                    // All heaps exhausted — undo this region's assignments and keep walking.
                    for &member in csp.region.members {
                        csp.condense.targets[member] = None;
                    }

                    self.graph[NodeId::new(region_id.as_usize())].data.kind =
                        PlacementRegionKind::Cyclic(csp.region);
                }
                PlacementRegionKind::Unassigned => {
                    panic!("previous iteration has not returned this node into the graph")
                }
            }
        }

        None // all possibilities exhausted
    }

    fn run_backwards_loop(&mut self, body: &Body<'_>, regions: &[PlacementRegionId]) -> bool {
        // Go through the elements in reverse order, and try to see if there's a better assignment
        // (the delta between the values is negative)

        debug_assert!(!regions.is_empty()); // there is always at least one region because the start block exists
        let mut ptr = regions.len();

        while ptr > 0 {
            ptr -= 1;

            let region_id = regions[ptr];
            let region = &mut self.graph[NodeId::new(region_id.as_usize())];
            let kind = mem::replace(&mut region.data.kind, PlacementRegionKind::Unassigned);

            let kind = match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    let estimator = CostEstimation {
                        config: CostEstimationConfig::TRIVIAL,
                        condense: self,
                        determine_target: |block| self.targets[block],
                    };

                    let prev = estimator
                        .estimate(
                            body,
                            region_id,
                            block,
                            self.targets[block]
                                .expect("previous iteration must've set it")
                                .target,
                        )
                        .expect("previous run has verified this, so this should now as well");

                    let mut heap = estimator.run(body, region_id, block);

                    let Some(elem) = heap.pop() else {
                        // Nothing to do, so just don't.
                        self.graph[NodeId::new(region_id.as_usize())].data.kind = kind;
                        continue;
                    };

                    if prev > elem.cost {
                        self.targets[block] = Some(elem);
                    }

                    kind
                }
                PlacementRegionKind::Cyclic(cyclic) => {
                    let mut csp = ConstraintSatisfaction {
                        condense: self,
                        id: region_id,
                        region: cyclic,
                        depth: 0,
                    };

                    if !csp.solve(body) {
                        // Nothing to do, we already have a valid solution
                        self.graph[NodeId::new(region_id.as_usize())].data.kind =
                            PlacementRegionKind::Cyclic(csp.region);
                        continue;
                    }

                    let region = csp.region;

                    let estimator = CostEstimation {
                        config: CostEstimationConfig::LOOP,
                        condense: self,
                        determine_target: |block: BasicBlockId| self.targets[block],
                    };

                    // because we might have a *completely* different interior layout, we must
                    // compare the total cost
                    let prev_total_cost: ApproxCost = region
                        .members
                        .iter()
                        .map(|&id| {
                            estimator
                                .estimate(
                                    body,
                                    region_id,
                                    id,
                                    self.targets[id]
                                        .expect("should have assigned in previous iteration")
                                        .target,
                                )
                                .expect("previous had a solution, so this one must now as well")
                        })
                        .sum();

                    let next_total_cost: ApproxCost =
                        region.blocks.iter().map(|block| block.target.cost).sum();

                    if prev_total_cost > next_total_cost {
                        for block in &*region.blocks {
                            self.targets[block.id] = Some(block.target);
                        }
                    }

                    PlacementRegionKind::Cyclic(region)
                }
                PlacementRegionKind::Unassigned => {
                    panic!("previous iteration has not returned this node into the graph")
                }
            };

            self.graph[NodeId::new(region_id.as_usize())].data.kind = kind;
        }

        true
    }

    fn run_forwards_loop(&mut self, body: &Body<'_>, regions: &[PlacementRegionId]) -> bool {
        // Now that we have all the edges we must do a forwards and backwards sweep, scc gives us
        // the reverse topological order, meaning that the forwards is simply the backwards
        // traversal of the scc.
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
                        self.graph[NodeId::new(region_id.as_usize())].data.kind = kind;

                        let Some(rewound) = self.rewind(body, regions, ptr) else {
                            return false;
                        };

                        ptr = rewound;
                        continue;
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
                        depth: 0,
                    };

                    if !csp.solve(body) {
                        let region = PlacementRegionKind::Cyclic(csp.region);
                        self.graph[NodeId::new(region_id.as_usize())].data.kind = region;

                        let Some(rewound) = self.rewind(body, regions, ptr) else {
                            return false;
                        };

                        ptr = rewound;
                        continue;
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

        true
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

                    PlacementRegionKind::Cyclic(CyclicPlacementRegion {
                        members,
                        blocks,
                        fixed: DenseBitSet::new_empty(body.basic_blocks.len()),
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
