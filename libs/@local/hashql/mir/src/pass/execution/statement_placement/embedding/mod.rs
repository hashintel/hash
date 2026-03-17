use core::alloc::Allocator;

use hashql_core::id::{Id as _, bit_vec::DenseBitSet};

use super::{
    StatementPlacement,
    common::{CostVisitor, OnceValue, Supported, SupportedAnalysis},
};
use crate::{
    body::{Body, Source, local::Local, operand::Operand, place::Place, rvalue::RValue},
    context::MirContext,
    pass::{
        execution::{
            Cost, VertexType,
            cost::{StatementCostVec, TraversalCostVec},
            statement_placement::common::entity_projection_access,
            storage::Access,
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
        let decl = &body.local_decls[place.local];
        let Some(vertex_type) = VertexType::from_local(context.env, decl) else {
            unimplemented!("lookup for declared type")
        };

        match vertex_type {
            VertexType::Entity => {
                return matches!(
                    entity_projection_access(&place.projections),
                    Some(Access::Embedding(_))
                );
            }
        }
    }

    domain.contains(place.local)
}

struct EmbeddingSupported;

impl<'heap> Supported<'heap> for EmbeddingSupported {
    fn is_supported_rvalue(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        rvalue: &RValue<'heap>,
    ) -> bool {
        match rvalue {
            RValue::Load(operand) => self.is_supported_operand(context, body, domain, operand),
            RValue::Input(_)
            | RValue::Aggregate(_)
            | RValue::Binary(_)
            | RValue::Unary(_)
            | RValue::Apply(_) => false,
        }
    }

    fn is_supported_operand(
        &self,
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
}

/// Statement placement for the [`Embedding`](super::super::TargetId::Embedding) execution target.
///
/// Only supports loading from entity projections that access the `encodings.vectors` path.
/// No arguments are transferable, and no other operations are supported.
pub(crate) struct EmbeddingStatementPlacement<S: Allocator> {
    statement_cost: Cost,
    scratch: S,
}

impl<S: Allocator> EmbeddingStatementPlacement<S> {
    pub(crate) const fn new_in(scratch: S) -> Self {
        Self {
            statement_cost: cost!(4),
            scratch,
        }
    }
}

impl<'heap, A: Allocator + Clone, S: Allocator> StatementPlacement<'heap, A>
    for EmbeddingStatementPlacement<S>
{
    fn statement_placement_in(
        &mut self,
        context: &MirContext<'_, 'heap>,
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

        let dispatchable = SupportedAnalysis {
            body,
            context,
            supported: &EmbeddingSupported,
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
                        domain.remove(Local::from_usize(arg));
                    }
                },
            ),
        }
        .finish_in(&self.scratch);

        let mut visitor = CostVisitor {
            body,
            context,
            dispatchable: &dispatchable,
            cost: self.statement_cost,

            statement_costs,
            traversal_costs,

            supported: &EmbeddingSupported,
        };
        visitor.visit_body(body);

        (visitor.traversal_costs, visitor.statement_costs)
    }
}
