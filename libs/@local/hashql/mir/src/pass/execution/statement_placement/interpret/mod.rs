use core::alloc::Allocator;

use super::StatementPlacement;
use crate::{
    body::{
        Body, Source,
        location::Location,
        statement::{Assign, Statement, StatementKind},
    },
    context::MirContext,
    pass::execution::{
        VertexType,
        cost::{Cost, StatementCostVec},
        traversal::{TraversalAnalysisVisitor, TraversalPathBitSet, TraversalResult},
    },
    visit::Visitor,
};

#[cfg(test)]
mod tests;

struct CostVisitor<A: Allocator> {
    cost: Cost,
    vertex: VertexType,
    traversal_overhead: Cost,

    statement_costs: StatementCostVec<A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for CostVisitor<A> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        // All statements are supported; TraversalAnalysis provides backend data access
        match &statement.kind {
            StatementKind::Assign(Assign { lhs, rhs }) => {
                // If it's a traversal load (aka we add the interpreter cost, as well as the cost to
                // load the statement). We assume worst case for the traversal.
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "variant count is under u32::MAX"
                )]
                let cost = if lhs.projections.is_empty() {
                    let mut bitset = TraversalPathBitSet::empty(self.vertex);
                    Ok(()) = TraversalAnalysisVisitor::new(self.vertex, |_, result| match result {
                        TraversalResult::Path(path) => bitset.insert(path),
                        TraversalResult::Complete => bitset.insert_all(),
                    })
                    .visit_rvalue(location, rhs);

                    self.cost
                        .saturating_add(self.traversal_overhead.saturating_mul(bitset.len() as u32))
                } else {
                    self.cost
                };

                self.statement_costs[location] = Some(cost);
            }
            StatementKind::StorageDead(_) | StatementKind::StorageLive(_) | StatementKind::Nop => {
                self.statement_costs[location] = Some(cost!(0));
            }
        }

        Ok(())
    }
}

/// Statement placement for the [`Interpreter`](super::super::TargetId::Interpreter) execution
/// target.
///
/// Supports all statements unconditionally, serving as the universal fallback.
pub(crate) struct InterpreterStatementPlacement {
    traversal_overhead: Cost,
    statement_cost: Cost,
}

impl InterpreterStatementPlacement {
    pub(crate) const fn new() -> Self {
        Self {
            traversal_overhead: cost!(4),
            statement_cost: cost!(8),
        }
    }
}

impl<'heap, A: Allocator + Clone> StatementPlacement<'heap, A> for InterpreterStatementPlacement {
    fn statement_placement_in(
        &mut self,
        _: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        vertex: VertexType,
        alloc: A,
    ) -> StatementCostVec<A> {
        let statement_costs = StatementCostVec::new_in(&body.basic_blocks, alloc);

        match body.source {
            Source::GraphReadFilter(_) => {}
            Source::Ctor(_) | Source::Closure(..) | Source::Thunk(..) | Source::Intrinsic(_) => {
                return statement_costs;
            }
        }

        let mut visitor = CostVisitor {
            cost: self.statement_cost,
            statement_costs,
            traversal_overhead: self.traversal_overhead,
            vertex,
        };
        visitor.visit_body(body);

        visitor.statement_costs
    }
}
