mod condensation;
mod csp;
mod estimate;

use core::{
    alloc::Allocator,
    mem,
    ops::{ControlFlow, IndexMut},
};

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
    condensation::{
        Condensation, CyclicPlacementRegion, PlacementRegionKind, TrivialPlacementRegion,
    },
    csp::ConstraintSatisfaction,
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
        terminator_placement::TerminatorCostVec,
    },
};

id::newtype!(pub(crate) struct PlacementRegionId(u32 is 0..=0xFFFF_FF00));

#[derive(Debug, Copy, Clone)]
pub struct PlacementContext<'ctx, A: Allocator> {
    pub assignment: &'ctx BasicBlockSlice<TargetBitSet>,
    pub statements: &'ctx TargetArray<StatementCostVec<A>>,
    pub terminators: &'ctx TerminatorCostVec<A>,
}

impl<'ctx, A: Allocator> PlacementContext<'ctx, A> {
    fn run_in<'alloc, S>(
        self,
        body: &Body<'_>,
        alloc: &'alloc S,
    ) -> PlacementSolver<'ctx, 'alloc, A, S>
    where
        S: BumpAllocator,
    {
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

        let condensation = Condensation::new(body, self.terminators, alloc);

        PlacementSolver {
            data: self,
            condensation,

            options,
            targets,
            alloc,
        }
    }
}

pub struct PlacementSolver<'ctx, 'alloc, A: Allocator, S: BumpAllocator> {
    data: PlacementContext<'ctx, A>,

    condensation: Condensation<'alloc, S>,

    options: &'alloc mut BasicBlockSlice<TargetHeap>,
    targets: &'alloc mut BasicBlockSlice<Option<HeapElement>>,

    alloc: &'alloc S,
}

