use core::alloc::Allocator;

use hashql_core::heap::Heap;

use super::StatementPlacement;
use crate::{
    body::{
        Body,
        location::Location,
        statement::{Statement, StatementKind},
    },
    context::MirContext,
    pass::{
        execution::{
            cost::{Cost, StatementCostVec, TraversalCostVec},
            target::Interpreter,
        },
        transform::Traversals,
    },
    visit::Visitor,
};

#[cfg(test)]
mod tests;

struct CostVisitor<'heap> {
    cost: Cost,

    statement_costs: StatementCostVec<&'heap Heap>,
}

impl<'heap> Visitor<'heap> for CostVisitor<'heap> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        // All statements are supported; TraversalExtraction provides backend data access
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

/// Statement placement for the [`Interpreter`] execution target.
///
/// Supports all statements unconditionally, serving as the universal fallback.
#[derive(Debug)]
pub struct InterpreterStatementPlacement {
    statement_cost: Cost,
}

impl Default for InterpreterStatementPlacement {
    fn default() -> Self {
        Self {
            statement_cost: cost!(8),
        }
    }
}

impl<'heap, A: Allocator> StatementPlacement<'heap, A> for InterpreterStatementPlacement {
    type Target = Interpreter;

    fn statement_placement(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        _: A,
    ) -> (TraversalCostVec<&'heap Heap>, StatementCostVec<&'heap Heap>) {
        let statement_costs = StatementCostVec::new(&body.basic_blocks, context.heap);
        let traversal_costs = TraversalCostVec::new(body, traversals, context.heap);

        let mut visitor = CostVisitor {
            cost: self.statement_cost,
            statement_costs,
        };
        visitor.visit_body(body);

        (traversal_costs, visitor.statement_costs)
    }
}
