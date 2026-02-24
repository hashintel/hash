use alloc::alloc::Global;
use core::{alloc::Allocator, ops::ControlFlow};

use hashql_core::{
    debug_panic,
    id::bit_vec::DenseBitSet,
    intern::Interned,
    span::SpanId,
    symbol::sym,
    r#type::{
        self, PartialType, Type, TypeId,
        environment::Environment,
        kind::{IntrinsicType, TypeKind},
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
        local::{Local, LocalDecl, LocalSlice},
        operand::Operand,
        place::{FieldIndex, Place, ProjectionKind},
        rvalue::{Aggregate, AggregateKind, BinOp, Binary, RValue, Unary},
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

/// Strips `Opaque`, `Apply`, and `Generic` wrappers to reach the underlying concrete type.
///
/// For unions where all variants peel to the same kind, returns that common type
/// (handles aliases like `type Foo = String` appearing in a union).
fn peel<'heap>(env: &Environment<'heap>, r#type: TypeId) -> Type<'heap> {
    let mut current = r#type;

    'peel: loop {
        let r#type = env.r#type(current);

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

            // Intersections and unions are simplified away if there's less than two types,
            // therefore we can assume that they have at least two variants.
            TypeKind::Union(r#type::kind::UnionType { variants }) => {
                debug_assert!(variants.len() >= 2);
                let [first, rest @ ..] = &**variants else {
                    unreachable!()
                };

                // If they peel to the same value, then we can replace the whole union with that
                // value.
                // This allows us to peel away an additional layer of `Opaque`
                let primary = peel(env, *first);
                for variant in rest {
                    let variant = peel(env, *variant);

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

fn is_equality_safe_operand<'heap>(
    env: &Environment<'heap>,
    locals: &LocalSlice<LocalDecl>,
    lhs: &Operand<'heap>,
    rhs: &Operand<'heap>,
) -> bool {
    match (lhs, rhs) {
        (Operand::Place(lhs), Operand::Place(rhs)) => {
            is_equality_safe2(env, lhs.type_id(locals), rhs.type_id(locals))
        }
        (Operand::Constant(Constant::FnPtr(_) | Constant::Int(_) | Constant::Primitive(_)), _)
        | (_, Operand::Constant(Constant::FnPtr(_) | Constant::Int(_) | Constant::Primitive(_))) => {
            // primitive equality is always safe
            true
        }
        (Operand::Constant(Constant::Unit), Operand::Constant(Constant::Unit)) => true,
        (Operand::Constant(Constant::Unit), Operand::Place(rhs)) => {
            // We must create an artificial tuple type for the unit type, and then use that for
            // comparison.
            let lhs = env.intern_type(PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(r#type::kind::TupleType {
                    fields: Interned::empty(),
                })),
            });

            is_equality_safe2(env, lhs, rhs.type_id(locals))
        }
        (Operand::Place(lhs), Operand::Constant(Constant::Unit)) => {
            let rhs = env.intern_type(PartialType {
                span: SpanId::SYNTHETIC,
                kind: env.intern_kind(TypeKind::Tuple(r#type::kind::TupleType {
                    fields: Interned::empty(),
                })),
            });

            is_equality_safe2(env, lhs.type_id(locals), rhs)
        }
    }
}

