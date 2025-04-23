pub mod closure;
pub mod generic_argument;
pub mod intersection;
pub mod intrinsic;
pub mod opaque;
pub mod primitive;
pub mod r#struct;
#[cfg(test)]
pub(crate) mod test;
pub mod tuple;
pub mod union;

use core::{ops::ControlFlow, ptr};

use pretty::RcDoc;
use smallvec::SmallVec;

pub use self::{
    closure::ClosureType, generic_argument::Param, intersection::IntersectionType,
    intrinsic::IntrinsicType, opaque::OpaqueType, primitive::PrimitiveType, r#struct::StructType,
    tuple::TupleType, union::UnionType,
};
use super::{
    Type, TypeId,
    environment::{Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment},
    error::{no_type_inference, type_mismatch},
    lattice::Lattice,
    pretty_print::{CYAN, GRAY, PrettyPrint},
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TypeKind<'heap> {
    Opaque(OpaqueType<'heap>),
    Primitive(PrimitiveType),
    Intrinsic(IntrinsicType),

    Struct(StructType<'heap>),
    Tuple(TupleType<'heap>),

    Union(UnionType<'heap>),
    Intersection(IntersectionType<'heap>),

    Closure(ClosureType<'heap>),

    Param(Param),

    Never,
    Unknown,
    Infer,
}

impl<'heap> TypeKind<'heap> {
    #[must_use]
    pub const fn opaque(&self) -> Option<&OpaqueType> {
        match self {
            Self::Opaque(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn primitive(&self) -> Option<&PrimitiveType> {
        match self {
            Self::Primitive(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn intrinsic(&self) -> Option<&IntrinsicType> {
        match self {
            Self::Intrinsic(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn r#struct(&self) -> Option<&StructType> {
        match self {
            Self::Struct(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn tuple(&self) -> Option<&TupleType> {
        match self {
            Self::Tuple(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn closure(&self) -> Option<&ClosureType> {
        match self {
            Self::Closure(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn union(&self) -> Option<&UnionType> {
        match self {
            Self::Union(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn intersection(&self) -> Option<&IntersectionType> {
        match self {
            Self::Intersection(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn param(&self) -> Option<&Param> {
        match self {
            Self::Param(r#type) => Some(r#type),
            _ => None,
        }
    }

    pub fn resolve(self: Type<'heap, Self>, env: &Environment<'heap>) -> Option<Type<'heap, Self>> {
        match self.kind {
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Closure(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Never
            | Self::Unknown => Some(self),
            &Self::Param(Param { argument }) => {
                let argument = env.substitution.argument(argument)?;

                Some(env.types[argument].copied())
            }
            Self::Infer => {
                let infer = env.substitution.infer(self.id)?;

                Some(env.types[infer].copied())
            }
        }
    }
}

impl<'heap> Lattice<'heap> for TypeKind<'heap> {
    #[expect(clippy::too_many_lines)]
    fn join(
        mut self: Type<'heap, Self>,
        mut other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        let Some(resolved) = self.resolve(env) else {
            if env.is_inference_enabled() {
                // We cannot determine the join of an inferred type with another type, therefore we
                // "delay" the join until the inferred type is resolved.
                return SmallVec::from_slice(&[self.id, other.id]);
            }

            // When inference is disabled, an unresolved type is considered as `Never` and an error
            // will be reported. Therefore if `Never`, the rule is: `Never ∨ T <=> T`
            env.diagnostics.push(no_type_inference(env, self));
            return SmallVec::from_slice(&[other.id]);
        };

        self = resolved;

        let Some(resolved) = other.resolve(env) else {
            if env.is_inference_enabled() {
                // We cannot determine the join of an inferred type with another type, therefore we
                // "delay" the join until the inferred type is resolved.
                return SmallVec::from_slice(&[self.id, other.id]);
            }

            // When inference is disabled, an unresolved type is considered as `Never` and an error
            // will be reported. Therefore if `Never`, the rule is: `T ∨ Never <=> T`
            env.diagnostics.push(no_type_inference(env, other));
            return SmallVec::from_slice(&[self.id]);
        };

        other = resolved;

        // Short circuit if the types are the same (this can be done via pointer comparison as the
        // types are interned)
        if ptr::eq(self.kind, other.kind) {
            return SmallVec::from_slice(&[self.id]);
        }

        #[expect(
            clippy::match_same_arms,
            reason = "The match arms are explicitely written out to make reasoning over them \
                      easier."
        )]
        match (self.kind, other.kind) {
            // Infer ∨ _ <=> unreachable!()
            // _ ∨ Infer <=> unreachable!()
            (Self::Infer, _) | (_, Self::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            // Param ∨ _ <=> unreachable!()
            // _ ∨ Param <=> unreachable!()
            (Self::Param(_), _) | (_, Self::Param(_)) => {
                unreachable!("parameter should've been resolved prior to this")
            }

            // T ∨ Never <=> T
            (_, Self::Never) => SmallVec::from_slice(&[self.id]),
            // Never ∨ T <=> T
            (Self::Never, _) => SmallVec::from_slice(&[other.id]),
            // T ∨ Never <=> T (slow)
            (_, _) if env.is_bottom(other.id) => SmallVec::from_slice(&[self.id]),
            // Never ∨ T <=> T (slow)
            (_, _) if env.is_bottom(self.id) => SmallVec::from_slice(&[other.id]),

            // T ∨ Unknown <=> Unknown
            (_, Self::Unknown) => SmallVec::from_slice(&[other.id]),
            // Unknown ∨ T <=> Unknown
            (Self::Unknown, _) => SmallVec::from_slice(&[self.id]),
            // T ∨ Unknown <=> Unknown (slow)
            (_, _) if env.is_top(other.id) => SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: other.span,
                kind: env.intern_kind(Self::Unknown),
            })]),
            // Unknown ∨ T <=> Unknown (slow)
            (_, _) if env.is_top(self.id) => SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: other.span,
                kind: env.intern_kind(Self::Unknown),
            })]),

            // Opaque ∨ _
            (Self::Opaque(lhs), Self::Opaque(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Opaque(_),
                Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            // Primitive ∨ _
            (Self::Primitive(lhs), Self::Primitive(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (
                Self::Primitive(_),
                Self::Opaque(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            // Intrinsic ∨ _
            (Self::Intrinsic(lhs), Self::Intrinsic(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (
                Self::Intrinsic(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            // Struct ∨ _
            (Self::Struct(lhs), Self::Struct(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Struct(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            // Tuple ∨ _
            (Self::Tuple(lhs), Self::Tuple(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Tuple(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Closure(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            // Closure ∨ _
            (Self::Closure(lhs), Self::Closure(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Closure(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            // Union ∨ _
            (Self::Union(lhs), Self::Union(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Union(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Tuple(_)
                | Self::Struct(_)
                | Self::Closure(_)
                | Self::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::join_variants(&lhs_variants, &rhs_variants, env)
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_),
                Self::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::join_variants(&lhs_variants, &rhs_variants, env)
            }

            // Intersection ∨ _
            (Self::Intersection(lhs), Self::Intersection(rhs)) => {
                self.map(|_| lhs).join(other.map(|_| rhs), env)
            }
            (
                Self::Intersection(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                IntersectionType::join_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
                Self::Intersection(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                IntersectionType::join_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
        }
    }

    #[expect(clippy::too_many_lines)]
    fn meet(
        mut self: Type<'heap, Self>,
        mut other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        let Some(resolved) = self.resolve(env) else {
            if env.is_inference_enabled() {
                // When inference is enabled, the unresolved type is "propagated" as part of the
                // meet until resolved
                return SmallVec::from_slice(&[self.id, other.id]);
            }

            // When inference is disabled, an unresolved type is considered as `Never` and an error
            // will be reported. Therefore if `Never`, the rule is: `T ∧ Never <=> Never`
            env.diagnostics.push(no_type_inference(env, self));
            return SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(Self::Never),
            })]);
        };

        self = resolved;

        let Some(resolved) = other.resolve(env) else {
            if env.is_inference_enabled() {
                // When inference is enabled, the unresolved type is "propagated" as part of the
                // meet until resolved
                return SmallVec::from_slice(&[self.id, other.id]);
            }

            // When inference is disabled, an unresolved type is considered as `Never` and an error
            // will be reported. Therefore if `Never`, the rule is: `T ∧ Never <=> Never`
            env.diagnostics.push(no_type_inference(env, other));
            return SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: other.span,
                kind: env.intern_kind(TypeKind::Never),
            })]);
        };

        other = resolved;

        // Short circuit if the types are the same (this can be done via pointer comparison as the
        // types are interned)
        if ptr::eq(self.kind, other.kind) {
            return SmallVec::from_slice(&[self.id]);
        }

        #[expect(clippy::match_same_arms)]
        match (self.kind, other.kind) {
            // Infer ∧ _ <=> unreachable!()
            // _ ∧ Infer <=> unreachable!()
            (Self::Infer, _) | (_, Self::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            // Param ∧ _ <=> unreachable!()
            // _ ∧ Param <=> unreachable!()
            (Self::Param(_), _) | (_, Self::Param(_)) => {
                unreachable!("parameter should've been resolved prior to this")
            }

            // T ∧ Never <=> Never
            (_, Self::Never) => SmallVec::from_slice(&[other.id]),
            // Never ∧ T <=> Never
            (Self::Never, _) => SmallVec::from_slice(&[self.id]),
            // T ∧ Never <=> Never (slow)
            (_, _) if env.is_bottom(other.id) => SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: other.span,
                kind: env.intern_kind(Self::Never),
            })]),
            // Never ∧ T <=> Never (slow)
            (_, _) if env.is_bottom(self.id) => SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(Self::Never),
            })]),

            // T ∧ Unknown <=> T
            (_, Self::Unknown) => SmallVec::from_slice(&[self.id]),
            // Unknown ∧ T <=> T
            (Self::Unknown, _) => SmallVec::from_slice(&[other.id]),
            // T ∧ Unknown <=> T (slow)
            (_, _) if env.is_top(other.id) => SmallVec::from_slice(&[self.id]),
            // Unknown ∧ T <=> T (slow)
            (_, _) if env.is_top(self.id) => SmallVec::from_slice(&[other.id]),

            // Opaque ∧ _
            (Self::Opaque(lhs), Self::Opaque(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (
                Self::Opaque(_),
                Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::new(),

            // Primitive ∧ _
            (Self::Primitive(lhs), Self::Primitive(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                Self::Primitive(_),
                Self::Opaque(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::new(),

            // Intrinsic ∧ _
            (Self::Intrinsic(lhs), Self::Intrinsic(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                Self::Intrinsic(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::new(),

            // Struct ∧ _
            (Self::Struct(lhs), Self::Struct(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (
                Self::Struct(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::new(),

            // Tuple ∧ _
            (Self::Tuple(lhs), Self::Tuple(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (
                Self::Tuple(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Closure(_),
            ) => SmallVec::new(),

            // Closure ∧ _
            (Self::Closure(lhs), Self::Closure(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (
                Self::Closure(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_),
            ) => SmallVec::new(),

            // Union ∧ _
            (Self::Union(lhs), Self::Union(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (
                Self::Union(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_),
                Self::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }

            // Intersection ∧ _
            (Self::Intersection(lhs), Self::Intersection(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                Self::Intersection(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Closure(_)
                | Self::Tuple(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                IntersectionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Closure(_)
                | Self::Tuple(_),
                Self::Intersection(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                IntersectionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
        }
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).is_bottom(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).is_bottom(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_bottom(env),
            Self::Struct(struct_type) => self.with(struct_type).is_bottom(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).is_bottom(env),
            Self::Closure(closure_type) => self.with(closure_type).is_bottom(env),
            Self::Union(union_type) => self.with(union_type).is_bottom(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).is_bottom(env),
            &Self::Param(Param { argument }) => {
                let Some(substitution) = env.substitution.argument(argument) else {
                    let _: ControlFlow<()> =
                        env.record_diagnostic(|env| no_type_inference(env, self));

                    return false;
                };

                env.is_bottom(substitution)
            }
            Self::Never => true,
            Self::Unknown => false,
            Self::Infer => {
                let Some(substitution) = env.substitution.infer(self.id) else {
                    let _: ControlFlow<()> =
                        env.record_diagnostic(|env| no_type_inference(env, self));

                    return false;
                };

                env.is_bottom(substitution)
            }
        }
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).is_top(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).is_top(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_top(env),
            Self::Struct(struct_type) => self.with(struct_type).is_top(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).is_top(env),
            Self::Closure(closure_type) => self.with(closure_type).is_top(env),
            Self::Union(union_type) => self.with(union_type).is_top(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).is_top(env),
            &Self::Param(Param { argument }) => {
                let Some(substitution) = env.substitution.argument(argument) else {
                    let _: ControlFlow<()> =
                        env.record_diagnostic(|env| no_type_inference(env, self));

                    return false;
                };

                env.is_top(substitution)
            }
            Self::Never => false,
            Self::Unknown => true,
            Self::Infer => {
                let Some(substitution) = env.substitution.infer(self.id) else {
                    let _: ControlFlow<()> =
                        env.record_diagnostic(|env| no_type_inference(env, self));

                    return false;
                };

                env.is_top(substitution)
            }
        }
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).is_concrete(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).is_concrete(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_concrete(env),
            Self::Struct(struct_type) => self.with(struct_type).is_concrete(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).is_concrete(env),
            Self::Closure(closure_type) => self.with(closure_type).is_concrete(env),
            Self::Union(union_type) => self.with(union_type).is_concrete(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).is_concrete(env),
            &Self::Param(Param { argument }) => env.substitution.argument(argument).is_some(),
            Self::Never | Self::Unknown => true,
            Self::Infer => env.substitution.infer(self.id).is_some(),
        }
    }

    fn distribute_union(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).distribute_union(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).distribute_union(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).distribute_union(env),
            Self::Struct(struct_type) => self.with(struct_type).distribute_union(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).distribute_union(env),
            Self::Closure(closure_type) => self.with(closure_type).distribute_union(env),
            Self::Union(union_type) => self.with(union_type).distribute_union(env),
            Self::Intersection(intersection_type) => {
                self.with(intersection_type).distribute_union(env)
            }
            &Self::Param(Param { argument }) => env.substitution.argument(argument).map_or_else(
                || SmallVec::from_slice(&[self.id]),
                |substitution| env.distribute_union(substitution),
            ),
            Self::Never | Self::Unknown | Self::Infer => SmallVec::from_slice(&[self.id]),
        }
    }

    fn distribute_intersection(
        self: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).distribute_intersection(env),
            Self::Primitive(primitive_type) => {
                self.with(primitive_type).distribute_intersection(env)
            }
            Self::Intrinsic(intrinsic_type) => {
                self.with(intrinsic_type).distribute_intersection(env)
            }
            Self::Struct(struct_type) => self.with(struct_type).distribute_intersection(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).distribute_intersection(env),
            Self::Closure(closure_type) => self.with(closure_type).distribute_intersection(env),
            Self::Union(union_type) => self.with(union_type).distribute_intersection(env),
            Self::Intersection(intersection_type) => {
                self.with(intersection_type).distribute_intersection(env)
            }
            &Self::Param(Param { argument }) => env.substitution.argument(argument).map_or_else(
                || SmallVec::from_slice(&[self.id]),
                |substitution| env.distribute_intersection(substitution),
            ),
            Self::Never | Self::Unknown | Self::Infer => SmallVec::from_slice(&[self.id]),
        }
    }

    #[expect(clippy::too_many_lines)]
    fn is_equivalent(
        mut self: Type<'heap, Self>,
        mut other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let Some(resolved) = self.resolve(env) else {
            let _: ControlFlow<()> = env.record_diagnostic(|env| no_type_inference(env, self));

            return false;
        };

        self = resolved;

        let Some(resolved) = other.resolve(env) else {
            let _: ControlFlow<()> = env.record_diagnostic(|env| no_type_inference(env, other));

            return false;
        };

        other = resolved;

        // Short circuit if the types are the same (this can be done via pointer comparison as the
        // types are interned)
        if ptr::eq(self.kind, other.kind) {
            return true;
        }

        // We use returns here, so that we don't double emit diagnostics on failures
        #[expect(clippy::match_same_arms)]
        let result = match (self.kind, other.kind) {
            // Infer ≡ _ <=> unreachable!()
            // _ ≡ Infer <=> unreachable!()
            (Self::Infer, _) | (_, Self::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            // Param ≡ _ <=> unreachable!()
            // _ ≡ Param <=> unreachable!()
            (Self::Param(_), _) | (_, Self::Param(_)) => {
                unreachable!("param should've been resolved prior to this")
            }

            // Never ≡ _
            (Self::Never, Self::Never) => true,
            (Self::Never, _) => env.is_bottom(other.id),
            (_, Self::Never) => env.is_bottom(self.id),
            (_, _) if env.is_bottom(self.id) && env.is_bottom(other.id) => true,

            // Unknown ≡ _
            (Self::Unknown, Self::Unknown) => true,
            (Self::Unknown, _) => env.is_top(other.id),
            (_, Self::Unknown) => env.is_top(self.id),
            (_, _) if env.is_top(self.id) && env.is_top(other.id) => true,

            // Opaque ≡ _
            (Self::Opaque(lhs), Self::Opaque(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Opaque(_),
                Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => false,

            // Primitive ≡ _
            (Self::Primitive(lhs), Self::Primitive(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Primitive(_),
                Self::Opaque(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => false,

            // Intrinsic ≡ _
            (Self::Intrinsic(lhs), Self::Intrinsic(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Intrinsic(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => false,

            // Struct ≡ _
            (Self::Struct(lhs), Self::Struct(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Struct(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => false,

            // Tuple ≡ _
            (Self::Tuple(lhs), Self::Tuple(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Tuple(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Struct(_)
                | Self::Intrinsic(_)
                | Self::Closure(_),
            ) => false,

            // Closure ≡ _
            (Self::Closure(lhs), Self::Closure(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Closure(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Struct(_)
                | Self::Intrinsic(_)
                | Self::Tuple(_),
            ) => false,

            // Union ≡ _
            (Self::Union(lhs), Self::Union(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Union(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_),
            )
            | (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_),
                Self::Union(_),
            ) => {
                let lhs_variants = self.distribute_union(env);
                let rhs_variants = other.distribute_union(env);

                return UnionType::is_equivalent_variants(
                    self,
                    other,
                    &lhs_variants,
                    &rhs_variants,
                    env,
                );
            }

            // Intersection ≡ _
            (Self::Intersection(lhs), Self::Intersection(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Intersection(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            )
            | (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
                Self::Intersection(_),
            ) => {
                let lhs_variants = self.distribute_intersection(env);
                let rhs_variants = other.distribute_intersection(env);

                return IntersectionType::is_equivalent_variants(
                    self,
                    other,
                    &lhs_variants,
                    &rhs_variants,
                    env,
                );
            }
        };

        if !result {
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                let help_message = match (&self.kind, &other.kind) {
                    (TypeKind::Opaque(_), _) | (_, TypeKind::Opaque(_)) => {
                        // Special case for opaque types mixed with other types
                        // Opaque types use nominal typing rather than structural typing
                        "Cannot mix nominal types (Opaque) with structural types. Opaque types are \
                         only equivalent to other opaque types of the same name."
                    }
                    (TypeKind::Never, _) | (_, TypeKind::Never) => {
                        "The 'Never' type represents computations that don't return. It's a \
                         subtype of all types but no type is a subtype of it (except itself)."
                    }
                    (TypeKind::Unknown, _) | (_, TypeKind::Unknown) => {
                        "The 'Unknown' type represents an unresolved or ambiguous type. It's a \
                         supertype of all types but not a subtype of any type (except itself)."
                    }
                    (TypeKind::Primitive(_), _) | (_, TypeKind::Primitive(_)) => {
                        "Primitive types cannot be equivalent to non-primitive types. Primitives \
                         represent atomic values that are fundamentally different from composite \
                         types."
                    }
                    (TypeKind::Intrinsic(_), _) | (_, TypeKind::Intrinsic(_)) => {
                        "Intrinsic types cannot be equivalent to non-intrinsic types. They \
                         represent special language constructs with unique behavior."
                    }
                    (TypeKind::Struct(_), _) | (_, TypeKind::Struct(_)) => {
                        "Struct types cannot be equivalent to non-struct types. Consider using \
                         type conversions or creating wrapper types if you need interoperability."
                    }
                    (TypeKind::Tuple(_), _) | (_, TypeKind::Tuple(_)) => {
                        "Tuple types cannot be equivalent to non-tuple types. Consider \
                         destructuring and reconstructing if you need to convert between different \
                         collection types."
                    }
                    (TypeKind::Closure(_), _) | (_, TypeKind::Closure(_)) => {
                        "Function/closure types cannot be equivalent to non-function types. \
                         Functions are first-class values with unique behavior."
                    }
                    _ => "These types are fundamentally incompatible and are not equivalent.",
                };

                type_mismatch(env, self, other, Some(help_message))
            });
        }

        result
    }

    #[expect(clippy::too_many_lines)]
    fn is_subtype_of(
        mut self: Type<'heap, Self>,
        mut supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let Some(resolved) = self.resolve(env) else {
            let _: ControlFlow<()> = env.record_diagnostic(|env| no_type_inference(env, self));

            return false;
        };

        self = resolved;

        let Some(resolved) = supertype.resolve(env) else {
            let _: ControlFlow<()> = env.record_diagnostic(|env| no_type_inference(env, supertype));

            return false;
        };

        supertype = resolved;

        // Short circuit if the types are the same (this can be done via pointer comparison as the
        // types are interned)
        if ptr::eq(self.kind, supertype.kind) {
            return true;
        }

        // We use returns here, so that we don't double emit diagnostics on failures
        #[expect(clippy::match_same_arms)]
        let result = match (self.kind, supertype.kind) {
            // Infer <: _ <=> unreachable!()
            // _ <: Infer <=> unreachable!()
            (Self::Infer, _) | (_, Self::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            // Param <: _ <=> unreachable!()
            // _ <: Param <=> unreachable!()
            (Self::Param(_), _) | (_, Self::Param(_)) => {
                unreachable!("param should've been resolved prior to this")
            }

            // `Never <: _`
            (Self::Never, _) => true,
            // `_ ≮: Never`
            (_, Self::Never) => false,
            // `Never <: _` (slow)
            (_, _) if env.is_bottom(self.id) => true,
            // `_ ≮: Never` (slow)
            (_, _) if env.is_bottom(supertype.id) => false,

            // `_ <: Unknown`
            (_, Self::Unknown) => true,
            // `Unknown ≮: _`
            (Self::Unknown, _) => false,
            // `_ <: Unknown` (slow)
            (_, _) if env.is_top(supertype.id) => true,
            // `Unknown ≮: _` (slow)
            (_, _) if env.is_top(self.id) => false,

            // Opaque <: _
            (Self::Opaque(lhs), Self::Opaque(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Opaque(_),
                Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => false,

            // Primitive <: _
            (Self::Primitive(lhs), Self::Primitive(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Primitive(_),
                Self::Opaque(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => false,

            // Intrinsic <: _
            (Self::Intrinsic(lhs), Self::Intrinsic(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Intrinsic(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => false,

            // Struct <: _
            (Self::Struct(lhs), Self::Struct(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Struct(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => false,

            // Tuple <: _
            (Self::Tuple(lhs), Self::Tuple(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Tuple(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Closure(_),
            ) => false,

            // Closure <: _
            (Self::Closure(lhs), Self::Closure(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Closure(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_),
            ) => false,

            // Union <: _
            (Self::Union(lhs), Self::Union(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Union(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_),
            )
            | (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_),
                Self::Union(_),
            ) => {
                let self_variants = self.distribute_union(env);
                let super_variants = supertype.distribute_union(env);

                return UnionType::is_subtype_of_variants(
                    self,
                    supertype,
                    &self_variants,
                    &super_variants,
                    env,
                );
            }

            // Intersection <: _
            (Self::Intersection(lhs), Self::Intersection(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Intersection(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            )
            | (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
                Self::Intersection(_),
            ) => {
                let self_variants = self.distribute_intersection(env);
                let super_variants = supertype.distribute_intersection(env);

                return IntersectionType::is_subtype_of_variants(
                    self,
                    supertype,
                    &self_variants,
                    &super_variants,
                    env,
                );
            }
        };

        if !result {
            let _: ControlFlow<()> = env.record_diagnostic(|env| {
                let help_message = match (&self.kind, &supertype.kind) {
                    (TypeKind::Opaque(_), _) | (_, TypeKind::Opaque(_)) => {
                        // Special case for opaque types mixed with other types
                        // Opaque types use nominal typing rather than structural typing
                        "Cannot mix nominal types (Opaque) with structural types. Opaque types are \
                         only subtypes of other opaque types of the same name."
                    }
                    (TypeKind::Never, _) | (_, TypeKind::Never) => {
                        "The 'Never' type represents computations that don't return. It's a \
                         subtype of all types but no type is a subtype of it (except itself)."
                    }
                    (TypeKind::Unknown, _) | (_, TypeKind::Unknown) => {
                        "The 'Unknown' type represents an unresolved or ambiguous type. It's a \
                         supertype of all types but not a subtype of any type (except itself)."
                    }
                    (TypeKind::Primitive(_), _) => {
                        "Primitive types cannot be subtypes of non-primitive types. The type \
                         system uses nominal typing for primitives rather than structural \
                         relationships."
                    }
                    (TypeKind::Struct(_), _) => {
                        "Struct types cannot be subtypes of non-struct types. Subtyping for \
                         structs is based on field compatibility, which doesn't apply across \
                         different type categories."
                    }
                    (TypeKind::Closure(_), _) => {
                        "Function types can only be subtypes of other function types. Function \
                         subtyping is based on parameter and return type compatibility."
                    }
                    _ => {
                        "These types are fundamentally incompatible and are therefore not subtypes \
                         of each other."
                    }
                };

                type_mismatch(env, self, supertype, Some(help_message))
            });
        }

        result
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        if env.is_bottom(self.id) {
            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Never),
            });
        }

        if env.is_top(self.id) {
            return env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Unknown),
            });
        }

        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).simplify(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).simplify(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).simplify(env),
            Self::Struct(struct_type) => self.with(struct_type).simplify(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).simplify(env),
            Self::Closure(closure_type) => self.with(closure_type).simplify(env),
            Self::Union(union_type) => self.with(union_type).simplify(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).simplify(env),
            Self::Param(_) | Self::Never | Self::Unknown | Self::Infer => self.id,
        }
    }
}

impl PrettyPrint for TypeKind<'_> {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        match self {
            Self::Opaque(opaque_type) => opaque_type.pretty(env, limit),
            Self::Primitive(primitive_type) => primitive_type.pretty(env, limit),
            Self::Intrinsic(intrinsic_type) => intrinsic_type.pretty(env, limit),
            Self::Struct(struct_type) => struct_type.pretty(env, limit),
            Self::Tuple(tuple_type) => tuple_type.pretty(env, limit),
            Self::Closure(closure_type) => closure_type.pretty(env, limit),
            Self::Union(union_type) => union_type.pretty(env, limit),
            Self::Intersection(intersection_type) => intersection_type.pretty(env, limit),
            Self::Param(param_type) => param_type.pretty(env, limit),
            Self::Never => RcDoc::text("!").annotate(CYAN),
            Self::Unknown => RcDoc::text("?").annotate(CYAN),
            Self::Infer => RcDoc::text("_").annotate(GRAY),
        }
    }
}

const _: () = {
    assert!(
        !core::mem::needs_drop::<TypeKind<'static>>(),
        "TypeKind cannot contain a `Drop` constructor, as it would cause a memory leak on heap \
         reset, as `Drop` won't be run."
    );
};
