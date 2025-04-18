// pub mod closure;
// pub mod generic_argument;
// pub mod intersection;
// pub mod intrinsic;
// pub mod opaque;
pub mod primitive;
// pub mod r#struct;
pub mod generic_argument;
pub mod intersection;
#[cfg(test)]
pub(crate) mod test;
pub mod tuple;
pub mod union;
// pub mod union;

use core::ops::ControlFlow;

use pretty::RcDoc;
use smallvec::SmallVec;

use self::{
    intersection::IntersectionType, primitive::PrimitiveType, tuple::TupleType, union::UnionType,
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
    // Opaque(OpaqueType),
    Primitive(PrimitiveType),
    // Intrinsic(IntrinsicType),

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
    // pub fn opaque(&self) -> Option<&OpaqueType> {
    //     match self {
    //         Self::Opaque(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

    #[must_use]
    pub const fn primitive(&self) -> Option<&PrimitiveType> {
        match self {
            Self::Primitive(r#type) => Some(r#type),
            _ => None,
        }
    }

    // pub fn intrinsic(&self) -> Option<&IntrinsicType> {
    //     match self {
    //         Self::Intrinsic(r#type) => Some(r#type),
    //         _ => None,
    //     }
    // }

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
            TypeKind::Primitive(_)
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

        #[expect(clippy::match_same_arms)]
        match (self.kind, other.kind) {
            // T ∨ Never <=> T
            (_, TypeKind::Never) => SmallVec::from_slice(&[self.id]),
            // Never ∨ T <=> T
            (TypeKind::Never, _) => SmallVec::from_slice(&[other.id]),

            // T ∨ Unknown <=> Unknown
            (_, TypeKind::Unknown) => SmallVec::from_slice(&[other.id]),
            // Unknown ∨ T <=> Unknown
            (TypeKind::Unknown, _) => SmallVec::from_slice(&[self.id]),

            // Infer ∨ _ <=> unreachable!()
            // _ ∨ Infer <=> unreachable!()
            (TypeKind::Infer, _) | (_, TypeKind::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            (TypeKind::Primitive(lhs), TypeKind::Primitive(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (TypeKind::Primitive(_), TypeKind::Tuple(_)) => {
                SmallVec::from_slice(&[self.id, other.id])
            }

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (TypeKind::Tuple(_), TypeKind::Primitive(_)) => {
                SmallVec::from_slice(&[self.id, other.id])
            }

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.with(lhs).join(other.with(rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::join_variants(&lhs_variants, &rhs_variants)
            }
            (
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
                TypeKind::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::join_variants(&lhs_variants, &rhs_variants)
            }

            (TypeKind::Intersection(lhs), TypeKind::Intersection(rhs)) => {
                self.map(|_| lhs).join(other.map(|_| rhs), env)
            }
            (TypeKind::Intersection(lhs), TypeKind::Primitive(_) | TypeKind::Tuple(_)) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                IntersectionType::join_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (TypeKind::Primitive(_) | TypeKind::Tuple(_), TypeKind::Intersection(rhs)) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                IntersectionType::join_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
        }
    }

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

        #[expect(clippy::match_same_arms)]
        match (self.kind, other.kind) {
            // T ∧ Never <=> Never
            (_, TypeKind::Never) => SmallVec::from_slice(&[other.id]),
            // Never ∧ T <=> Never
            (TypeKind::Never, _) => SmallVec::from_slice(&[self.id]),

            // T ∧ Unknown <=> T
            (_, TypeKind::Unknown) => SmallVec::from_slice(&[self.id]),
            // Unknown ∧ T <=> T
            (TypeKind::Unknown, _) => SmallVec::from_slice(&[other.id]),

            // Infer ∨ _ <=> unreachable!()
            // _ ∨ Infer <=> unreachable!()
            (TypeKind::Infer, _) | (_, TypeKind::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            (TypeKind::Primitive(lhs), TypeKind::Primitive(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (TypeKind::Primitive(_), TypeKind::Tuple(_)) => SmallVec::new(),

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (TypeKind::Tuple(_), TypeKind::Primitive(_)) => SmallVec::new(),

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
                TypeKind::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }

            (TypeKind::Intersection(lhs), TypeKind::Intersection(rhs)) => {
                self.with(lhs).meet(other.with(rhs), env)
            }
            (TypeKind::Intersection(lhs), TypeKind::Primitive(_) | TypeKind::Tuple(_)) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                IntersectionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
            (TypeKind::Primitive(_) | TypeKind::Tuple(_), TypeKind::Intersection(rhs)) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                IntersectionType::meet_variants(self.span, &lhs_variants, &rhs_variants, env)
            }
        }
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            TypeKind::Primitive(primitive_type) => self.with(primitive_type).is_bottom(env),
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
            TypeKind::Primitive(primitive_type) => self.with(primitive_type).is_top(env),
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

            (TypeKind::Unknown, TypeKind::Unknown) => true,
            (TypeKind::Unknown, _) => env.is_top(other.id),
            (_, TypeKind::Unknown) => env.is_top(self.id),

            (TypeKind::Primitive(lhs), TypeKind::Primitive(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (TypeKind::Primitive(_), TypeKind::Tuple(_)) => false,

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (TypeKind::Tuple(_), TypeKind::Primitive(_)) => false,

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
            }
            (
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
                TypeKind::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::is_equivalent_variants(self, other, &lhs_variants, &rhs_variants, env)
            }

            (TypeKind::Intersection(lhs), TypeKind::Intersection(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (TypeKind::Intersection(lhs), TypeKind::Primitive(_) | TypeKind::Tuple(_)) => {
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
            (TypeKind::Primitive(_) | TypeKind::Tuple(_), TypeKind::Intersection(rhs)) => {
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

        #[expect(clippy::match_same_arms)]
        match (self.kind, supertype.kind) {
            // Infer <: _ <=> unreachable!()
            // _ <: Infer <=> unreachable!()
            (TypeKind::Infer, _) | (_, TypeKind::Infer) => {
                unreachable!("infer should've been resolved prior to this")
            }

            // `Never <: _`
            (TypeKind::Never, _) => true,
            // `_ <: Never` is invalid
            (_, TypeKind::Never) => false,
            // `_ <: Unknown`
            (_, TypeKind::Unknown) => true,
            // `Unknown <: _` is invalid
            (TypeKind::Unknown, _) => false,

            (TypeKind::Primitive(lhs), TypeKind::Primitive(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (TypeKind::Primitive(_), TypeKind::Tuple(_)) => false,

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (TypeKind::Tuple(_), TypeKind::Primitive(_)) => false,

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
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
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
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
            (TypeKind::Intersection(lhs), TypeKind::Primitive(_) | TypeKind::Tuple(_)) => {
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
            (TypeKind::Primitive(_) | TypeKind::Tuple(_), TypeKind::Intersection(rhs)) => {
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
            TypeKind::Primitive(primitive_type) => self.with(primitive_type).simplify(env),
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
            Self::Primitive(primitive_type) => primitive_type.pretty(env, limit),
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
