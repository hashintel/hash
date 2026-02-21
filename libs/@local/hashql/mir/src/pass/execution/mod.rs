macro_rules! cost {
    ($value:expr) => {
        const { $crate::pass::execution::cost::Cost::new_panic($value) }
    };
}

mod cost;
pub mod fusion;
pub mod island;
pub mod placement;
pub mod splitting;
pub mod statement_placement;
pub mod target;
pub mod terminator_placement;

use core::alloc::Allocator;

use hashql_core::{
    heap::{BumpAllocator, Heap},
    id::IdArray,
};

pub use self::cost::{ApproxCost, Cost, StatementCostVec, TraversalCostVec};
use self::{
    fusion::BasicBlockFusion,
    island::IslandPlacement,
    placement::{ArcConsistency, PlacementSolverContext},
    splitting::BasicBlockSplitting,
    statement_placement::{StatementPlacement, TargetPlacementStatement},
    target::{TargetArray, TargetId},
    terminator_placement::TerminatorPlacement,
};
use super::{
    Changed, TransformPass, analysis::size_estimation::BodyFootprint, transform::Traversals,
};
use crate::{
    body::{Body, Source},
    context::MirContext,
    def::DefIdSlice,
    pass::analysis::size_estimation::InformationRange,
};

pub struct ExecutionAnalysis<'ctx, 'heap, S: Allocator> {
    traversals: &'ctx DefIdSlice<Option<Traversals<'heap>>>,
    footprints: &'ctx DefIdSlice<BodyFootprint<&'heap Heap>>,
    scratch: S,
}

impl<'env, 'heap, S: BumpAllocator> TransformPass<'env, 'heap> for ExecutionAnalysis<'_, 'heap, S> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>) -> Changed {
        if !matches!(body.source, Source::GraphReadFilter(_)) {
            return Changed::No;
        }

        let traversals = self
            .traversals
            .lookup(body.id)
            .unwrap_or_else(|| unreachable!());

        let mut traversal_costs: TargetArray<_> = TargetArray::from_fn(|_| None);
        let mut statement_costs: TargetArray<_> = TargetArray::from_fn(|_| None);

        for target in TargetId::all() {
            let mut statement = TargetPlacementStatement::new_in(target, &self.scratch);
            let (traversal_cost, statement_cost) =
                statement.statement_placement_in(context, body, traversals, &self.scratch);

            traversal_costs[target] = Some(traversal_cost);
            statement_costs[target] = Some(statement_cost);
        }

        let traversal_costs = traversal_costs.map(|cost| cost.unwrap_or_else(|| unreachable!()));
        let mut statement_costs =
            statement_costs.map(|cost| cost.unwrap_or_else(|| unreachable!()));

        let mut possibilities = BasicBlockSplitting::new_in(&self.scratch).split_in(
            context,
            body,
            &mut statement_costs,
            &self.scratch,
        );

        let terminators = TerminatorPlacement::new_in(InformationRange::full(), &self.scratch);
        let mut terminator_costs = terminators.terminator_placement_in(
            body,
            &self.footprints[body.id],
            traversals,
            &possibilities,
            &self.scratch,
        );

        ArcConsistency {
            blocks: &mut possibilities,
            terminators: &mut terminator_costs,
        }
        .run_in(body, &self.scratch);

        let mut solver = PlacementSolverContext {
            assignment: &possibilities,
            statements: &statement_costs,
            terminators: &terminator_costs,
        }
        .build_in(body, &self.scratch);

        let mut assignment = solver.run(context, body);

        let fusion = BasicBlockFusion::new_in(&self.scratch);
        fusion.fuse(body, &mut assignment);

        let islands = IslandPlacement::new_in(&self.scratch).run(body, &assignment, context.heap);

        (assignment, islands)
    }
}
