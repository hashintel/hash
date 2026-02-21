use core::alloc::Allocator;

use super::StatementPlacement;
use crate::{
    body::{
        Body, Source,
        location::Location,
        statement::{Assign, Statement, StatementKind},
    },
    context::MirContext,
    pass::{
        execution::{
            cost::{Cost, StatementCostVec, TraversalCostVec},
            target::TargetArray,
        },
        transform::Traversals,
    },
    visit::Visitor,
};

#[cfg(test)]
mod tests;

struct CostVisitor<'ctx, A: Allocator, B: Allocator> {
    cost: Cost,

    statement_costs: StatementCostVec<A>,
    traversal_costs: &'ctx TargetArray<Option<TraversalCostVec<B>>>,
}

impl<'heap, A: Allocator, B: Allocator> Visitor<'heap> for CostVisitor<'_, A, B> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        // All statements are supported; TraversalExtraction provides backend data access
        match &statement.kind {
            StatementKind::Assign(Assign { lhs, rhs: _ }) => {
                // If it's a traversal load (aka we add the interpreter cost, as well as the cost to
                // load the statement). We assume worst case for the traversal.
                let cost = if lhs.projections.is_empty()
                    && let Some(cost) = self
                        .traversal_costs
                        .iter()
                        .filter_map(|costs| costs.as_ref())
                        .filter_map(|costs| costs.get(lhs.local))
                        .max()
                {
                    self.cost.saturating_add(cost)
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

/// Statement placement for the [`Interpreter`] execution target.
///
/// Supports all statements unconditionally, serving as the universal fallback.
pub(crate) struct InterpreterStatementPlacement<'ctx, A: Allocator> {
    traversal_costs: &'ctx TargetArray<Option<TraversalCostVec<A>>>,
    statement_cost: Cost,
}

impl<'ctx, A: Allocator> InterpreterStatementPlacement<'ctx, A> {
    pub(crate) const fn new(
        traversal_costs: &'ctx TargetArray<Option<TraversalCostVec<A>>>,
    ) -> Self {
        Self {
            traversal_costs,
            statement_cost: cost!(8),
        }
    }
}

impl<'heap, A: Allocator + Clone, B: Allocator> StatementPlacement<'heap, A>
    for InterpreterStatementPlacement<'_, B>
{
    fn statement_placement_in(
        &mut self,
        _: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<A>, StatementCostVec<A>) {
        let statement_costs = StatementCostVec::new_in(&body.basic_blocks, alloc.clone());
        let traversal_costs = TraversalCostVec::new_in(body, traversals, alloc);

        match body.source {
            Source::GraphReadFilter(_) => {}
            Source::Ctor(_) | Source::Closure(..) | Source::Thunk(..) | Source::Intrinsic(_) => {
                return (traversal_costs, statement_costs);
            }
        }

        let mut visitor = CostVisitor {
            cost: self.statement_cost,
            statement_costs,
            traversal_costs: self.traversal_costs,
        };
        visitor.visit_body(body);

        (traversal_costs, visitor.statement_costs)
    }
}
