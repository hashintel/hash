mod estimate;

use core::alloc::Allocator;

use hashql_core::{
    graph::{
        DirectedGraph, LinkedGraph, NodeId, Predecessors, Successors,
        algorithms::{
            Tarjan,
            tarjan::{Members, StronglyConnectedComponents},
        },
        linked::Node,
    },
    id::{self, HasId, Id},
};

use crate::{
    body::{
        Body,
        basic_block::{BasicBlockId, BasicBlockSlice},
    },
    pass::execution::{
        Cost, StatementCostVec,
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

struct CondenseContext<'scc, A: Allocator> {
    scc: &'scc StronglyConnectedComponents<BasicBlockId, PlacementRegionId, (), A>,
    scc_members: &'scc Members<BasicBlockId, PlacementRegionId, A>,

    graph: LinkedGraph<PlacementRegion<'scc>, BoundaryEdge, A>,
    targets: Box<BasicBlockSlice<Option<TargetId>>, A>,
}

pub struct Condense<'ctx, A: Allocator> {
    pub targets: &'ctx BasicBlockSlice<TargetBitSet>,

    pub statements: &'ctx TargetArray<StatementCostVec<A>>,
    pub terminators: &'ctx TerminatorCostVec<A>,
}

impl<'ctx, A: Allocator> Condense<'ctx, A> {
    fn run_in<B>(&self, body: &Body<'_>, alloc: B)
    where
        B: Allocator + Clone,
    {
        let scc = Tarjan::new_in(&body.basic_blocks, alloc.clone()).run();
        let scc_members = scc.members();

        // We use a backup slice, instead of directly operating on the target set, so that we're
        // able to switch and backup easily between iterations.
        #[expect(unsafe_code)]
        let targets = {
            let mut uninit = Box::new_uninit_slice_in(body.basic_blocks.len(), alloc.clone());
            uninit.write_filled(None::<TargetId>);

            // SAFETY: The slice is fully initialized
            let boxed = unsafe { uninit.assume_init() };
            BasicBlockSlice::from_boxed_slice(boxed)
        };

        let mut context = CondenseContext {
            scc: &scc,
            scc_members: &scc_members,
            graph: LinkedGraph::with_capacity_in(scc.node_count(), self.terminators.len(), alloc),
            targets,
        };

        self.fill_graph(body, &mut context);

        unimplemented!()
    }

    fn solve_trivial<B: Allocator>(
        &self,
        body: &Body<'_>,
        context: &CondenseContext<'_, B>,
        block: BasicBlockId,
        region: &Node<PlacementRegion<'_>>,
    ) -> Option<TargetId> {
        // TODO: we could just keep a heap (or basically just a slice) of targets, if we need to
        // backtrack, we just pop the last (or rotate), and then try again. The problem is that the
        // backtrack could go on for *a long* time, if that one doesn't fit, we'd need to go up one
        // more, try again there, etc. It would be possible, but is recursive in nature, basically
        // a: *whoops* I am all out of options, let me just ask the parent to choose a new
        // one. The parent goes like: oh look these are the ones I have. Fuck, let's try this one.
        // Oh fuck, I am all out of options, rewind once more.
        // That could work for backtracking, and is likely what we need. We need a similar approach
        // for CSP anyway, and we can do that easily with pre-allocated stacks. Actually, why? We
        // have a bump alloc, we can just alloc into the bump allow and do it that way. *way*
        // easier. We just assign a slice to each node, and then re-use it.

        let mut best_target = None;
        let mut best_cost = Cost::MAX;

        'target: for target in &self.targets[block] {
            let Some(mut cost) = self.statements[target].sum(block) else {
                unreachable!("The target has been deemed as reachable in a previous iteration")
            };

            // If any assigned predecessor p has incompatible transition
            for pred in body.basic_blocks.predecessors(block) {
                let Some(chosen_target) = context.targets[pred] else {
                    // This specific predecessor has not been fixed yet, and is therefore not
                    // considered.
                    continue;
                };

                // Find all the edges from the chosen target
                let edges = context
                    .graph
                    .incoming_edges(region.id())
                    .filter(|edge| edge.data.source == pred && edge.data.target == block);

                for edge in edges {
                    let Some(trans_cost) = edge.data.matrix.get(chosen_target, target) else {
                        // Transition to this backend is not possible
                        continue 'target;
                    };

                    // Add the transition cost to the total cost
                    cost = cost.saturating_add(trans_cost);
                }
            }

            // Find the cost of the (unassigned) successors, they fill choose the smallest target
            // possible (taking transition cost into account)
            for succ in body.basic_blocks.successors(block) {
                let mut edges = context
                    .graph
                    .outgoing_edges(region.id())
                    .filter(|edge| edge.data.source == block && edge.data.target == succ);

                if let Some(chosen_target) = context.targets[succ] {
                    // Check if the successor is even compatible, if not than this is a non-starter
                    if !edges.all(|edge| edge.data.matrix.contains(target, chosen_target)) {
                        continue 'target;
                    }

                    // The target has already chosen, and therefore does not need to be considered
                    continue;
                }

                // There is no target, add the cost of the smallest possible transition to the
                // overall cost.
                for edge in edges {
                    let mut min_cost = Cost::MAX;
                    for (potential_target, potential_target_cost) in
                        edge.data.matrix.outgoing(target)
                    {
                        let target_cost = potential_target_cost.saturating_add(
                            self.statements[potential_target]
                                .sum(edge.data.target)
                                .unwrap_or(Cost::MAX),
                        );

                        min_cost = min_cost.min(target_cost);
                    }

                    cost = cost.saturating_add(min_cost);
                }
            }

            if cost < best_cost {
                best_cost = cost;
                best_target = Some(target);
            }
        }

        best_target
    }

    fn run_forwards_loop<B: Allocator>(
        &self,
        body: &Body<'_>,
        context: &mut CondenseContext<'_, B>,
    ) {
        // Now that we have all the edges we must do a forwards and backwards sweep, scc gives us
        // the reverse topological order, meaning that the forwards is simply the backwards
        // traversal of the scc.
        // forward pass:
        for region_id in context.scc.iter_nodes().rev() {
            let region = &context.graph[NodeId::new(region_id.as_usize())];
            let is_trivial = region.data.members.len() == 1;

            if is_trivial {
                let Some(target) =
                    self.solve_trivial(body, context, region.data.members[0], region)
                else {
                    todo!("do we need to backtrack? or do we just default to interpreter?");
                };

                context.targets[region.data.members[0]] = Some(target);
            } else {
                todo!("solve CSP")
            }
        }
    }

    fn fill_graph<B: Allocator>(&self, body: &Body<'_>, context: &mut CondenseContext<'_, B>) {
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
