use core::{alloc::Allocator, ops::ControlFlow};

use hashql_core::{
    heap::Heap,
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
        analysis::execution::{
            cost::{Cost, StatementCostVec, TraversalCostVec},
            statement_placement::lookup::{Access, entity_projection_access},
            target::Postgres,
        },
        transform::Traversals,
    },
    visit::Visitor as _,
};

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
    // the first argument to the function is the environment, which depends on the domain, and
    // the second local is the filter itself. Therefore the second argument is specially handled.
    if matches!(body.source, Source::GraphReadFilter(_)) && place.local.as_usize() == 1 {
        // we must first check the type, to determine what "type" of filter it is, the function will
        // have a vertex, which is an opaque of either entity, entity-type, etc.
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
            // Any binary operation present and supported is also supported by postgres (given that
            // the type is first coerced)
            is_supported_operand(context, body, domain, left)
                && is_supported_operand(context, body, domain, right)
        }
        RValue::Unary(Unary { op: _, operand }) => {
            // Any unary operation currently support is also supported by postgres, given a type
            // coercion.
            is_supported_operand(context, body, domain, operand)
        }
        RValue::Aggregate(Aggregate { kind, operands }) => {
            if *kind == AggregateKind::Closure {
                return false;
            }

            // We can construct a JSONB equivalent for each data type (opaques are simply
            // eliminated) given that we work in JSONB.
            operands
                .iter()
                .all(|operand| is_supported_operand(context, body, domain, operand))
        }
        // In general input is supported, as long as these parameters are given to the query
        // beforehand
        RValue::Input(_) => true,
        // Function calls are in general **not** supported
        RValue::Apply(_) => false,
    }
}

struct HasClosureVisitor<'env, 'heap> {
    env: &'env Environment<'heap>,
}

impl<'heap> r#type::visit::Visitor<'heap> for HasClosureVisitor<'_, 'heap> {
    type Filter = r#type::visit::filter::Deep;
    type Result = ControlFlow<()>;

    fn env(&self) -> &Environment<'heap> {
        self.env
    }

    fn visit_closure(&mut self, _: r#type::Type<'heap, r#type::kind::ClosureType>) -> Self::Result {
        ControlFlow::Break(())
    }
}

pub(crate) struct PostgresStatementPlacement<'heap> {
    statement_cost: Cost,
    type_visitor_guard: RecursiveVisitorGuard<'heap>,
}

impl Default for PostgresStatementPlacement<'_> {
    fn default() -> Self {
        Self {
            statement_cost: cost!(4),
            type_visitor_guard: RecursiveVisitorGuard::default(),
        }
    }
}

impl<'heap, A: Allocator + Clone> StatementPlacement<'heap, A>
    for PostgresStatementPlacement<'heap>
{
    type Target = Postgres;

    fn statement_placement(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        traversals: &Traversals<'heap>,
        alloc: A,
    ) -> (TraversalCostVec<&'heap Heap>, StatementCostVec<&'heap Heap>) {
        let dispatchable = SupportedAnalysis {
            body,
            context,
            is_supported_rvalue,
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

                    // Inside of postgres, the first argument (the env) can only be transferred if
                    // it doesn't contain unsupported data, aka: no closure pointers
                    let env_type = body.local_decls[Local::new(0)].r#type;
                    let has_env_pointer = (
                        &mut self.type_visitor_guard,
                        HasClosureVisitor { env: context.env },
                    )
                        .visit_id(env_type)
                        .is_break();

                    if has_env_pointer {
                        domain.remove(Local::new(0));
                    }

                    // The entity itself is also never supported directly, because we need to
                    // construct that one
                    domain.remove(Local::new(1));
                },
            ),
        }
        .finish_in(alloc);

        let statement_costs = StatementCostVec::new(&body.basic_blocks, context.heap);
        let traversal_costs = TraversalCostVec::new(body, traversals, context.heap);

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