fn is_equality_safe2<'heap>(env: &Environment<'heap>, lhs: TypeId, rhs: TypeId) -> bool {
    if lhs == rhs {
        return true;
    }

    let lhs = peel(env, lhs);
    let rhs = peel(env, rhs);

    // If they point to the same interned type we don't need to check further
    if core::ptr::eq(lhs.kind, rhs.kind) {
        return true;
    }

    #[expect(clippy::match_same_arms, reason = "clarity over reasoning")]
    match (lhs.kind, rhs.kind) {
        // comparing against them is not safe, because we cannot
        (TypeKind::Unknown | TypeKind::Param(_) | TypeKind::Infer(_), _)
        | (_, TypeKind::Unknown | TypeKind::Param(_) | TypeKind::Infer(_)) => false,
        (
            TypeKind::Union(r#type::kind::UnionType { variants })
            | TypeKind::Intersection(r#type::kind::IntersectionType { variants }),
            _,
        ) => variants
            .iter()
            .all(|&variant| is_equality_safe2(env, variant, rhs.id)),
        (
            _,
            TypeKind::Union(r#type::kind::UnionType { variants })
            | TypeKind::Intersection(r#type::kind::IntersectionType { variants }),
        ) => variants
            .iter()
            .all(|&variant| is_equality_safe2(env, lhs.id, variant)),

        // We cannot compare dict with struct, because they serialize to the same type
        (TypeKind::Intrinsic(IntrinsicType::Dict(_)), TypeKind::Struct(_))
        | (TypeKind::Struct(_), TypeKind::Intrinsic(IntrinsicType::Dict(_))) => false,

        // We cannot compare dict with struct, because they serialize to the same type
        (TypeKind::Intrinsic(IntrinsicType::List(_)), TypeKind::Tuple(_))
        | (TypeKind::Tuple(_), TypeKind::Intrinsic(IntrinsicType::List(_))) => false,

        (
            TypeKind::Tuple(r#type::kind::TupleType { fields: lhs }),
            TypeKind::Tuple(r#type::kind::TupleType { fields: rhs }),
        ) => {
            // Different lengths are always safe to compare (and will lead to a constant `false`
            // anyway).
            if lhs.len() != rhs.len() {
                return true;
            }

            lhs.iter()
                .zip(rhs.iter())
                .all(|(&left_field, &right_field)| is_equality_safe(env, left_field, right_field))
        }
        (
            TypeKind::Struct(r#type::kind::StructType { fields: lhs }),
            TypeKind::Struct(r#type::kind::StructType { fields: rhs }),
        ) => {
            if lhs.len() != rhs.len() {
                return true;
            }

            // Names are ordered, so we can just zip them together
            lhs.iter().zip(rhs.iter()).all(|(left_field, right_field)| {
                left_field.name == right_field.name
                    && is_equality_safe(env, left_field.value, right_field.value)
            })
        }
        (
            TypeKind::Intrinsic(IntrinsicType::Dict(left_dict)),
            TypeKind::Intrinsic(IntrinsicType::Dict(right_dict)),
        ) => {
            is_equality_safe(env, left_dict.key, right_dict.key)
                && is_equality_safe(env, left_dict.value, right_dict.value)
        }
        (
            TypeKind::Intrinsic(IntrinsicType::List(left_list)),
            TypeKind::Intrinsic(IntrinsicType::List(right_list)),
        ) => is_equality_safe(env, left_list.element, right_list.element),
        // "onion" values are always removed, so shouldn't even exist
        (TypeKind::Opaque(_) | TypeKind::Apply(_) | TypeKind::Generic(_), _)
        | (_, TypeKind::Opaque(_) | TypeKind::Apply(_) | TypeKind::Generic(_)) => unreachable!(),
        // Primitive types are always equality safe
        (TypeKind::Primitive(_), _) | (_, TypeKind::Primitive(_)) => true,
        // Never never exists, but can be compared against
        (TypeKind::Never, _) | (_, TypeKind::Never) => true,
        // This should never occur, in the case that it does, return true, because the value itself
        // is comparable (it's a pointer)
        (TypeKind::Closure(_), _) | (_, TypeKind::Closure(_)) => {
            debug_panic!(
                "closure types should never require equality comparison per suitability \
                 requirements"
            );

            true
        }

        // True, just will return always false
        (
            TypeKind::Struct(_) | TypeKind::Intrinsic(IntrinsicType::Dict(_)),
            TypeKind::Tuple(_) | TypeKind::Intrinsic(IntrinsicType::List(_)),
        )
        | (
            TypeKind::Tuple(_) | TypeKind::Intrinsic(IntrinsicType::List(_)),
            TypeKind::Struct(_) | TypeKind::Intrinsic(IntrinsicType::Dict(_)),
        ) => true,
    }
}

/// Checks whether an equality comparison between two types can be safely evaluated in Postgres.
///
/// Returns `false` when the types could produce identical jsonb representations while being
/// semantically distinct. Walks both types side-by-side after peeling, checking at each depth:
/// - `Dict<String, _>` vs struct: both serialize to jsonb objects
/// - `List<_>` vs tuple: both serialize to jsonb arrays
/// - Unknown, `Param`, or `Infer` types: cannot prove safety
///
/// For unions and intersections, checks all variant pairs against the other operand.
fn is_equality_safe<'heap>(env: &Environment<'heap>, left: TypeId, right: TypeId) -> bool {
    if left == right {
        return true;
    }

    let left = peel(env, left);
    let right = peel(env, right);

    if matches!(
        left.kind,
        TypeKind::Unknown | TypeKind::Param(_) | TypeKind::Infer(_)
    ) || matches!(
        right.kind,
        TypeKind::Unknown | TypeKind::Param(_) | TypeKind::Infer(_)
    ) {
        return false;
    }

    if let TypeKind::Union(r#type::kind::UnionType { variants }) = left.kind {
        return variants
            .iter()
            .all(|&variant| is_equality_safe(env, variant, right.id));
    }
    if let TypeKind::Union(r#type::kind::UnionType { variants }) = right.kind {
        return variants
            .iter()
            .all(|&variant| is_equality_safe(env, left.id, variant));
    }

    if let TypeKind::Intersection(r#type::kind::IntersectionType { variants }) = left.kind {
        return variants
            .iter()
            .all(|&variant| is_equality_safe(env, variant, right.id));
    }
    if let TypeKind::Intersection(r#type::kind::IntersectionType { variants }) = right.kind {
        return variants
            .iter()
            .all(|&variant| is_equality_safe(env, left.id, variant));
    }

    match (left.kind, right.kind) {
        // Dict vs Struct: both serialize to jsonb objects
        (TypeKind::Intrinsic(IntrinsicType::Dict(_)), TypeKind::Struct(_))
        | (TypeKind::Struct(_), TypeKind::Intrinsic(IntrinsicType::Dict(_))) => false,

        // List vs Tuple: both serialize to jsonb arrays
        (TypeKind::Intrinsic(IntrinsicType::List(_)), TypeKind::Tuple(_))
        | (TypeKind::Tuple(_), TypeKind::Intrinsic(IntrinsicType::List(_))) => false,

        // Same-kind compound types: recurse into sub-elements
        (TypeKind::Tuple(left_tuple), TypeKind::Tuple(right_tuple)) => {
            if left_tuple.fields.len() != right_tuple.fields.len() {
                return true;
            }
            left_tuple
                .fields
                .iter()
                .zip(right_tuple.fields.iter())
                .all(|(&left_field, &right_field)| is_equality_safe(env, left_field, right_field))
        }

        (TypeKind::Struct(left_struct), TypeKind::Struct(right_struct)) => {
            if left_struct.fields.len() != right_struct.fields.len() {
                return true;
            }
            let all_names_match = left_struct
                .fields
                .iter()
                .zip(right_struct.fields.iter())
                .all(|(left_field, right_field)| left_field.name == right_field.name);
            if !all_names_match {
                return true;
            }
            left_struct
                .fields
                .iter()
                .zip(right_struct.fields.iter())
                .all(|(left_field, right_field)| {
                    is_equality_safe(env, left_field.value, right_field.value)
                })
        }

        (
            TypeKind::Intrinsic(IntrinsicType::Dict(left_dict)),
            TypeKind::Intrinsic(IntrinsicType::Dict(right_dict)),
        ) => {
            is_equality_safe(env, left_dict.key, right_dict.key)
                && is_equality_safe(env, left_dict.value, right_dict.value)
        }

        (
            TypeKind::Intrinsic(IntrinsicType::List(left_list)),
            TypeKind::Intrinsic(IntrinsicType::List(right_list)),
        ) => is_equality_safe(env, left_list.element, right_list.element),

        // Different categories (e.g., primitive vs struct) or same scalars
        _ => true,
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
                    debug_panic!(
                        "expected at least one projection for the env, the env should always be \
                         immediately destructured - if used"
                    );

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
            RValue::Binary(Binary { op, left, right }) => {
                if matches!(op, BinOp::Eq | BinOp::Ne)
                    && !is_equality_safe_operand(context.env, &body.local_decls, left, right)
                {
                    return false;
                }

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
        let key = peel(self.env, dict.kind.key);

        // jsonb object keys must be strings; dicts with non-string keys cannot be serialized
        if !matches!(
            key.kind,
            TypeKind::Primitive(r#type::kind::PrimitiveType::String)
        ) {
            return ControlFlow::Break(());
        }

        self.visit_id(dict.kind.value)
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
