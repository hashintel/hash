macro_rules! cost {
    ($value:expr) => {
        const { $crate::pass::execution::cost::Cost::new_panic($value) }
    };
}

#[cfg(test)]
mod tests;

mod block_partitioned_vec;
mod cost;
mod fusion;
mod island;
mod placement;
mod splitting;
mod statement_placement;
mod target;
mod terminator_placement;
pub mod traversal;
mod vertex;

use core::{alloc::Allocator, assert_matches};

use hashql_core::heap::{BumpAllocator, Heap};

pub use self::{
    cost::{ApproxCost, Cost},
    island::{Island, IslandId, IslandVec},
    placement::error::PlacementDiagnosticCategory,
    target::TargetId,
    vertex::VertexType,
};
use self::{
    fusion::BasicBlockFusion,
    island::IslandPlacement,
    placement::{ArcConsistency, PlacementSolverContext},
    splitting::BasicBlockSplitting,
    statement_placement::{StatementPlacement as _, TargetPlacementStatement},
    target::TargetArray,
    terminator_placement::TerminatorPlacement,
    traversal::TransferCostConfig,
};
use super::analysis::size_estimation::BodyFootprint;
use crate::{
    body::{Body, Source, basic_block::BasicBlockVec, local::Local},
    context::MirContext,
    def::DefIdSlice,
    pass::analysis::size_estimation::InformationRange,
};

pub struct ExecutionAnalysis<'ctx, 'heap, S: Allocator> {
    pub footprints: &'ctx DefIdSlice<BodyFootprint<&'heap Heap>>,
    pub scratch: S,
}

impl<'heap, S: BumpAllocator> ExecutionAnalysis<'_, 'heap, S> {
    pub fn run(
        &self,
        context: &mut MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
    ) -> (
        BasicBlockVec<TargetId, &'heap Heap>,
        IslandVec<Island, &'heap Heap>,
    ) {
        assert_matches!(body.source, Source::GraphReadFilter(_));

        let Some(vertex) = VertexType::from_local(context.env, &body.local_decls[Local::VERTEX])
        else {
            unreachable!("unsupported graph read target")
        };

        let mut statement_costs: TargetArray<_> = TargetArray::from_fn(|_| None);

        let mut targets = TargetId::all();
        targets.reverse(); // We reverse the order, so that earlier targets (aka the interpreter) can have access to traversal costs

        for target in targets {
            let mut statement = TargetPlacementStatement::new_in(target, &self.scratch);
            let statement_cost =
                statement.statement_placement_in(context, body, vertex, &self.scratch);

            statement_costs[target] = Some(statement_cost);
        }

        let mut statement_costs =
            statement_costs.map(|cost| cost.unwrap_or_else(|| unreachable!()));

        let mut possibilities = BasicBlockSplitting::new_in(&self.scratch).split_in(
            context,
            body,
            &mut statement_costs,
            &self.scratch,
        );

        let terminators = TerminatorPlacement::new_in(
            TransferCostConfig::new(InformationRange::full()),
            &self.scratch,
        );
        let mut terminator_costs = terminators.terminator_placement_in(
            body,
            vertex,
            &self.footprints[body.id],
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

        let islands =
            IslandPlacement::new_in(&self.scratch).run(body, vertex, &assignment, context.heap);

        (assignment, islands)
    }
}
