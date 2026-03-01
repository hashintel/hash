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
        traversal::Traversals,
    },
    visit::Visitor,
};

#[cfg(test)]
mod tests;

struct CostVisitor<'ctx, A: Allocator, S: Allocator> {
    cost: Cost,
    traversal_overhead: Cost,

    statement_costs: StatementCostVec<A>,
    traversals: &'ctx Traversals<S>,
}

impl<'heap, A: Allocator, S: Allocator> Visitor<'heap> for CostVisitor<'_, A, S> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        // All statements are supported; TraversalAnalysis provides backend data access
        match &statement.kind {
            StatementKind::Assign(Assign { lhs, rhs: _ }) => {
                // If it's a traversal load (aka we add the interpreter cost, as well as the cost to
                // load the statement). We assume worst case for the traversal.
                #[expect(
                    clippy::cast_possible_truncation,
                    reason = "variant count is under u32::MAX"
                )]
                let cost = if lhs.projections.is_empty() {
                    self.cost.saturating_add(
                        self.traversal_overhead
                            .saturating_mul(self.traversals.path_count(location) as u32),
                    )
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
pub(crate) struct InterpreterStatementPlacement<'ctx, S: Allocator> {
    traversal_overhead: Cost,
    statement_cost: Cost,

    traversals: &'ctx Traversals<S>,
}

impl<'ctx, S: Allocator> InterpreterStatementPlacement<'ctx, S> {
    pub(crate) const fn new(traversals: &'ctx Traversals<S>) -> Self {
        Self {
            traversal_overhead: cost!(4),
            statement_cost: cost!(8),
            traversals,
        }
    }
}

impl<'heap, A: Allocator + Clone, S: Allocator> StatementPlacement<'heap, A>
    for InterpreterStatementPlacement<'_, S>
{
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
            traversals: self.traversals,
        };
        visitor.visit_body(body);

        visitor.statement_costs
    }
}
