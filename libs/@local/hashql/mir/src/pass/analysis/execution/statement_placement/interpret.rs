use std::alloc::Allocator;

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
        analysis::execution::cost::{Cost, StatementCostVec, TraversalCostVec},
        transform::Traversals,
    },
    visit::Visitor,
};

struct CostVisitor<'ctx, 'env, 'heap> {
    body: &'ctx Body<'heap>,
    context: &'ctx MirContext<'env, 'heap>,

    cost: Cost,

    statement_costs: StatementCostVec<&'heap Heap>,
}

impl<'heap> Visitor<'heap> for CostVisitor<'_, '_, 'heap> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        // Due to `TraversalExtraction`, we're able to access all the data through the use of
        // dedicated traversals from the backend. Therefore the cost keeps being the same.
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

#[derive(Debug)]
pub(crate) struct InterpretStatementPlacement {
    statement_cost: Cost,
}

impl Default for InterpretStatementPlacement {
    fn default() -> Self {
        Self {
            statement_cost: cost!(8),
        }
    }
}

impl<A: Allocator> StatementPlacement<A> for InterpretStatementPlacement {
    fn statement_placement<'heap>(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        _: A,
    ) -> (TraversalCostVec<&'heap Heap>, StatementCostVec<&'heap Heap>) {
        let statement_costs = StatementCostVec::new(&body.basic_blocks, context.heap);
        let traversal_costs = TraversalCostVec::new(body, traversals, context.heap);

        let mut visitor = CostVisitor {
            body,
            context,
            cost: self.statement_cost,
            statement_costs,
        };
        visitor.visit_body(body);

        (traversal_costs, visitor.statement_costs)
    }
}
