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

use self::{
    cost::BasicBlockCostAnalysis,
    fusion::BasicBlockFusion,
    island::IslandPlacement,
    placement::{ArcConsistency, PlacementSolverContext},
    splitting::BasicBlockSplitting,
    statement_placement::{StatementPlacement as _, TargetPlacementStatement},
    target::TargetArray,
    terminator_placement::TerminatorPlacement,
    traversal::TransferCostConfig,
};
pub use self::{
    cost::{ApproxCost, Cost},
    island::{
        Island, IslandId, IslandVec,
        graph::{ExecIsland, IslandEdge, IslandGraph, IslandKind, IslandNode},
        schedule::{IslandSchedule, ScheduledIsland},
    },
    placement::error::PlacementDiagnosticCategory,
    target::TargetId,
    vertex::VertexType,
};
use super::analysis::size_estimation::BodyFootprint;
use crate::{
    body::{Body, Source, basic_block::BasicBlockVec, local::Local},
    context::MirContext,
    def::{DefIdSlice, DefIdVec},
    pass::analysis::size_estimation::InformationRange,
};

pub struct ExecutionAnalysisResidual<A: Allocator> {
    pub assignment: BasicBlockVec<TargetId, A>,
    pub islands: IslandGraph<A>,
}

pub struct ExecutionAnalysis<'ctx, 'heap, S: Allocator> {
    pub footprints: &'ctx DefIdSlice<BodyFootprint<&'heap Heap>>,
    pub scratch: S,
}

impl<'heap, S: BumpAllocator> ExecutionAnalysis<'_, 'heap, S> {
    pub fn run_in<A: Allocator + Clone>(
        &self,
        context: &mut MirContext<'_, 'heap>,
        body: &mut Body<'heap>,
        alloc: A,
    ) -> ExecutionAnalysisResidual<A> {
        assert_matches!(body.source, Source::GraphReadFilter(_));

        let Some(vertex) = VertexType::from_local(context.env, &body.local_decls[Local::VERTEX])
        else {
            unreachable!("unsupported graph read target")
        };

        let mut statement_costs: TargetArray<_> = TargetArray::from_fn(|_| None);
        let mut terminator_costs: TargetArray<_> = TargetArray::from_fn(|_| None);

        for target in TargetId::all() {
            let mut statement = TargetPlacementStatement::new_in(target, &self.scratch);
            let (statement_cost, terminator_cost) =
                statement.statement_placement_in(context, body, vertex, &self.scratch);

            statement_costs[target] = Some(statement_cost);
            terminator_costs[target] = Some(terminator_cost);
        }

        let mut statement_costs =
            statement_costs.map(|cost| cost.unwrap_or_else(|| unreachable!()));
        let mut terminator_costs =
            terminator_costs.map(|cost| cost.unwrap_or_else(|| unreachable!()));

        let mut assignments = BasicBlockSplitting::new_in(&self.scratch).split_in(
            context,
            body,
            &mut statement_costs,
            &mut terminator_costs,
            &self.scratch,
        );

        let terminators = TerminatorPlacement::new_in(
            TransferCostConfig::new(InformationRange::full()),
            &self.scratch,
        );
        let mut transition_costs = terminators.terminator_placement_in(
            body,
            vertex,
            &self.footprints[body.id],
            &assignments,
            &self.scratch,
        );

        ArcConsistency {
            blocks: &mut assignments,
            terminators: &mut transition_costs,
        }
        .run_in(body, &self.scratch);

        let block_costs = BasicBlockCostAnalysis {
            vertex,
            assignments: &assignments,
            costs: &statement_costs,
        }
        .analyze_in(
            &TransferCostConfig::new(InformationRange::full()),
            &body.basic_blocks,
            &self.scratch,
        );

        let mut solver = PlacementSolverContext {
            blocks: &block_costs,
            terminators: &transition_costs,
        }
        .build_in(body, &self.scratch);

        let mut assignment = solver.run_in(context, body, alloc.clone());

        let fusion = BasicBlockFusion::new_in(&self.scratch);
        fusion.fuse(body, &mut assignment);

        let islands =
            IslandPlacement::new_in(&self.scratch).run_in(body, vertex, &assignment, &self.scratch);
        let islands = IslandGraph::new_in(body, vertex, islands, &self.scratch, alloc);

        ExecutionAnalysisResidual {
            assignment,
            islands,
        }
    }

    pub fn run_all_in<A: Allocator + Clone>(
        &self,
        context: &mut MirContext<'_, 'heap>,
        bodies: &mut DefIdSlice<Body<'heap>>,
        alloc: A,
    ) -> DefIdVec<Option<ExecutionAnalysisResidual<A>>, A> {
        let mut items = DefIdVec::with_capacity_in(bodies.len(), alloc.clone());

        for (def, body) in bodies.iter_enumerated_mut() {
            match body.source {
                Source::Ctor(_)
                | Source::Closure(_, _)
                | Source::Thunk(_, _)
                | Source::Intrinsic(_) => continue,
                Source::GraphReadFilter(_) => {}
            }

            let residual = self.run_in(context, body, alloc.clone());
            items.insert(def, residual);
        }

        items
    }
}
