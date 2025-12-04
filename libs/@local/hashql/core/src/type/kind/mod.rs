pub mod closure;
pub mod generic;
pub mod infer;
pub mod intersection;
pub mod intrinsic;
pub mod opaque;
pub mod primitive;
pub mod r#struct;
#[cfg(test)]
pub(crate) mod test;
#[cfg(test)]
pub(crate) mod tests;
pub mod tuple;
pub mod union;

use core::{ops::ControlFlow, ptr};

use smallvec::SmallVec;

pub use self::{
    closure::ClosureType,
    generic::{Apply, Generic, GenericArgument, GenericArguments, GenericSubstitutions, Param},
    infer::Infer,
    intersection::IntersectionType,
    intrinsic::IntrinsicType,
    opaque::OpaqueType,
    primitive::PrimitiveType,
    r#struct::StructType,
    tuple::TupleType,
    union::UnionType,
};
use super::{
    PartialType, Type, TypeId,
    environment::{
        AnalysisEnvironment, InferenceEnvironment, LatticeEnvironment, SimplifyEnvironment,
        Variance, instantiate::InstantiateEnvironment,
    },
    error::{
        UnsupportedProjectionCategory, UnsupportedSubscriptCategory, no_type_inference,
        type_mismatch, type_parameter_not_found, unsupported_projection, unsupported_subscript,
    },
    inference::{Constraint, Inference, Variable, VariableKind},
    lattice::{Lattice, Projection, Subscript},
};
use crate::symbol::Ident;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeKind<'heap> {
    Opaque(OpaqueType<'heap>),
    Primitive(PrimitiveType),
    Intrinsic(IntrinsicType),

    Struct(StructType<'heap>),
    Tuple(TupleType<'heap>),

    Union(UnionType<'heap>),
    Intersection(IntersectionType<'heap>),

    Closure(ClosureType<'heap>),

    Apply(Apply<'heap>),
    Generic(Generic<'heap>),

    Param(Param),
    Infer(Infer),

    Never,
    Unknown,
}

impl<'heap> TypeKind<'heap> {
    #[must_use]
    pub const fn opaque(&self) -> Option<&OpaqueType<'heap>> {
        match self {
            Self::Opaque(r#type) => Some(r#type),
            Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn primitive(&self) -> Option<&PrimitiveType> {
        match self {
            Self::Primitive(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn intrinsic(&self) -> Option<&IntrinsicType> {
        match self {
            Self::Intrinsic(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn r#struct(&self) -> Option<&StructType<'heap>> {
        match self {
            Self::Struct(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn tuple(&self) -> Option<&TupleType<'heap>> {
        match self {
            Self::Tuple(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn closure(&self) -> Option<&ClosureType<'heap>> {
        match self {
            Self::Closure(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn union(&self) -> Option<&UnionType<'heap>> {
        match self {
            Self::Union(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn intersection(&self) -> Option<&IntersectionType<'heap>> {
        match self {
            Self::Intersection(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn apply(&self) -> Option<&Apply<'heap>> {
        match self {
            Self::Apply(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Generic(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn generic(&self) -> Option<&Generic<'heap>> {
        match self {
            Self::Generic(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Param(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    #[must_use]
    pub const fn param(&self) -> Option<&Param> {
        match self {
            Self::Param(r#type) => Some(r#type),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Infer(_)
            | Self::Never
            | Self::Unknown => None,
        }
    }

    pub(crate) const fn into_variable(self) -> Option<VariableKind> {
        match self {
            Self::Infer(Infer { hole }) => Some(VariableKind::Hole(hole)),
            Self::Param(Param { argument }) => Some(VariableKind::Generic(argument)),
            Self::Opaque(_)
            | Self::Primitive(_)
            | Self::Intrinsic(_)
            | Self::Struct(_)
            | Self::Tuple(_)
            | Self::Union(_)
            | Self::Intersection(_)
            | Self::Closure(_)
            | Self::Apply(_)
            | Self::Generic(_)
            | Self::Never
            | Self::Unknown => None,
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
        let Some(resolved) = env.resolve_type(self) else {
            if env.is_inference_enabled() {
                // We cannot determine the join of an inferred type with another type, therefore we
                // "delay" the join until the inferred type is resolved.
                return SmallVec::from_slice_copy(&[self.id, other.id]);
            }

            // When inference is disabled, an unresolved type is considered as `Never` and an error
            // will be reported. Therefore if `Never`, the rule is: `Never ∨ T <=> T`
            env.diagnostics.push(no_type_inference(self));
            return SmallVec::from_slice_copy(&[other.id]);
        };

        self = resolved;

        let Some(resolved) = env.resolve_type(other) else {
            if env.is_inference_enabled() {
                // We cannot determine the join of an inferred type with another type, therefore we
                // "delay" the join until the inferred type is resolved.
                return SmallVec::from_slice_copy(&[self.id, other.id]);
            }

            // When inference is disabled, an unresolved type is considered as `Never` and an error
            // will be reported. Therefore if `Never`, the rule is: `T ∨ Never <=> T`
            env.diagnostics.push(no_type_inference(other));
            return SmallVec::from_slice_copy(&[self.id]);
        };

        other = resolved;

        // Short circuit if the types are the same (this can be done via pointer comparison as the
        // types are interned)
        if ptr::eq(self.kind, other.kind) {
            return SmallVec::from_slice_copy(&[self.id]);
        }

        #[expect(
            clippy::match_same_arms,
            reason = "The match arms are explicitely written out to make reasoning over them \
                      easier."
        )]
        match (self.kind, other.kind) {
            // Infer ∨ _ <=> unreachable!()
            // _ ∨ Infer <=> unreachable!()
            (Self::Infer(_), _) | (_, Self::Infer(_)) => {
                unreachable!("infer should've been resolved prior to this")
            }

            // Param ∨ _ <=> unreachable!()
            // _ ∨ Param <=> unreachable!()
            (Self::Param(_), _) | (_, Self::Param(_)) => {
                unreachable!("parameter should've been resolved prior to this")
            }

            // T ∨ Never <=> T
            (_, Self::Never) => SmallVec::from_slice_copy(&[self.id]),
            // Never ∨ T <=> T
            (Self::Never, _) => SmallVec::from_slice_copy(&[other.id]),
            // T ∨ Never <=> T (slow)
            (_, _) if env.is_bottom(other.id) => SmallVec::from_slice_copy(&[self.id]),
            // Never ∨ T <=> T (slow)
            (_, _) if env.is_bottom(self.id) => SmallVec::from_slice_copy(&[other.id]),

            // T ∨ Unknown <=> Unknown
            (_, Self::Unknown) => SmallVec::from_slice_copy(&[other.id]),
            // Unknown ∨ T <=> Unknown
            (Self::Unknown, _) => SmallVec::from_slice_copy(&[self.id]),
            // T ∨ Unknown <=> Unknown (slow)
            (_, _) if env.is_top(other.id) => {
                SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                    span: other.span,
                    kind: env.intern_kind(Self::Unknown),
                })])
            }
            // Unknown ∨ T <=> Unknown (slow)
            (_, _) if env.is_top(self.id) => {
                SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                    span: other.span,
                    kind: env.intern_kind(Self::Unknown),
                })])
            }

            // Opaque ∨ _
            (Self::Opaque(lhs), Self::Opaque(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Opaque(_),
                Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::from_slice_copy(&[self.id, other.id]),

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
            ) => SmallVec::from_slice_copy(&[self.id, other.id]),

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
            ) => SmallVec::from_slice_copy(&[self.id, other.id]),

            // Struct ∨ _
            (Self::Struct(lhs), Self::Struct(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Struct(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Tuple(_)
                | Self::Closure(_),
            ) => SmallVec::from_slice_copy(&[self.id, other.id]),

            // Tuple ∨ _
            (Self::Tuple(lhs), Self::Tuple(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Tuple(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Closure(_),
            ) => SmallVec::from_slice_copy(&[self.id, other.id]),

            // Closure ∨ _
            (Self::Closure(lhs), Self::Closure(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Closure(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_),
            ) => SmallVec::from_slice_copy(&[self.id, other.id]),

            // Apply ∨ _
            (Self::Apply(lhs), Self::Apply(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                &Self::Apply(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Closure(_),
            ) => {
                let rhs = Apply {
                    base: other.id,
                    substitutions: GenericSubstitutions::empty(),
                };

                lhs.join_base(rhs, env, self.span)
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Closure(_),
                &Self::Apply(rhs),
            ) => {
                let lhs = Apply {
                    base: self.id,
                    substitutions: GenericSubstitutions::empty(),
                };

                lhs.join_base(rhs, env, self.span)
            }

            // Generic ∨ _
            (Self::Generic(lhs), Self::Generic(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (
                Self::Generic(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Closure(_)
                | Self::Apply(_),
            ) => {
                let rhs = Generic {
                    base: other.id,
                    arguments: GenericArguments::empty(),
                };

                lhs.join_base(rhs, env, self.span)
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Closure(_)
                | Self::Apply(_),
                &Self::Generic(rhs),
            ) => {
                let lhs = Generic {
                    base: self.id,
                    arguments: GenericArguments::empty(),
                };

                lhs.join_base(rhs, env, self.span)
            }

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
                let lhs_variants = self.with(lhs).unnest(env);
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
                let rhs_variants = other.with(rhs).unnest(env);

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
                let lhs_variants = self.with(lhs).unnest(env);
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
                let rhs_variants = other.with(rhs).unnest(env);

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
        let Some(resolved) = env.resolve_type(self) else {
            if env.is_inference_enabled() {
                // When inference is enabled, the unresolved type is "propagated" as part of the
                // meet until resolved
                return SmallVec::from_slice_copy(&[self.id, other.id]);
            }

            // When inference is disabled, an unresolved type is considered as `Never` and an error
            // will be reported. Therefore if `Never`, the rule is: `T ∧ Never <=> Never`
            env.diagnostics.push(no_type_inference(self));
            return SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                span: self.span,
                kind: env.intern_kind(Self::Never),
            })]);
        };

        self = resolved;

        let Some(resolved) = env.resolve_type(other) else {
            if env.is_inference_enabled() {
                // When inference is enabled, the unresolved type is "propagated" as part of the
                // meet until resolved
                return SmallVec::from_slice_copy(&[self.id, other.id]);
            }

            // When inference is disabled, an unresolved type is considered as `Never` and an error
            // will be reported. Therefore if `Never`, the rule is: `T ∧ Never <=> Never`
            env.diagnostics.push(no_type_inference(other));
            return SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                span: other.span,
                kind: env.intern_kind(TypeKind::Never),
            })]);
        };

        other = resolved;

        // Short circuit if the types are the same (this can be done via pointer comparison as the
        // types are interned)
        if ptr::eq(self.kind, other.kind) {
            return SmallVec::from_slice_copy(&[self.id]);
        }

        #[expect(clippy::match_same_arms)]
        match (self.kind, other.kind) {
            // Infer ∧ _ <=> unreachable!()
            // _ ∧ Infer <=> unreachable!()
            (Self::Infer(_), _) | (_, Self::Infer(_)) => {
                unreachable!("infer should've been resolved prior to this")
            }

            // Param ∧ _ <=> unreachable!()
            // _ ∧ Param <=> unreachable!()
            (Self::Param(_), _) | (_, Self::Param(_)) => {
                unreachable!("parameter should've been resolved prior to this")
            }

            // T ∧ Never <=> Never
            (_, Self::Never) => SmallVec::from_slice_copy(&[other.id]),
            // Never ∧ T <=> Never
            (Self::Never, _) => SmallVec::from_slice_copy(&[self.id]),
            // T ∧ Never <=> Never (slow)
            (_, _) if env.is_bottom(other.id) => {
                SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                    span: other.span,
                    kind: env.intern_kind(Self::Never),
                })])
            }
            // Never ∧ T <=> Never (slow)
            (_, _) if env.is_bottom(self.id) => {
                SmallVec::from_slice_copy(&[env.intern_type(PartialType {
                    span: self.span,
                    kind: env.intern_kind(Self::Never),
                })])
            }

            // T ∧ Unknown <=> T
            (_, Self::Unknown) => SmallVec::from_slice_copy(&[self.id]),
            // Unknown ∧ T <=> T
            (Self::Unknown, _) => SmallVec::from_slice_copy(&[other.id]),
            // T ∧ Unknown <=> T (slow)
            (_, _) if env.is_top(other.id) => SmallVec::from_slice_copy(&[self.id]),
            // Unknown ∧ T <=> T (slow)
            (_, _) if env.is_top(self.id) => SmallVec::from_slice_copy(&[other.id]),

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

            // Apply ∧ _
            (Self::Apply(lhs), Self::Apply(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (
                &Self::Apply(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Closure(_),
            ) => {
                let rhs = Apply {
                    base: other.id,
                    substitutions: GenericSubstitutions::empty(),
                };

                lhs.meet_base(rhs, env, self.span)
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Closure(_),
                &Self::Apply(rhs),
            ) => {
                let lhs = Apply {
                    base: self.id,
                    substitutions: GenericSubstitutions::empty(),
                };

                lhs.meet_base(rhs, env, self.span)
            }
            // Generic ∧ _
            (Self::Generic(lhs), Self::Generic(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (
                &Self::Generic(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Closure(_)
                | Self::Apply(_),
            ) => {
                let rhs = Generic {
                    base: other.id,
                    arguments: GenericArguments::empty(),
                };

                lhs.meet_base(rhs, env, self.span)
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Closure(_)
                | Self::Apply(_),
                &Self::Generic(rhs),
            ) => {
                let lhs = Generic {
                    base: self.id,
                    arguments: GenericArguments::empty(),
                };

                lhs.meet_base(rhs, env, self.span)
            }

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
                let lhs_variants = self.with(lhs).unnest(env);
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
                let rhs_variants = other.with(rhs).unnest(env);

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
                let lhs_variants = self.with(lhs).unnest(env);
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
                let rhs_variants = other.with(rhs).unnest(env);

                IntersectionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
        }
    }

    fn projection(
        mut self: Type<'heap, Self>,
        field: Ident<'heap>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> Projection {
        let Some(this) = env.resolve_type(self) else {
            // We do not record diagnostics here, because if ever they're recorded after the
            // fact, as projection runs *during* fix-point analysis.
            return Projection::Pending;
        };

        self = this;

        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).projection(field, env),
            Self::Primitive(primitive_type) => self.with(primitive_type).projection(field, env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).projection(field, env),
            Self::Struct(struct_type) => self.with(struct_type).projection(field, env),
            Self::Tuple(tuple_type) => self.with(tuple_type).projection(field, env),
            Self::Union(union_type) => self.with(union_type).projection(field, env),
            Self::Intersection(intersection_type) => {
                self.with(intersection_type).projection(field, env)
            }
            Self::Closure(closure_type) => self.with(closure_type).projection(field, env),
            Self::Apply(apply) => self.with(apply).projection(field, env),
            Self::Generic(generic) => self.with(generic).projection(field, env),
            Self::Param(_) | Self::Infer(_) => {
                unreachable!("should've been resolved prior to this")
            }
            Self::Never => {
                env.diagnostics.push(unsupported_projection(
                    self,
                    field,
                    UnsupportedProjectionCategory::Never,
                    env,
                ));

                Projection::Error
            }
            Self::Unknown => {
                env.diagnostics.push(unsupported_projection(
                    self,
                    field,
                    UnsupportedProjectionCategory::Unknown,
                    env,
                ));

                Projection::Error
            }
        }
    }

    fn subscript(
        mut self: Type<'heap, Self>,
        index: TypeId,
        env: &mut LatticeEnvironment<'_, 'heap>,
        infer: &mut InferenceEnvironment<'_, 'heap>,
    ) -> Subscript {
        let Some(this) = env.resolve_type(self) else {
            // We do not record diagnostics here, because if ever they're recorded after the
            // fact, as subscript runs *during* fix-point analysis.

            // Because the subject itself isn't resolved yet, we cannot discharge any additional
            // constraints.
            return Subscript::Pending;
        };

        self = this;

        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).subscript(index, env, infer),
            Self::Primitive(primitive_type) => {
                self.with(primitive_type).subscript(index, env, infer)
            }
            Self::Intrinsic(intrinsic_type) => {
                self.with(intrinsic_type).subscript(index, env, infer)
            }
            Self::Struct(struct_type) => self.with(struct_type).subscript(index, env, infer),
            Self::Tuple(tuple_type) => self.with(tuple_type).subscript(index, env, infer),
            Self::Union(union_type) => self.with(union_type).subscript(index, env, infer),
            Self::Intersection(intersection_type) => {
                self.with(intersection_type).subscript(index, env, infer)
            }
            Self::Closure(closure_type) => self.with(closure_type).subscript(index, env, infer),
            Self::Apply(apply) => self.with(apply).subscript(index, env, infer),
            Self::Generic(generic) => self.with(generic).subscript(index, env, infer),
            Self::Param(_) | Self::Infer(_) => {
                unreachable!("should've been resolved prior to this")
            }
            Self::Never => {
                env.diagnostics.push(unsupported_subscript(
                    self,
                    index,
                    UnsupportedSubscriptCategory::Never,
                    env,
                ));

                Subscript::Error
            }
            Self::Unknown => {
                env.diagnostics.push(unsupported_subscript(
                    self,
                    index,
                    UnsupportedSubscriptCategory::Unknown,
                    env,
                ));

                Subscript::Error
            }
        }
    }

    fn is_bottom(mut self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // If the type has already been resolved, substitute the resolved type
        let Some(this) = env.resolve_type(self) else {
            // We cannot determine if a type is bottom, if it hasn't been resolved yet
            let _: ControlFlow<()> = env.record_diagnostic(|_| no_type_inference(self));

            return false;
        };

        self = this;

        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).is_bottom(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).is_bottom(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_bottom(env),
            Self::Struct(struct_type) => self.with(struct_type).is_bottom(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).is_bottom(env),
            Self::Closure(closure_type) => self.with(closure_type).is_bottom(env),
            Self::Union(union_type) => self.with(union_type).is_bottom(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).is_bottom(env),
            Self::Apply(apply) => self.with(apply).is_bottom(env),
            Self::Generic(generic) => self.with(generic).is_bottom(env),
            Self::Param(_) | Self::Infer(_) => unreachable!("should've been resolved"),
            Self::Never => true,
            Self::Unknown => false,
        }
    }

    fn is_top(mut self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // If the type has already been resolved, substitute the resolved type
        let Some(this) = env.resolve_type(self) else {
            // We cannot determine if a type is top, if it hasn't been resolved yet
            let _: ControlFlow<()> = env.record_diagnostic(|_| no_type_inference(self));

            return false;
        };

        self = this;

        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).is_top(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).is_top(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_top(env),
            Self::Struct(struct_type) => self.with(struct_type).is_top(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).is_top(env),
            Self::Closure(closure_type) => self.with(closure_type).is_top(env),
            Self::Union(union_type) => self.with(union_type).is_top(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).is_top(env),
            Self::Apply(apply) => self.with(apply).is_top(env),
            Self::Generic(generic) => self.with(generic).is_top(env),
            Self::Param(_) | Self::Infer(_) => unreachable!("should've been resolved"),
            Self::Never => false,
            Self::Unknown => true,
        }
    }

    fn is_concrete(mut self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // If the type has already been resolved, substitute the resolved type
        let Some(this) = env.resolve_type(self) else {
            // An unresolved type is never concrete
            return false;
        };

        self = this;

        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).is_concrete(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).is_concrete(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_concrete(env),
            Self::Struct(struct_type) => self.with(struct_type).is_concrete(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).is_concrete(env),
            Self::Closure(closure_type) => self.with(closure_type).is_concrete(env),
            Self::Union(union_type) => self.with(union_type).is_concrete(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).is_concrete(env),
            Self::Apply(apply) => self.with(apply).is_concrete(env),
            Self::Generic(generic) => self.with(generic).is_concrete(env),
            Self::Param(_) | Self::Infer(_) => unreachable!("should've been resolved"),
            Self::Never | Self::Unknown => true,
        }
    }

    fn is_recursive(mut self: Type<'heap, Self>, env: &mut AnalysisEnvironment<'_, 'heap>) -> bool {
        // If the type has already been resolved, substitute the resolved type
        let Some(this) = env.resolve_type(self) else {
            // An unresolved type cannot be recursive
            return false;
        };

        self = this;

        match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).is_recursive(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).is_recursive(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_recursive(env),
            Self::Struct(struct_type) => self.with(struct_type).is_recursive(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).is_recursive(env),
            Self::Union(union_type) => self.with(union_type).is_recursive(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).is_recursive(env),
            Self::Closure(closure_type) => self.with(closure_type).is_recursive(env),
            Self::Apply(apply) => self.with(apply).is_recursive(env),
            Self::Generic(generic) => self.with(generic).is_recursive(env),
            Self::Param(_) | Self::Infer(_) => unreachable!("should've been resolved"),
            Self::Never | Self::Unknown => false,
        }
    }

    fn distribute_union(
        mut self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // If the type has already been resolved, substitute the resolved type
        let Some(this) = env.resolve_type(self) else {
            // We cannot distribute over an unresolved type
            return SmallVec::from_slice_copy(&[self.id]);
        };

        self = this;

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
            Self::Apply(apply_type) => self.with(apply_type).distribute_union(env),
            Self::Generic(generic_type) => self.with(generic_type).distribute_union(env),
            Self::Param(_) | Self::Infer(_) => unreachable!("should've been resolved"),
            Self::Never | Self::Unknown => SmallVec::from_slice_copy(&[self.id]),
        }
    }

    fn distribute_intersection(
        mut self: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 16> {
        // If the type has already been resolved, substitute the resolved type
        let Some(this) = env.resolve_type(self) else {
            // We cannot distribute over an unresolved type
            return SmallVec::from_slice_copy(&[self.id]);
        };

        self = this;

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
            Self::Apply(apply_type) => self.with(apply_type).distribute_intersection(env),
            Self::Generic(generic_type) => self.with(generic_type).distribute_intersection(env),
            Self::Param(_) | Self::Infer(_) => unreachable!("should've been resolved"),
            Self::Never | Self::Unknown => SmallVec::from_slice_copy(&[self.id]),
        }
    }

    #[expect(clippy::too_many_lines)]
    fn is_equivalent(
        mut self: Type<'heap, Self>,
        mut other: Type<'heap, Self>,
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let Some(resolved) = env.resolve_type(self) else {
            let _: ControlFlow<()> = env.record_diagnostic(|_| no_type_inference(self));

            return false;
        };

        self = resolved;

        let Some(resolved) = env.resolve_type(other) else {
            let _: ControlFlow<()> = env.record_diagnostic(|_| no_type_inference(other));

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
            (Self::Infer(_), _) | (_, Self::Infer(_)) => {
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

            // Apply ≡ _
            (Self::Apply(lhs), Self::Apply(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Apply(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_),
            ) => return env.is_equivalent(lhs.base, other.id),
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_),
                Self::Apply(rhs),
            ) => return env.is_equivalent(self.id, rhs.base),

            // Generic ≡ _
            (Self::Generic(lhs), Self::Generic(rhs)) => {
                return self.with(lhs).is_equivalent(other.with(rhs), env);
            }
            (
                Self::Generic(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Apply(_),
            ) => return env.is_equivalent(lhs.base, other.id),
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Apply(_),
                Self::Generic(rhs),
            ) => return env.is_equivalent(self.id, rhs.base),

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
                    (Self::Opaque(_), _) | (_, Self::Opaque(_)) => {
                        // Special case for opaque types mixed with other types
                        // Opaque types use nominal typing rather than structural typing
                        "Cannot mix nominal types (Opaque) with structural types. Opaque types are \
                         only equivalent to other opaque types of the same name."
                    }
                    (Self::Never, _) | (_, Self::Never) => {
                        "The 'Never' type represents computations that don't return. It's a \
                         subtype of all types but no type is a subtype of it (except itself)."
                    }
                    (Self::Unknown, _) | (_, Self::Unknown) => {
                        "The 'Unknown' type represents an unresolved or ambiguous type. It's a \
                         supertype of all types but not a subtype of any type (except itself)."
                    }
                    (Self::Primitive(_), _) | (_, Self::Primitive(_)) => {
                        "Primitive types cannot be equivalent to non-primitive types. Primitives \
                         represent atomic values that are fundamentally different from composite \
                         types."
                    }
                    (Self::Intrinsic(_), _) | (_, Self::Intrinsic(_)) => {
                        "Intrinsic types cannot be equivalent to non-intrinsic types. They \
                         represent special language constructs with unique behavior."
                    }
                    (Self::Struct(_), _) | (_, Self::Struct(_)) => {
                        "Struct types cannot be equivalent to non-struct types. Consider using \
                         type conversions or creating wrapper types if you need interoperability."
                    }
                    (Self::Tuple(_), _) | (_, Self::Tuple(_)) => {
                        "Tuple types cannot be equivalent to non-tuple types. Consider \
                         destructuring and reconstructing if you need to convert between different \
                         collection types."
                    }
                    (Self::Closure(_), _) | (_, Self::Closure(_)) => {
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
        env: &mut AnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        let Some(resolved) = env.resolve_type(self) else {
            let _: ControlFlow<()> = env.record_diagnostic(|_| no_type_inference(self));

            return false;
        };

        self = resolved;

        let Some(resolved) = env.resolve_type(supertype) else {
            let _: ControlFlow<()> = env.record_diagnostic(|_| no_type_inference(supertype));

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
            (Self::Infer(_), _) | (_, Self::Infer(_)) => {
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

            // Apply <: _
            (Self::Apply(lhs), Self::Apply(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Apply(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_),
            ) => return env.is_subtype_of(Variance::Covariant, lhs.base, supertype.id),
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_),
                Self::Apply(rhs),
            ) => return env.is_subtype_of(Variance::Covariant, self.id, rhs.base),

            // Generic <: _
            (Self::Generic(lhs), Self::Generic(rhs)) => {
                return self.with(lhs).is_subtype_of(supertype.with(rhs), env);
            }
            (
                Self::Generic(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Apply(_),
            ) => return env.is_subtype_of(Variance::Covariant, lhs.base, supertype.id),
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Apply(_),
                Self::Generic(rhs),
            ) => return env.is_subtype_of(Variance::Covariant, self.id, rhs.base),

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
                    (Self::Opaque(_), _) | (_, Self::Opaque(_)) => {
                        // Special case for opaque types mixed with other types
                        // Opaque types use nominal typing rather than structural typing
                        "Cannot mix nominal types (Opaque) with structural types. Opaque types are \
                         only subtypes of other opaque types of the same name."
                    }
                    (Self::Never, _) | (_, Self::Never) => {
                        "The 'Never' type represents computations that don't return. It's a \
                         subtype of all types but no type is a subtype of it (except itself)."
                    }
                    (Self::Unknown, _) | (_, Self::Unknown) => {
                        "The 'Unknown' type represents an unresolved or ambiguous type. It's a \
                         supertype of all types but not a subtype of any type (except itself)."
                    }
                    (Self::Primitive(_), _) => {
                        "Primitive types cannot be subtypes of non-primitive types. The type \
                         system uses nominal typing for primitives rather than structural \
                         relationships."
                    }
                    (Self::Struct(_), _) => {
                        "Struct types cannot be subtypes of non-struct types. Subtyping for \
                         structs is based on field compatibility, which doesn't apply across \
                         different type categories."
                    }
                    (Self::Closure(_), _) => {
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
        if let Some(substitution) = env.resolve_substitution(self) {
            // We have a substitution available. Unlike other operations (which are
            // non-destructive), we need to ensure that no-one is referencing the original type
            // (which we're simplifying). This is only required if the type is *recursive* and this
            // type is used during the recursion.
            let (guard, id) = env.provision(self.id);

            let inner = env.simplify(substitution);
            if guard.is_used() {
                // We cannot safely simplify this type, because the inner references it. To
                // be able to close the type, we issue an empty generic type.
                return env.intern_provisioned(
                    id,
                    PartialType {
                        span: self.span,
                        kind: env.intern_kind(TypeKind::Generic(Generic {
                            base: inner,
                            arguments: env.intern_generic_arguments(&mut []),
                        })),
                    },
                );
            }

            return inner;
        }

        // By running bottom/top checks *after* the per‐kind passes, we guarantee that
        // self‐referential intersections and coinductive unions get properly collapsed before we
        // ever declare a type `Never` or `Unknown`.
        let simplified = match self.kind {
            Self::Opaque(opaque_type) => self.with(opaque_type).simplify(env),
            Self::Primitive(primitive_type) => self.with(primitive_type).simplify(env),
            Self::Intrinsic(intrinsic_type) => self.with(intrinsic_type).simplify(env),
            Self::Struct(struct_type) => self.with(struct_type).simplify(env),
            Self::Tuple(tuple_type) => self.with(tuple_type).simplify(env),
            Self::Closure(closure_type) => self.with(closure_type).simplify(env),
            Self::Union(union_type) => self.with(union_type).simplify(env),
            Self::Intersection(intersection_type) => self.with(intersection_type).simplify(env),
            Self::Apply(apply_type) => self.with(apply_type).simplify(env),
            Self::Generic(generic_type) => self.with(generic_type).simplify(env),
            Self::Param(_) | Self::Infer(_) | Self::Never | Self::Unknown => self.id,
        };

        if env.is_bottom(simplified) {
            return env.intern_type(PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Never),
            });
        }

        if env.is_top(simplified) {
            return env.intern_type(PartialType {
                span: self.span,
                kind: env.intern_kind(TypeKind::Unknown),
            });
        }

        simplified
    }
}

impl<'heap> Inference<'heap> for TypeKind<'heap> {
    #[expect(clippy::too_many_lines)]
    fn collect_constraints(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut InferenceEnvironment<'_, 'heap>,
    ) {
        #[expect(clippy::match_same_arms)]
        match (self.kind, supertype.kind) {
            // Infer <: Infer
            (&Self::Infer(Infer { hole: self_id }), &Self::Infer(Infer { hole: supertype_id })) => {
                env.add_constraint(Constraint::Ordering {
                    lower: Variable {
                        span: self.span,
                        kind: VariableKind::Hole(self_id),
                    },
                    upper: Variable {
                        span: supertype.span,
                        kind: VariableKind::Hole(supertype_id),
                    },
                });
            }

            // Param <: Param
            (&Self::Param(Param { argument: left }), &Self::Param(Param { argument: right })) => {
                env.add_constraint(Constraint::Ordering {
                    lower: Variable {
                        span: self.span,
                        kind: VariableKind::Generic(left),
                    },
                    upper: Variable {
                        span: supertype.span,
                        kind: VariableKind::Generic(right),
                    },
                });
            }

            // Infer <: Param
            (&Self::Infer(Infer { hole: self_id }), &Self::Param(Param { argument })) => {
                env.add_constraint(Constraint::Ordering {
                    lower: Variable {
                        span: self.span,
                        kind: VariableKind::Hole(self_id),
                    },
                    upper: Variable {
                        span: supertype.span,
                        kind: VariableKind::Generic(argument),
                    },
                });
            }

            // Param <: Infer
            (&Self::Param(Param { argument }), &Self::Infer(Infer { hole: supertype_id })) => {
                env.add_constraint(Constraint::Ordering {
                    lower: Variable {
                        span: self.span,
                        kind: VariableKind::Generic(argument),
                    },
                    upper: Variable {
                        span: supertype.span,
                        kind: VariableKind::Hole(supertype_id),
                    },
                });
            }

            // Opaque <: _
            (Self::Opaque(lhs), Self::Opaque(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Opaque(_),
                Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
            ) => {}

            // Primitive <: _
            (Self::Primitive(lhs), Self::Primitive(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Primitive(_),
                Self::Opaque(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
            ) => {}

            // Intrinsic <: _
            (Self::Intrinsic(lhs), Self::Intrinsic(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Intrinsic(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
            ) => {}

            // Struct <: _
            (Self::Struct(lhs), Self::Struct(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Struct(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
            ) => {}

            // Tuple <: _
            (Self::Tuple(lhs), Self::Tuple(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Tuple(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
            ) => {}

            // Closure <: _
            (Self::Closure(lhs), Self::Closure(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Closure(_),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Never
                | Self::Unknown,
            ) => {}

            // Apply <: _
            (Self::Apply(lhs), Self::Apply(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Apply(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Infer(_)
                | Self::Param(_)
                | Self::Never
                | Self::Unknown,
            ) => {
                lhs.collect_substitution_constraints(self.span, env);
                env.collect_constraints(Variance::Covariant, lhs.base, supertype.id);
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Infer(_)
                | Self::Param(_)
                | Self::Never
                | Self::Unknown,
                Self::Apply(rhs),
            ) => {
                rhs.collect_substitution_constraints(supertype.span, env);
                env.collect_constraints(Variance::Covariant, self.id, rhs.base);
            }

            // Generic <: _
            (Self::Generic(lhs), Self::Generic(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Generic(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Apply(_)
                | Self::Infer(_)
                | Self::Param(_)
                | Self::Never
                | Self::Unknown,
            ) => {
                lhs.collect_argument_constraints(self.span, env, false);
                env.collect_constraints(Variance::Covariant, lhs.base, supertype.id);
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Union(_)
                | Self::Intersection(_)
                | Self::Apply(_)
                | Self::Infer(_)
                | Self::Param(_)
                | Self::Never
                | Self::Unknown,
                Self::Generic(rhs),
            ) => {
                rhs.collect_argument_constraints(supertype.span, env, false);
                env.collect_constraints(Variance::Covariant, self.id, rhs.base);
            }

            // Union <: _
            (Self::Union(lhs), Self::Union(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Union(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_)
                | Self::Infer(_)
                | Self::Param(_)
                | Self::Never
                | Self::Unknown,
            ) => {
                let self_variants = self.with(lhs).unnest(env);
                let super_variants = [supertype.id];

                UnionType::collect_constraints_variants(
                    self.id,
                    supertype.id,
                    supertype.span,
                    &self_variants,
                    &super_variants,
                    env,
                );
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Intersection(_)
                | Self::Infer(_)
                | Self::Param(_)
                | Self::Never
                | Self::Unknown,
                Self::Union(rhs),
            ) => {
                let self_variants = [self.id];
                let super_variants = supertype.with(rhs).unnest(env);

                UnionType::collect_constraints_variants(
                    self.id,
                    supertype.id,
                    supertype.span,
                    &self_variants,
                    &super_variants,
                    env,
                );
            }

            // Intersection <: _
            (Self::Intersection(lhs), Self::Intersection(rhs)) => {
                self.with(lhs).collect_constraints(supertype.with(rhs), env);
            }
            (
                Self::Intersection(lhs),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Infer(_)
                | Self::Param(_)
                | Self::Never
                | Self::Unknown,
            ) => {
                let self_variants = self.with(lhs).unnest(env);
                let super_variants = [supertype.id];

                IntersectionType::collect_constraints_variants(
                    self.span,
                    supertype.span,
                    &self_variants,
                    &super_variants,
                    env,
                );
            }
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Infer(_)
                | Self::Param(_)
                | Self::Never
                | Self::Unknown,
                Self::Intersection(rhs),
            ) => {
                let self_variants = [self.id];
                let super_variants = supertype.with(rhs).unnest(env);

                IntersectionType::collect_constraints_variants(
                    self.span,
                    supertype.span,
                    &self_variants,
                    &super_variants,
                    env,
                );
            }

            // Infer <: _
            (
                &Self::Infer(Infer { hole: self_id }),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
            ) => {
                let variable = Variable {
                    span: self.span,
                    kind: VariableKind::Hole(self_id),
                };

                env.add_constraint(Constraint::UpperBound {
                    variable,
                    bound: supertype.id,
                });

                env.collect_dependencies(supertype.id, variable);
            }

            // _ <: Infer
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
                &Self::Infer(Infer { hole: supertype_id }),
            ) => {
                let variable = Variable {
                    span: supertype.span,
                    kind: VariableKind::Hole(supertype_id),
                };

                env.add_constraint(Constraint::LowerBound {
                    variable,
                    bound: self.id,
                });

                env.collect_dependencies(self.id, variable);
            }

            // Param <: _
            (
                &Self::Param(Param { argument }),
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
            ) => {
                let variable = Variable {
                    span: self.span,
                    kind: VariableKind::Generic(argument),
                };

                env.add_constraint(Constraint::UpperBound {
                    variable,
                    bound: supertype.id,
                });

                env.collect_dependencies(supertype.id, variable);
            }

            // _ <: Param
            (
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
                &Self::Param(Param { argument }),
            ) => {
                let variable = Variable {
                    span: supertype.span,
                    kind: VariableKind::Generic(argument),
                };

                env.add_constraint(Constraint::LowerBound {
                    variable,
                    bound: self.id,
                });

                env.collect_dependencies(self.id, variable);
            }

            // `Never <: _`
            // `Unknown <: _`
            (
                Self::Never | Self::Unknown,
                Self::Opaque(_)
                | Self::Primitive(_)
                | Self::Intrinsic(_)
                | Self::Struct(_)
                | Self::Tuple(_)
                | Self::Closure(_)
                | Self::Never
                | Self::Unknown,
            ) => {}
        }
    }

    /// Instantiates a type by replacing type parameters with their corresponding arguments.
    ///
    /// This function handles different type kinds according to their specific instantiation rules:
    /// - Most structured types (Opaque, Primitive, Struct, etc.) delegate to their specific
    ///   implementations.
    /// - Type parameters (`Param`) are replaced with their corresponding arguments from the
    ///   environment.
    /// - Inference variables, `Never`, and `Unknown` types are left unchanged.
    ///
    /// # Type instantiation semantics
    ///
    /// Instantiation of a polymorphic type scheme `σ = ∀α̅. τ` (in the style of Algorithm W
    /// as found in ML, OCaml, Haskell, Rust, and HashQL) replaces **only** the universally
    /// quantified parameters `α̅` with fresh unification variables. All other inference‐variable
    /// "holes" in `τ` remain unchanged, ensuring that only the bound type parameters are
    /// freshly instantiated.
    ///
    /// (Only the ∀-bound type parameters are replaced.)
    fn instantiate(self: Type<'heap, Self>, env: &mut InstantiateEnvironment<'_, 'heap>) -> TypeId {
        match self.kind {
            Self::Opaque(opaque) => self.with(opaque).instantiate(env),
            Self::Primitive(primitive) => self.with(primitive).instantiate(env),
            Self::Intrinsic(intrinsic) => self.with(intrinsic).instantiate(env),
            Self::Struct(r#struct) => self.with(r#struct).instantiate(env),
            Self::Tuple(tuple) => self.with(tuple).instantiate(env),
            Self::Union(union) => self.with(union).instantiate(env),
            Self::Intersection(intersection) => self.with(intersection).instantiate(env),
            Self::Closure(closure) => self.with(closure).instantiate(env),
            Self::Apply(apply) => self.with(apply).instantiate(env),
            Self::Generic(generic) => self.with(generic).instantiate(env),
            &Self::Param(Param { argument }) => {
                if let Some(argument) = env.lookup_argument(argument) {
                    env.intern_type(PartialType {
                        span: self.span,
                        kind: env.intern_kind(Self::Param(Param { argument })),
                    })
                } else {
                    env.record_diagnostic(type_parameter_not_found(self, argument));
                    self.id
                }
            }
            Self::Infer(_) | Self::Never | Self::Unknown => self.id,
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
