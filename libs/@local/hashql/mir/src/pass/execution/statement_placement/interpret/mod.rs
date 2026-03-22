use core::alloc::Allocator;

use super::StatementPlacement;
use crate::{
    body::{
        Body, Source,
        location::Location,
        statement::{Statement, StatementKind},
        terminator::Terminator,
    },
    context::MirContext,
    pass::execution::{
        VertexType,
        cost::{Cost, StatementCostVec, TerminatorCostVec},
    },
    visit::Visitor,
};

#[cfg(test)]
mod tests;

struct CostVisitor<A: Allocator> {
    cost: Cost,

    statement_costs: StatementCostVec<A>,
    terminator_costs: TerminatorCostVec<A>,
}

impl<'heap, A: Allocator> Visitor<'heap> for CostVisitor<A> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        match &statement.kind {
            StatementKind::Assign(_) => {
                self.statement_costs[location] = Some(self.cost);
            }
            StatementKind::StorageDead(_) | StatementKind::StorageLive(_) | StatementKind::Nop => {
                self.statement_costs[location] = Some(cost!(0));
            }
        }

        Ok(())
    }

    fn visit_terminator(&mut self, location: Location, _: &Terminator<'heap>) -> Self::Result {
        // Because interpreter is our base case, every terminator is supported, via the default base
        // cost.
        // Because this is done *before* basic block splitting, we assign the same cost to as well,
        // splitting, then assigns a cumulative cost of `0` for generated GOTOs to not distort the
        // cost distribution.
        self.terminator_costs.insert(location.block, self.cost);

        Ok(())
    }
}

/// Statement placement for the [`Interpreter`](super::super::TargetId::Interpreter) execution
/// target.
///
/// Supports all statements unconditionally, serving as the universal fallback.
pub(crate) struct InterpreterStatementPlacement {
    statement_cost: Cost,
}

impl InterpreterStatementPlacement {
    pub(crate) const fn new() -> Self {
        Self {
            statement_cost: cost!(8),
        }
    }
}

impl<'heap, A: Allocator + Clone> StatementPlacement<'heap, A> for InterpreterStatementPlacement {
    fn statement_placement_in(
        &mut self,
        _: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        _: VertexType,
        alloc: A,
    ) -> (StatementCostVec<A>, TerminatorCostVec<A>) {
        let statement_costs = StatementCostVec::new_in(&body.basic_blocks, alloc.clone());
        let terminator_costs = TerminatorCostVec::new_in(&body.basic_blocks, alloc);

        match body.source {
            Source::GraphReadFilter(_) => {}
            Source::Ctor(_) | Source::Closure(..) | Source::Thunk(..) | Source::Intrinsic(_) => {
                return (statement_costs, terminator_costs);
            }
        }

        let mut visitor = CostVisitor {
            cost: self.statement_cost,
            statement_costs,
            terminator_costs,
        };
        visitor.visit_body(body);

        (visitor.statement_costs, visitor.terminator_costs)
    }
}
