use core::alloc::Allocator;

use hashql_core::heap::Heap;

use super::cost::{Cost, CostVec};
use crate::{
    body::{
        Body,
        location::Location,
        statement::{Statement, StatementKind},
    },
    context::MirContext,
    pass::analysis::execution::statement_placement::cost::cost,
    visit::Visitor,
};

struct CostVisitor<'ctx, 'env, 'heap> {
    body: &'ctx Body<'heap>,
    context: &'ctx MirContext<'env, 'heap>,

    cost: Cost,
    costs: CostVec<&'heap Heap>,
}

// TODO: is this the right way? I am just thinking, can we *really* do everything in the
// interpreter? I am thinking that there are *some* that we can't in particular the ones that
// require fetching information. How do we want to fix that? We need to somehow move that data from
// A to B, if it's the entire entity then sure, but we need a way to construct even composite data,
// which is fine I guess, but needs some way to do. No I mean we can do that, but just need to have
// the entity materialized, which is fine.
// The bigger question is: what about that isn't directly on the entity? for example: embeddings, we
// would still need a way to fetch them in the interpreter I guess, but then we would still have it
// be executed on the interpreter, so it's fine(?).
// but we don't know *what* and *why* and *how* to get that, we would require some sort of tagging
// in the interpreter I guess, to be able to do that, but what about other sources? I think there
// may be a case, where certain objects on the path we just can't do (embeddings), whereas others
// that are always materialized we can always do. We just need to find a way to handle them in the
// alternative backend. I think that is honestly just the way. For the entity itself it's no big
// deal, but it is for any of the encodings, in which case we can't support them here (the loads
// that is) because we don't have a materialized view of them (aka the entity) that we can access.
// This might honestly be a thing where we could/should have a function that fetches the specific
// encoding if we wanted to.
impl<'heap> Visitor<'heap> for CostVisitor<'_, '_, 'heap> {
    type Result = Result<(), !>;

    fn visit_statement(
        &mut self,
        location: Location,
        statement: &Statement<'heap>,
    ) -> Self::Result {
        match &statement.kind {
            StatementKind::Assign(_) => {
                self.costs[location] = Some(self.cost);
            }
            StatementKind::StorageDead(_) | StatementKind::StorageLive(_) | StatementKind::Nop => {
                self.costs[location] = Some(cost!(0));
            }
        }

        Ok(())
    }
}

struct InterpretStatementPlacement {
    statement_cost: Cost,
}

impl InterpretStatementPlacement {
    fn compute<'heap>(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
    ) -> CostVec<&'heap Heap> {
        let costs = CostVec::new(&body.basic_blocks, context.heap);

        let mut visitor = CostVisitor {
            body,
            context,
            cost: self.statement_cost,
            costs,
        };
        visitor.visit_body(body);

        visitor.costs
    }
}
