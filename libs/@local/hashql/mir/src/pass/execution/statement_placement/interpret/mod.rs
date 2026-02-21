use core::alloc::Allocator;

use super::StatementPlacement;
use crate::{
    body::{
        Body, Source,
        location::Location,
        statement::{Statement, StatementKind},
    },
    context::MirContext,
    pass::{
        execution::{
            cost::{Cost, StatementCostVec, TraversalCostVec},
            target::TargetId,
        },
        transform::Traversals,
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

impl<'heap, A: Allocator + Clone> StatementPlacement<'heap, A> for InterpreterStatementPlacement {
    fn target(&self) -> TargetId {
        TargetId::Interpreter
    }

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
        };
        visitor.visit_body(body);

        (traversal_costs, visitor.statement_costs)
    }
}
