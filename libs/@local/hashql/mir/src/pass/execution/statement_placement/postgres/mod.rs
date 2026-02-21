use alloc::alloc::Global;
use core::{alloc::Allocator, ops::ControlFlow};

use hashql_core::{
    id::{Id as _, bit_vec::DenseBitSet},
    symbol::sym,
    r#type::{
        self,
        environment::Environment,
        visit::{RecursiveVisitorGuard, Visitor as _},
    },
};

use super::{
    StatementPlacement,
    common::{CostVisitor, OnceValue, SupportedAnalysis},
};
use crate::{
    body::{
        Body, Source,
        constant::Constant,
        local::Local,
        operand::Operand,
        place::Place,
        rvalue::{Aggregate, AggregateKind, Binary, RValue, Unary},
    },
    context::MirContext,
    pass::{
        execution::{
            cost::{Cost, StatementCostVec, TraversalCostVec},
            statement_placement::lookup::{Access, entity_projection_access},
            target::TargetId,
        },
        transform::Traversals,
    },
    visit::Visitor as _,
};

#[cfg(test)]
mod tests;

const fn is_supported_constant(constant: &Constant<'_>) -> bool {
    match constant {
        Constant::Int(_) | Constant::Primitive(_) | Constant::Unit => true,
        Constant::FnPtr(_) => false,
    }
}

fn is_supported_place<'heap>(
    context: &MirContext<'_, 'heap>,
    body: &Body<'heap>,
    domain: &DenseBitSet<Local>,
    place: &Place<'heap>,
) -> bool {
    // For GraphReadFilter bodies, local 1 is the filter argument (vertex). Check if the
    // projection path maps to a Postgres-accessible field.
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
                Some(Access::Postgres(_))
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
        Operand::Constant(constant) => is_supported_constant(constant),
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
        RValue::Binary(Binary { op: _, left, right }) => {
            // All MIR binary operations have Postgres equivalents (with type coercion)
            is_supported_operand(context, body, domain, left)
                && is_supported_operand(context, body, domain, right)
        }
        RValue::Unary(Unary { op: _, operand }) => {
            // All MIR unary operations have Postgres equivalents (with type coercion)
            is_supported_operand(context, body, domain, operand)
        }
        RValue::Aggregate(Aggregate { kind, operands }) => {
            if *kind == AggregateKind::Closure {
                return false;
            }

            // Non-closure aggregates can be constructed as JSONB
            operands
                .iter()
                .all(|operand| is_supported_operand(context, body, domain, operand))
        }
        // Query parameters are passed to Postgres
        RValue::Input(_) => true,
        // Function calls cannot be pushed to Postgres
        RValue::Apply(_) => false,
    }
}

struct HasClosureVisitor<'guard, 'env, 'heap, A: Allocator = Global> {
    env: &'env Environment<'heap>,
    guard: &'guard mut RecursiveVisitorGuard<'heap, A>,
}

impl<'heap, A> r#type::visit::Visitor<'heap> for HasClosureVisitor<'_, '_, 'heap, A>
where
    A: Allocator,
{
    type Filter = r#type::visit::filter::Deep;
    type Result = ControlFlow<()>;

    fn env(&self) -> &Environment<'heap> {
        self.env
    }

    fn visit_type(&mut self, r#type: r#type::Type<'heap>) -> Self::Result {
        self.guard.with(
            |guard, r#type| {
                r#type::visit::walk_type(
                    &mut HasClosureVisitor {
                        env: self.env,
                        guard,
                    },
                    r#type,
                )
            },
            r#type,
        )
    }

    fn visit_closure(&mut self, _: r#type::Type<'heap, r#type::kind::ClosureType>) -> Self::Result {
        ControlFlow::Break(())
    }
}

/// Statement placement for the [`Postgres`] execution target.
///
/// Supports constants, binary/unary operations, aggregates (except closures), inputs, and entity
/// field projections that map to Postgres columns or JSONB paths. The environment argument is
/// only transferable if it contains no closure types.
pub struct PostgresStatementPlacement<'heap, S: Allocator> {
    statement_cost: Cost,
    type_visitor_guard: RecursiveVisitorGuard<'heap, S>,

    scratch: S,
}

impl<S: Allocator + Clone> PostgresStatementPlacement<'_, S> {
    pub fn new_in(scratch: S) -> Self {
        const TYPICAL_RECURSION_DEPTH: usize = 32; // This is the usual upper limit, we usually don't have more than ~8-16 levels, 32 at the absolute maximum in types such as `Entity`.

        Self {
            statement_cost: cost!(4),
            type_visitor_guard: RecursiveVisitorGuard::with_capacity_in(
                TYPICAL_RECURSION_DEPTH,
                scratch.clone(),
            ),
            scratch,
        }
    }
}

impl<'heap, A: Allocator + Clone, S: Allocator> StatementPlacement<'heap, A>
    for PostgresStatementPlacement<'heap, S>
{
    fn target(&self) -> TargetId {
        TargetId::Postgres
    }

    fn statement_placement_in(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<A>, StatementCostVec<A>) {
        let traversal_costs = TraversalCostVec::new_in(body, traversals, alloc.clone());
        let statement_costs = StatementCostVec::new_in(&body.basic_blocks, alloc);

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
                    debug_assert_eq!(body.args, 2);

                    // Environment (local 0) is only transferable if it contains no closures
                    let env_type = body.local_decls[Local::new(0)].r#type;
                    let has_closure = HasClosureVisitor {
                        env: context.env,
                        guard: &mut self.type_visitor_guard,
                    }
                    .visit_id(env_type)
                    .is_break();

                    if has_closure {
                        domain.remove(Local::new(0));
                    }

                    // Entity argument (local 1) must be constructed from field projections
                    domain.remove(Local::new(1));
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

            is_supported_rvalue,
        };
        visitor.visit_body(body);

        (visitor.traversal_costs, visitor.statement_costs)
    }
}
