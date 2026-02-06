use core::alloc::Allocator;

use hashql_core::{
    heap::Heap,
    id::{Id as _, bit_vec::DenseBitSet},
    symbol::sym,
};

use super::{
    StatementPlacement,
    common::{CostVisitor, OnceValue, SupportedAnalysis},
};
use crate::{
    body::{Body, Source, local::Local, operand::Operand, place::Place, rvalue::RValue},
    context::MirContext,
    pass::{
        analysis::execution::{
            Cost, StatementCostVec,
            cost::TraversalCostVec,
            statement_placement::lookup::{Access, entity_projection_access},
            target::Embedding,
        },
        transform::Traversals,
    },
    visit::Visitor as _,
};

#[cfg(test)]
mod tests;

fn is_supported_place<'heap>(
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    domain: &DenseBitSet<Local>,
    place: &Place<'heap>,
) -> bool {
    // For GraphReadFilter bodies, local 1 is the filter argument (vertex). Check if the
    // projection path maps to an Embedding-accessible field.
    if matches!(body.source, Source::GraphReadFilter(_)) && place.local.as_usize() == 1 {
        let local_type = body.local_decls[place.local].r#type;
        let type_name = context
            .env
            .r#type(local_type)
            .kind
            .opaque()
            .map_or_else(|| unreachable!(), |opaque| opaque.name);

        if type_name == sym::path::Entity {
            return matches!(
                entity_projection_access(&place.projections),
                Some(Access::Embedding(_))
            );
        }

        unimplemented!("unimplemented lookup for declared type")
    }

    domain.contains(place.local)
}

fn is_supported_operand<'heap>(
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    domain: &DenseBitSet<Local>,
    operand: &Operand<'heap>,
) -> bool {
    match operand {
        Operand::Place(place) => is_supported_place(context, body, domain, place),
        Operand::Constant(_) => false,
    }
}

fn is_supported_rvalue<'heap>(
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    domain: &DenseBitSet<Local>,
    rvalue: &RValue<'heap>,
) -> bool {
    match rvalue {
        RValue::Load(operand) => is_supported_operand(context, body, domain, operand),
        RValue::Input(_)
        | RValue::Aggregate(_)
        | RValue::Binary(_)
        | RValue::Unary(_)
        | RValue::Apply(_) => false,
    }
}

/// Statement placement for the [`Embedding`] execution target.
///
/// Only supports loading from entity projections that access the `encodings.vectors` path.
/// No arguments are transferable, and no other operations are supported.
pub struct EmbeddingStatementPlacement {
    statement_cost: Cost,
}
impl Default for EmbeddingStatementPlacement {
    fn default() -> Self {
        Self {
            statement_cost: cost!(4),
        }
    }
}

impl<'heap, A: Allocator + Clone> StatementPlacement<'heap, A> for EmbeddingStatementPlacement {
    type Target = Embedding;

    fn statement_placement(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<&'heap Heap>, StatementCostVec<&'heap Heap>) {
        let statement_costs = StatementCostVec::new(&body.basic_blocks, context.heap);
        let traversal_costs = TraversalCostVec::new(body, traversals, context.heap);

        match body.source {
            Source::GraphReadFilter(_) => {}
            Source::Ctor(_) | Source::Closure(..) | Source::Thunk(..) | Source::Intrinsic(_) => {
                return (traversal_costs, statement_costs);
            }
        }

        let dispatchable = SupportedAnalysis {
            body,
            context,
            is_supported_rvalue,
            is_supported_operand,
            initialize_boundary: OnceValue::new(
                |body: &Body<'heap>, domain: &mut DenseBitSet<Local>| {
                    match body.source {
                        Source::GraphReadFilter(_) => {}
                        Source::Ctor(_)
                        | Source::Closure(..)
                        | Source::Thunk(..)
                        | Source::Intrinsic(_) => return,
                    }

                    debug_assert_eq!(body.args, 2);

                    // Embedding backend cannot receive any arguments directly
                    for arg in 0..body.args {
                        domain.remove(Local::new(arg));
                    }
                },
            ),
        }
        .finish_in(alloc);

        let mut visitor = CostVisitor {
            body,
            context,
            dispatchable: &dispatchable,
            cost: self.statement_cost,

            statement_costs,
            traversal_costs,

            is_supported_rvalue,
        };
        visitor.visit_body(body);

        (visitor.traversal_costs, visitor.statement_costs)
    }
}
