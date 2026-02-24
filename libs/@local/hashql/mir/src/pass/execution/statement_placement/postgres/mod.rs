use alloc::alloc::Global;
use core::{alloc::Allocator, ops::ControlFlow};

use hashql_core::{
    id::bit_vec::DenseBitSet,
    symbol::sym,
    r#type::{
        self, Type, TypeId,
        environment::Environment,
        kind::TypeKind,
        visit::{RecursiveVisitorGuard, Visitor as _},
    },
};

use super::{
    StatementPlacement,
    common::{CostVisitor, OnceValue, Supported, SupportedAnalysis},
};
use crate::{
    body::{
        Body, Source,
        constant::Constant,
        local::Local,
        operand::Operand,
        place::{FieldIndex, Place, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, Binary, RValue, Unary},
    },
    context::MirContext,
    pass::{
        execution::{
            cost::{Cost, StatementCostVec, TraversalCostVec},
            statement_placement::lookup::{Access, entity_projection_access},
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

/// Postgres-specific support predicates, carrying per-field transferability of the environment.
#[derive(Debug, Copy, Clone)]
struct PostgresSupported<'ctx> {
    /// Which fields of the environment tuple can be serialized to Postgres.
    ///
    /// Fields containing closures or dicts with non-string keys are excluded.
    env_domain: &'ctx DenseBitSet<FieldIndex>,
}

impl PostgresSupported<'_> {
    /// Checks whether a place access in a [`GraphReadFilter`] body is Postgres-supported.
    ///
    /// Returns `Some(supported)` for the two fixed arguments (env and vertex), `None` for
    /// any other local (falls through to the regular domain check).
    ///
    /// [`GraphReadFilter`]: Source::GraphReadFilter
    fn is_supported_place_graph_read_filter<'heap>(
        self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,

        place: &Place<'heap>,
    ) -> Option<bool> {
        match place.local {
            Local::ENV => {
                // The environment projections depend on the first projection, because that
                // determines if we can actually transfer it
                let [first, ..] = &*place.projections else {
                    #[expect(clippy::manual_assert, reason = "debug panic")]
                    if cfg!(debug_assertions) {
                        panic!(
                            "expected at least one projection for the env, the env should always \
                             be immediately destructured - if used"
                        );
                    }

                    // We can gracefully handle this by returning false
                    return Some(false);
                };

                let ProjectionKind::Field(field) = first.kind else {
                    unreachable!("the env is a tuple and must always be indexed as such");
                };

                Some(self.env_domain.contains(field))
            }
            Local::VERTEX => {
                let local_type = body.local_decls[place.local].r#type;
                let type_name = context
                    .env
                    .r#type(local_type)
                    .kind
                    .opaque()
                    .map_or_else(|| unreachable!(), |opaque| opaque.name);

                if type_name == sym::path::Entity {
                    return Some(matches!(
                        entity_projection_access(&place.projections),
                        Some(Access::Postgres(_))
                    ));
                }

                unimplemented!("unimplemented lookup for declared type")
            }
            _ => None,
        }
    }

    fn is_supported_place<'heap>(
        self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        place: &Place<'heap>,
    ) -> bool {
        // For GraphReadFilter bodies, the env and vertex locals are handled specially:
        // env fields are checked against env_domain, vertex projections against entity
        // field access. Other locals fall through to the regular domain check.
        if matches!(body.source, Source::GraphReadFilter(_))
            && let Some(result) = self.is_supported_place_graph_read_filter(context, body, place)
        {
            return result;
        }

        domain.contains(place.local)
    }
}

impl<'heap> Supported<'heap> for PostgresSupported<'_> {
    fn is_supported_rvalue(
        &self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
        domain: &DenseBitSet<Local>,
        rvalue: &RValue<'heap>,
    ) -> bool {
        match rvalue {
            RValue::Load(operand) => self.is_supported_operand(context, body, domain, operand),
            RValue::Binary(Binary { op: _, left, right }) => {
                // TODO: equality comparison

                // All MIR binary operations have Postgres equivalents (with type coercion)
                self.is_supported_operand(context, body, domain, left)
                    && self.is_supported_operand(context, body, domain, right)
            }
            RValue::Unary(Unary { op: _, operand }) => {
                // All MIR unary operations have Postgres equivalents (with type coercion)
                self.is_supported_operand(context, body, domain, operand)
            }
            RValue::Aggregate(Aggregate { kind, operands }) => {
                if *kind == AggregateKind::Closure {
                    return false;
                }

                // Non-closure aggregates can be constructed as JSONB
                operands
                    .iter()
                    .all(|operand| self.is_supported_operand(context, body, domain, operand))
            }
            // Query parameters are passed to Postgres
            RValue::Input(_) => true,
            // Function calls cannot be pushed to Postgres
            RValue::Apply(_) => false,
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
            Operand::Place(place) => self.is_supported_place(context, body, domain, place),
            Operand::Constant(constant) => is_supported_constant(constant),
        }
    }
}

/// Recursive type visitor that rejects types not transferable to Postgres.
///
/// Breaks on closure types (no Postgres representation) and dicts with non-string keys
/// (jsonb object keys must be strings).
struct SupportedVisitor<'guard, 'env, 'heap, A: Allocator = Global> {
    env: &'env Environment<'heap>,
    guard: &'guard mut RecursiveVisitorGuard<'heap, A>,
}