impl<'ctx, 'alloc, A: Allocator, S: BumpAllocator> PlacementSolver<'ctx, 'alloc, A, S> {
    fn run<'heap>(&mut self, body: &Body<'heap>) -> BasicBlockVec<TargetId, &'heap Heap> {
        let mut regions = Vec::with_capacity_in(self.condensation.node_count(), self.alloc);
        self.condensation
            .reverse_topological_order()
            .rev()
            .collect_into(&mut regions);

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
            let region = &mut self.condensation[region_id];
            let kind = mem::replace(&mut region.kind, PlacementRegionKind::Unassigned);

            match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    if let Some(elem) = self.options[block].pop() {
                        // Found an alternative — apply the new assignment, and resume from the next
                        // region.
                        self.targets[block] = Some(elem);

                        self.condensation[region_id].kind = kind;
                        return Some(candidate + 1);
                    }

                    // This trivial region is also exhausted — undo its assignment and keep
                    // walking back.
                    self.targets[block] = None;
                    self.condensation[region_id].kind = kind;
                }
                PlacementRegionKind::Cyclic(cyclic) => {
                    let mut csp = ConstraintSatisfaction::new(self, region_id, cyclic);

                    if csp.next(body) {
                        // Found a perturbation — flush the new assignments, and resume.
                        for block in &*csp.region.blocks {
                            csp.solver.targets[block.id] = Some(block.target);
                        }

                        self.condensation[region_id].kind = PlacementRegionKind::Cyclic(csp.region);
                        return Some(candidate + 1);
                    }

                    // All heaps exhausted — undo this region's assignments and keep walking.
                    for &member in csp.region.members {
                        csp.solver.targets[member] = None;
                    }

                    self.condensation[region_id].kind = PlacementRegionKind::Cyclic(csp.region);
                }
                PlacementRegionKind::Unassigned => {
                    panic!("previous iteration has not returned this node into the graph")
                }
            }
        }

        None // all possibilities exhausted
    }

    fn run_forwards_loop(&mut self, body: &Body<'_>, regions: &[PlacementRegionId]) -> bool {
        // Now that we have all the edges we must do a forwards and backwards sweep, scc gives us
        // the reverse topological order, meaning that the forwards is simply the backwards
        // traversal of the scc.
        debug_assert!(!regions.is_empty()); // there is always at least one region because the start block exists
        let mut ptr = 0;

        while ptr < regions.len() {
            let region_id = regions[ptr];
            let region = &mut self.condensation[region_id];
            let kind = mem::replace(&mut region.kind, PlacementRegionKind::Unassigned);

            let kind = match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    let mut heap = CostEstimation {
                        config: CostEstimationConfig::TRIVIAL,
                        solver: self,
                        determine_target: |block| self.targets[block],
                    }
                    .run(body, region_id, block);

                    let Some(elem) = heap.pop() else {
                        self.condensation[region_id].kind = kind;

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
                    let mut csp = ConstraintSatisfaction::new(self, region_id, cyclic);

                    if !csp.solve(body) {
                        let region = PlacementRegionKind::Cyclic(csp.region);
                        self.condensation[region_id].kind = region;

                        let Some(rewound) = self.rewind(body, regions, ptr) else {
                            return false;
                        };

                        ptr = rewound;
                        continue;
                    }

                    for block in &*csp.region.blocks {
                        csp.solver.targets[block.id] = Some(block.target);
                    }

                    PlacementRegionKind::Cyclic(csp.region)
                }
                PlacementRegionKind::Unassigned => {
                    panic!("previous iteration has not returned this node into the graph")
                }
            };

            self.condensation[region_id].kind = kind;

            ptr += 1;
        }

        true
    }

    fn run_backwards_loop(&mut self, body: &Body<'_>, regions: &[PlacementRegionId]) -> bool {
        // Go through the elements in reverse order, and try to see if there's a better assignment
        // (the delta between the values is negative)
        debug_assert!(!regions.is_empty()); // there is always at least one region because the start block exists
        let mut ptr = regions.len();

        while ptr > 0 {
            ptr -= 1;

            let region_id = regions[ptr];
            let region = &mut self.condensation[region_id];
            let kind = mem::replace(&mut region.kind, PlacementRegionKind::Unassigned);

            let kind = match kind {
                kind @ PlacementRegionKind::Trivial(TrivialPlacementRegion { block }) => {
                    self.adjust_trivial(body, region_id, block);
                    kind
                }
                PlacementRegionKind::Cyclic(cyclic) => self.adjust_cyclic(body, region_id, cyclic),
                PlacementRegionKind::Unassigned => {
                    panic!("previous iteration has not returned this node into the graph")
                }
            };

            self.condensation[region_id].kind = kind;
        }

        true
    }

    fn adjust_trivial(
        &mut self,
        body: &Body<'_>,
        region_id: PlacementRegionId,
        block: BasicBlockId,
    ) {
        let estimator = CostEstimation {
            config: CostEstimationConfig::TRIVIAL,
            solver: self,
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
            return;
        };

        if prev > elem.cost {
            self.targets[block] = Some(elem);
        }
    }

    fn adjust_cyclic(
        &mut self,
        body: &Body<'_>,
        region_id: PlacementRegionId,
        cyclic: CyclicPlacementRegion<'alloc>,
    ) -> PlacementRegionKind<'alloc> {
        let mut csp = ConstraintSatisfaction::new(self, region_id, cyclic);
        if !csp.solve(body) {
            // Nothing to do, we already have a valid solution
            return PlacementRegionKind::Cyclic(csp.region);
        }

        let region = csp.region;

        let prev_estimator = CostEstimation {
            config: CostEstimationConfig::LOOP,
            solver: self,
            determine_target: |block: BasicBlockId| self.targets[block],
        };
        let prev_total_cost: ApproxCost = region
            .members
            .iter()
            .map(|&id| {
                prev_estimator
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

        let next_estimator = CostEstimation {
            config: CostEstimationConfig::LOOP,
            solver: self,
            determine_target: |block: BasicBlockId| {
                // Resolve SCC members from the candidate solution, everything else
                // from committed state.
                if let Some(placement) = region.find_block(block) {
                    Some(placement.target)
                } else {
                    self.targets[block]
                }
            },
        };

        let next_total_cost: ApproxCost = region
            .members
            .iter()
            .map(|&block| {
                let target = region
                    .find_block(block)
                    .expect("every member must appear in blocks")
                    .target
                    .target;

                next_estimator
                    .estimate(body, region_id, block, target)
                    .expect("CSP produced a valid solution")
            })
            .sum();

        if prev_total_cost > next_total_cost {
            for block in &*region.blocks {
                self.targets[block.id] = Some(block.target);
            }
        }

        PlacementRegionKind::Cyclic(region)
    }
}
