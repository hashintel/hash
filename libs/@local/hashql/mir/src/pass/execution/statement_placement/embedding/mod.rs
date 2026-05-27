use core::alloc::Allocator;

use hashql_core::id::{Id as _, bit_vec::DenseBitSet};

use super::{
    StatementPlacement,
    common::{CostVisitor, OnceValue, Supported, SupportedAnalysis},
};
use crate::{
    body::{
        Body, Source,
        local::Local,
        operand::Operand,
        place::Place,
        rvalue::RValue,
        terminator::{Goto, Return, SwitchInt, Terminator, TerminatorKind},
    },
    context::MirContext,
    pass::execution::{
        Cost, VertexType,
        cost::{StatementCostVec, TerminatorCostVec},
        statement_placement::common::entity_projection_access,
        traversal::Access,
    },
    visit::Visitor as _,
};

#[cfg(test)]
mod tests;

struct EmbeddingSupported {
    vertex: VertexType,
}

impl EmbeddingSupported {
    fn is_supported_place<'heap>(
        &self,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        place: &Place<'heap>,
    ) -> bool {
        // For GraphReadFilter bodies, local 1 is the filter argument (vertex). Check if the
        // projection path maps to an Embedding-accessible field.
        if matches!(body.source, Source::GraphReadFilter(_)) && place.local == Local::VERTEX {
            match self.vertex {
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
}

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

    fn is_supported_terminator(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        terminator: &Terminator<'heap>,
    ) -> bool {
        match &terminator.kind {
            TerminatorKind::Goto(Goto { target }) => target
                .args
                .iter()
                .all(|arg| self.is_supported_operand(context, body, domain, arg)),
            TerminatorKind::SwitchInt(SwitchInt {
                discriminant,
                targets,
            }) => {
                self.is_supported_operand(context, body, domain, discriminant)
                    && targets.targets().iter().all(|target| {
                        target
                            .args
                            .iter()
                            .all(|arg| self.is_supported_operand(context, body, domain, arg))
                    })
            }
            TerminatorKind::Return(Return { value }) => {
                self.is_supported_operand(context, body, domain, value)
            }
            TerminatorKind::GraphRead(_) => false,
            TerminatorKind::Unreachable => true,
        }
    }

    fn is_supported_operand(
        &self,
        _: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        operand: &Operand<'heap>,
    ) -> bool {
        match operand {
            Operand::Place(place) => self.is_supported_place(body, domain, place),
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
        vertex: VertexType,
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

        let dispatchable = SupportedAnalysis {
            body,
            context,
            supported: &EmbeddingSupported { vertex },
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
            terminator_costs,

            supported: &EmbeddingSupported { vertex },
        };
        visitor.visit_body(body);

        (visitor.statement_costs, visitor.terminator_costs)
    }
}
