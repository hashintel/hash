pub mod generic_argument;
pub mod intersection;
pub mod intrinsic;
pub mod opaque;
pub mod primitive;
#[cfg(test)]
pub(crate) mod test;
pub mod tuple;
pub mod union;

use core::{ops::ControlFlow, ptr};

use pretty::RcDoc;
use smallvec::SmallVec;

use self::{
    intersection::IntersectionType, intrinsic::IntrinsicType, opaque::OpaqueType,
    primitive::PrimitiveType, tuple::TupleType, union::UnionType,
};
use super::{
    Type, TypeId,
    environment::{Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment},
    error::no_type_inference,
    lattice::Lattice,
    pretty_print::{CYAN, GRAY, PrettyPrint},
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TypeKind<'heap> {
    Opaque(OpaqueType<'heap>),
    Primitive(PrimitiveType),
    Intrinsic(IntrinsicType),

    // Struct(StructType),
    Tuple(TupleType<'heap>),

    Union(UnionType<'heap>),
    Intersection(IntersectionType<'heap>),

    // Closure(ClosureType),

    // Param(Param),
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

    // pub fn r#struct(&self) -> Option<&StructType> {
    //     match self {
    //         Self::Struct(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

    #[must_use]
    pub const fn tuple(&self) -> Option<&TupleType> {
        match self {
            Self::Tuple(r#type) => Some(r#type),
            _ => None,
        }
    }

    // pub fn closure(&self) -> Option<&ClosureType> {
    //     match self {
    //         Self::Closure(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

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

    // pub fn param(&self) -> Option<&Param> {
    //     match self {
    //         Self::Param(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

    pub fn resolve(self: Type<'heap, Self>, env: &Environment<'heap>) -> Option<Type<'heap, Self>> {
        match self.kind {
            TypeKind::Opaque(_)
            | TypeKind::Primitive(_)
            | TypeKind::Intrinsic(_)
            | TypeKind::Tuple(_)
            | TypeKind::Union(_)
            | TypeKind::Intersection(_)
            | TypeKind::Never
            | TypeKind::Unknown => Some(self),
            TypeKind::Infer => {
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
            env.diagnostics.push(no_type_inference(env, self));

            return SmallVec::new();
        };

        self = resolved;

        let Some(resolved) = other.resolve(env) else {
            env.diagnostics.push(no_type_inference(env, other));

            return SmallVec::new();
        };

        other = resolved;

        // Short circuit if the types are the same (this can be done via pointer comparison as the
        // types are interned)
        if ptr::eq(self.kind, other.kind) {
            return SmallVec::from_slice(&[self.id]);
        }

        #[expect(clippy::match_same_arms)]
        match (self.kind, other.kind) {
            // T ∨ Never <=> T
            (_, TypeKind::Never) => SmallVec::from_slice(&[self.id]),
            // Never ∨ T <=> T
            (TypeKind::Never, _) => SmallVec::from_slice(&[other.id]),
            // T ∨ Never <=> T (slow)
            (_, _) if env.is_bottom(other.id) => SmallVec::from_slice(&[self.id]),
            // Never ∨ T <=> T (slow)
            (_, _) if env.is_bottom(self.id) => SmallVec::from_slice(&[other.id]),

            // T ∨ Unknown <=> Unknown
            (_, TypeKind::Unknown) => SmallVec::from_slice(&[other.id]),
            // Unknown ∨ T <=> Unknown
            (TypeKind::Unknown, _) => SmallVec::from_slice(&[self.id]),
            // T ∨ Unknown <=> Unknown (slow)
            (_, _) if env.is_top(other.id) => SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: other.span,
                kind: env.intern_kind(TypeKind::Unknown),
            })]),
            // Unknown ∨ T <=> Unknown (slow)
            (_, _) if env.is_top(self.id) => SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: other.span,
                kind: env.intern_kind(TypeKind::Unknown),
            })]),

            // Infer ∨ _ <=> unreachable!()
            // _ ∨ Infer <=> unreachable!()
            (TypeKind::Infer, _) | (_, TypeKind::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            (TypeKind::Opaque(lhs), TypeKind::Opaque(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (
                TypeKind::Opaque(_),
                TypeKind::Primitive(_) | TypeKind::Intrinsic(_) | TypeKind::Tuple(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            (TypeKind::Primitive(lhs), TypeKind::Primitive(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (
                TypeKind::Primitive(_),
                TypeKind::Opaque(_) | TypeKind::Intrinsic(_) | TypeKind::Tuple(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            (TypeKind::Intrinsic(lhs), TypeKind::Intrinsic(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (
                TypeKind::Intrinsic(_),
                TypeKind::Opaque(_) | TypeKind::Primitive(_) | TypeKind::Tuple(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (
                TypeKind::Tuple(_),
                TypeKind::Opaque(_) | TypeKind::Primitive(_) | TypeKind::Intrinsic(_),
            ) => SmallVec::from_slice(&[self.id, other.id]),

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::join_variants(&lhs_variants, &rhs_variants, env)
            }
            (
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_),
                TypeKind::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::join_variants(&lhs_variants, &rhs_variants, env)
            }

            (TypeKind::Intersection(lhs), TypeKind::Intersection(rhs)) => {
                self.map(|_| lhs).join(other.map(|_| rhs), env)
            }
            (
                TypeKind::Intersection(lhs),
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                IntersectionType::join_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_),
                TypeKind::Intersection(rhs),
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
            env.diagnostics.push(no_type_inference(env, self));

            return SmallVec::new();
        };

        self = resolved;

        let Some(resolved) = other.resolve(env) else {
            env.diagnostics.push(no_type_inference(env, other));

            return SmallVec::new();
        };

        other = resolved;

        // Short circuit if the types are the same (this can be done via pointer comparison as the
        // types are interned)
        if ptr::eq(self.kind, other.kind) {
            return SmallVec::from_slice(&[self.id]);
        }

        #[expect(clippy::match_same_arms)]
        match (self.kind, other.kind) {
            // T ∧ Never <=> Never
            (_, TypeKind::Never) => SmallVec::from_slice(&[other.id]),
            // Never ∧ T <=> Never
            (TypeKind::Never, _) => SmallVec::from_slice(&[self.id]),
            // T ∧ Never <=> Never (slow)
            (_, _) if env.is_bottom(other.id) => SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: other.span,
                kind: env.intern_kind(TypeKind::Never),
            })]),
            // Never ∧ T <=> Never (slow)
            (_, _) if env.is_bottom(self.id) => SmallVec::from_slice(&[env.alloc(|id| Type {
                id,
                span: self.span,
                kind: env.intern_kind(TypeKind::Never),
            })]),

            // T ∧ Unknown <=> T
            (_, TypeKind::Unknown) => SmallVec::from_slice(&[self.id]),
            // Unknown ∧ T <=> T
            (TypeKind::Unknown, _) => SmallVec::from_slice(&[other.id]),
            // T ∧ Unknown <=> T (slow)
            (_, _) if env.is_top(other.id) => SmallVec::from_slice(&[self.id]),
            // Unknown ∧ T <=> T (slow)
            (_, _) if env.is_top(self.id) => SmallVec::from_slice(&[other.id]),

            // Infer ∨ _ <=> unreachable!()
            // _ ∨ Infer <=> unreachable!()
            (TypeKind::Infer, _) | (_, TypeKind::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            (TypeKind::Opaque(lhs), TypeKind::Opaque(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                TypeKind::Opaque(_),
                TypeKind::Primitive(_) | TypeKind::Intrinsic(_) | TypeKind::Tuple(_),
            ) => SmallVec::new(),

            (TypeKind::Primitive(lhs), TypeKind::Primitive(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                TypeKind::Primitive(_),
                TypeKind::Opaque(_) | TypeKind::Intrinsic(_) | TypeKind::Tuple(_),
            ) => SmallVec::new(),

            (TypeKind::Intrinsic(lhs), TypeKind::Intrinsic(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                TypeKind::Intrinsic(_),
                TypeKind::Opaque(_) | TypeKind::Primitive(_) | TypeKind::Tuple(_),
            ) => SmallVec::new(),

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                TypeKind::Tuple(_),
                TypeKind::Opaque(_) | TypeKind::Primitive(_) | TypeKind::Intrinsic(_),
            ) => SmallVec::new(),

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_),
                TypeKind::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }

            (TypeKind::Intersection(lhs), TypeKind::Intersection(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                TypeKind::Intersection(lhs),
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                IntersectionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_),
                TypeKind::Intersection(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                IntersectionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
        }
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            TypeKind::Opaque(opaque_type) => self.with(opaque_type).is_bottom(env),
            TypeKind::Primitive(primitive_type) => self.with(primitive_type).is_bottom(env),
            TypeKind::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_bottom(env),
            TypeKind::Tuple(tuple_type) => self.with(tuple_type).is_bottom(env),
            TypeKind::Union(union_type) => self.with(union_type).is_bottom(env),
            TypeKind::Intersection(intersection_type) => {
                self.with(intersection_type).is_bottom(env)
            }
            TypeKind::Never => true,
            TypeKind::Unknown => false,
            TypeKind::Infer => {
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
            TypeKind::Opaque(opaque_type) => self.with(opaque_type).is_top(env),
            TypeKind::Primitive(primitive_type) => self.with(primitive_type).is_top(env),
            TypeKind::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_top(env),
            TypeKind::Tuple(tuple_type) => self.with(tuple_type).is_top(env),
            TypeKind::Union(union_type) => self.with(union_type).is_top(env),
            TypeKind::Intersection(intersection_type) => self.with(intersection_type).is_top(env),
            TypeKind::Never => false,
            TypeKind::Unknown => true,
            TypeKind::Infer => {
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
            TypeKind::Opaque(opaque_type) => self.with(opaque_type).is_concrete(env),
            TypeKind::Primitive(primitive_type) => self.with(primitive_type).is_concrete(env),
            TypeKind::Intrinsic(intrinsic_type) => self.with(intrinsic_type).is_concrete(env),
            TypeKind::Tuple(tuple_type) => self.with(tuple_type).is_concrete(env),
            TypeKind::Union(union_type) => self.with(union_type).is_concrete(env),
            TypeKind::Intersection(intersection_type) => {
                self.with(intersection_type).is_concrete(env)
            }
            TypeKind::Never | TypeKind::Unknown => true,
            TypeKind::Infer => env.substitution.infer(self.id).is_some(),
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

        #[expect(clippy::match_same_arms)]
        match (self.kind, other.kind) {
            // Infer == _ <=> unreachable!()
            // _ == Infer <=> unreachable!()
            (TypeKind::Infer, _) | (_, TypeKind::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            (TypeKind::Never, TypeKind::Never) => true,
            (TypeKind::Never, _) => env.is_bottom(other.id),
            (_, TypeKind::Never) => env.is_bottom(self.id),
            (_, _) if env.is_bottom(self.id) && env.is_bottom(other.id) => true,

            (TypeKind::Unknown, TypeKind::Unknown) => true,
            (TypeKind::Unknown, _) => env.is_top(other.id),
            (_, TypeKind::Unknown) => env.is_top(self.id),
            (_, _) if env.is_top(self.id) && env.is_top(other.id) => true,

            (TypeKind::Opaque(lhs), TypeKind::Opaque(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (
                TypeKind::Opaque(_),
                TypeKind::Primitive(_) | TypeKind::Intrinsic(_) | TypeKind::Tuple(_),
            ) => false,

            (TypeKind::Primitive(lhs), TypeKind::Primitive(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (
                TypeKind::Primitive(_),
                TypeKind::Opaque(_) | TypeKind::Intrinsic(_) | TypeKind::Tuple(_),
            ) => false,

            (TypeKind::Intrinsic(lhs), TypeKind::Intrinsic(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (
                TypeKind::Intrinsic(_),
                TypeKind::Opaque(_) | TypeKind::Primitive(_) | TypeKind::Tuple(_),
            ) => false,

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (
                TypeKind::Tuple(_),
                TypeKind::Opaque(_) | TypeKind::Primitive(_) | TypeKind::Intrinsic(_),
            ) => false,

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
            }
            (
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_),
                TypeKind::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
            }

            (TypeKind::Intersection(lhs), TypeKind::Intersection(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (
                TypeKind::Intersection(lhs),
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                IntersectionType::is_equivalent_variants(
                    self,
                    other,
                    &lhs_variants,
                    &rhs_variants,
                    env,
                )
            }
            (
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_),
                TypeKind::Intersection(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                IntersectionType::is_equivalent_variants(
                    self,
                    other,
                    &lhs_variants,
                    &rhs_variants,
                    env,
                )
            }
        }
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

        #[expect(clippy::match_same_arms)]
        match (self.kind, supertype.kind) {
            // Infer <: _ <=> unreachable!()
            // _ <: Infer <=> unreachable!()
            (TypeKind::Infer, _) | (_, TypeKind::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            // `Never <: _`
            (TypeKind::Never, _) => true,
            // `_ ≮: Never`
            (_, TypeKind::Never) => false,
            // `Never <: _` (slow)
            (_, _) if env.is_bottom(self.id) => true,
            // `_ ≮: Never` (slow)
            (_, _) if env.is_bottom(supertype.id) => false,

            // `_ <: Unknown`
            (_, TypeKind::Unknown) => true,
            // `Unknown ≮: _`
            (TypeKind::Unknown, _) => false,
            // `_ <: Unknown` (slow)
            (_, _) if env.is_top(supertype.id) => true,
            // `Unknown ≮: _` (slow)
            (_, _) if env.is_top(self.id) => false,

            (TypeKind::Opaque(lhs), TypeKind::Opaque(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (
                TypeKind::Opaque(_),
                TypeKind::Primitive(_) | TypeKind::Intrinsic(_) | TypeKind::Tuple(_),
            ) => false,

            (TypeKind::Primitive(lhs), TypeKind::Primitive(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (
                TypeKind::Primitive(_),
                TypeKind::Opaque(_) | TypeKind::Intrinsic(_) | TypeKind::Tuple(_),
            ) => false,

            (TypeKind::Intrinsic(lhs), TypeKind::Intrinsic(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (
                TypeKind::Intrinsic(_),
                TypeKind::Opaque(_) | TypeKind::Primitive(_) | TypeKind::Tuple(_),
            ) => false,

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (
                TypeKind::Tuple(_),
                TypeKind::Opaque(_) | TypeKind::Primitive(_) | TypeKind::Intrinsic(_),
            ) => false,

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_),
            ) => {
                let self_variants = lhs.unnest(env);
                let super_variants = [supertype.id];

                UnionType::is_subtype_of_variants(
                    self,
                    supertype,
                    &self_variants,
                    &super_variants,
                    env,
                )
            }
            (
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_)
                | TypeKind::Intersection(_),
                TypeKind::Union(rhs),
            ) => {
                let self_variants = [self.id];
                let super_variants = rhs.unnest(env);

                UnionType::is_subtype_of_variants(
                    self,
                    supertype,
                    &self_variants,
                    &super_variants,
                    env,
                )
            }

            (TypeKind::Intersection(lhs), TypeKind::Intersection(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (
                TypeKind::Intersection(lhs),
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_),
            ) => {
                let self_variants = lhs.unnest(env);
                let super_variants = [supertype.id];

                IntersectionType::is_subtype_of_variants(
                    self,
                    supertype,
                    &self_variants,
                    &super_variants,
                    env,
                )
            }
            (
                TypeKind::Opaque(_)
                | TypeKind::Primitive(_)
                | TypeKind::Intrinsic(_)
                | TypeKind::Tuple(_),
                TypeKind::Intersection(rhs),
            ) => {
                let self_variants = [self.id];
                let super_variants = rhs.unnest(env);

                IntersectionType::is_subtype_of_variants(
                    self,
                    supertype,
                    &self_variants,
                    &super_variants,
                    env,
                )
            }
        }
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
            TypeKind::Opaque(opaque_type) => self.with(opaque_type).simplify(env),
            TypeKind::Primitive(primitive_type) => self.with(primitive_type).simplify(env),
            TypeKind::Intrinsic(intrinsic_type) => self.with(intrinsic_type).simplify(env),
            TypeKind::Tuple(tuple_type) => self.with(tuple_type).simplify(env),
            TypeKind::Union(union_type) => self.with(union_type).simplify(env),
            TypeKind::Intersection(intersection_type) => self.with(intersection_type).simplify(env),
            TypeKind::Never | TypeKind::Unknown | TypeKind::Infer => self.id,
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
            Self::Tuple(tuple_type) => tuple_type.pretty(env, limit),
            Self::Union(union_type) => union_type.pretty(env, limit),
            Self::Intersection(intersection_type) => intersection_type.pretty(env, limit),
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
