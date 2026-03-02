use core::alloc::Allocator;

use super::StatementPlacement;
use crate::{
    body::{
        Body, Source,
        location::Location,
        statement::{Statement, StatementKind},
    },
    context::MirContext,
    pass::execution::{
        VertexType,
        cost::{Cost, StatementCostVec},
    },
    visit::Visitor,
};

#[cfg(test)]
mod tests;

struct CostVisitor<A: Allocator> {
    cost: Cost,

    statement_costs: StatementCostVec<A>,
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
        };
        visitor.visit_body(body);

        visitor.statement_costs
    }
}