impl<'heap, A: Allocator> SupportedVisitor<'_, '_, 'heap, A> {
    /// Strips `Opaque`, `Apply`, and `Generic` wrappers to reach the underlying concrete type.
    ///
    /// For unions where all variants peel to the same kind, returns that common type
    /// (handles aliases like `type Foo = String` appearing in a union).
    fn peel(&self, r#type: TypeId) -> Type<'heap> {
        let mut current = r#type;

        'peel: loop {
            let r#type = self.env.r#type(current);

            match r#type.kind {
                &TypeKind::Opaque(r#type::kind::OpaqueType { repr: base, .. })
                | &TypeKind::Apply(r#type::kind::Apply { base, .. })
                | &TypeKind::Generic(r#type::kind::Generic { base, .. }) => {
                    current = base;
                }

                TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Struct(_)
                | TypeKind::Tuple(_)
                | TypeKind::Closure(_)
                | TypeKind::Param(_)
                | TypeKind::Infer(_)
                | TypeKind::Never
                | TypeKind::Unknown => break r#type,

                // intersections and unions are simplified away if there's less than two types.
                TypeKind::Union(r#type::kind::UnionType { variants }) => {
                    debug_assert!(variants.len() >= 2);
                    let [first, rest @ ..] = &**variants else {
                        unreachable!()
                    };

                    // If they peel to the same value, then we can replace the whole union with that
                    // value.
                    // This allows us to peel away an additional layer of `Opaque`
                    let primary = self.peel(*first);
                    for variant in rest {
                        let variant = self.peel(*variant);

                        if variant.kind != primary.kind {
                            break 'peel r#type;
                        }
                    }

                    break primary;
                }
                TypeKind::Intersection(r#type::kind::IntersectionType { variants }) => {
                    debug_assert!(variants.len() >= 2);

                    break r#type;
                }
            }
        }
    }
}

impl<'heap, A> r#type::visit::Visitor<'heap> for SupportedVisitor<'_, '_, 'heap, A>
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
                    &mut SupportedVisitor {
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

    fn visit_intrinsic_dict(
        &mut self,
        dict: Type<'heap, r#type::kind::intrinsic::DictType>,
    ) -> Self::Result {
        let key = self.peel(dict.kind.key);

        // jsonb object keys must be strings; dicts with non-string keys cannot be serialized
        if !matches!(
            key.kind,
            TypeKind::Primitive(r#type::kind::PrimitiveType::String)
        ) {
            return ControlFlow::Break(());
        }

        ControlFlow::Continue(())
    }
}

/// Statement placement for the [`Postgres`](super::super::TargetId::Postgres) execution target.
///
/// Supports constants, binary/unary operations, aggregates (except closures), inputs, and entity
/// field projections that map to Postgres columns or JSONB paths. Environment fields are checked
/// individually: a field is transferable if its type contains no closures and all dicts within
/// it have string keys (required for jsonb serialization).
pub(crate) struct PostgresStatementPlacement<'heap, S: Allocator> {
    statement_cost: Cost,
    type_visitor_guard: RecursiveVisitorGuard<'heap, S>,

    scratch: S,
}

impl<S: Allocator + Clone> PostgresStatementPlacement<'_, S> {
    pub(crate) fn new_in(scratch: S) -> Self {
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

impl<'heap, S: Allocator> PostgresStatementPlacement<'heap, S> {
    /// Computes which fields of the environment tuple are transferable to Postgres.
    ///
    /// Visits each field's type recursively; a field is supported if the visit completes
    /// without encountering a closure or a dict with non-string keys.
    fn env_domain(
        &mut self,
        context: &MirContext<'_, 'heap>,
        body: &Body<'heap>,
    ) -> DenseBitSet<FieldIndex> {
        let env_id = body.local_decls[Local::ENV].r#type;
        let env = context
            .env
            .r#type(env_id)
            .kind
            .tuple()
            .unwrap_or_else(|| unreachable!("the environment is always a tuple"));

        let mut visitor = SupportedVisitor {
            env: context.env,
            guard: &mut self.type_visitor_guard,
        };

        let mut supported = DenseBitSet::new_empty(env.fields.len());

        for (index, &field) in env.fields.iter().enumerate() {
            let is_supported = visitor.visit_id(field).is_continue();
            supported.set(FieldIndex::new(index), is_supported);
        }

        supported
    }
}

impl<'heap, A: Allocator + Clone, S: Allocator> StatementPlacement<'heap, A>
    for PostgresStatementPlacement<'heap, S>
{
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

        let env_domain = self.env_domain(context, body);
        let supported = PostgresSupported {
            env_domain: &env_domain,
        };

        let dispatchable = SupportedAnalysis {
            body,
            context,
            supported,
            initialize_boundary: OnceValue::new(
                |body: &Body<'heap>, domain: &mut DenseBitSet<Local>| {
                    debug_assert_eq!(body.args, 2);

                    // Entity argument (local 1) must be constructed from field projections, and the
                    // env is always projected as well.
                    domain.remove(Local::ENV);
                    domain.remove(Local::VERTEX);
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

            supported,
        };
        visitor.visit_body(body);

        (visitor.traversal_costs, visitor.statement_costs)
    }
}
