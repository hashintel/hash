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
    pretty_print::PrettyPrint,
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

impl TypeKind<'_> {
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
}

impl<'heap> Lattice<'heap> for TypeKind<'heap> {
    fn join(
        mut self: Type<'heap, Self>,
        mut other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        if *self.kind == TypeKind::Infer {
            let Some(infer) = env.substitution.infer(self.id) else {
                env.diagnostics.push(no_type_inference(env, self));

                return SmallVec::new();
            };

            self = env.types[infer].copied();
        }

        if *other.kind == TypeKind::Infer {
            let Some(infer) = env.substitution.infer(other.id) else {
                env.diagnostics.push(no_type_inference(env, other));

                return SmallVec::new();
            };

            other = env.types[infer].copied();
        }

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
                self.map(|_| lhs).join(other.map(|_| rhs), env)
            }
            (TypeKind::Primitive(_), TypeKind::Tuple(_)) => {
                SmallVec::from_slice(&[self.id, other.id])
            }

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.map(|_| lhs).join(other.map(|_| rhs), env)
            }
            (TypeKind::Tuple(_), TypeKind::Primitive(_)) => {
                SmallVec::from_slice(&[self.id, other.id])
            }

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.map(|_| lhs).join(other.map(|_| rhs), env)
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

                IntersectionType::join_variants(&lhs_variants, &rhs_variants, env)
            }
            (TypeKind::Primitive(_) | TypeKind::Tuple(_), TypeKind::Intersection(rhs)) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                IntersectionType::join_variants(&lhs_variants, &rhs_variants, env)
            }
        }
    }

    fn meet(
        mut self: Type<'heap, Self>,
        mut other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> smallvec::SmallVec<TypeId, 4> {
        if *self.kind == TypeKind::Infer {
            let Some(infer) = env.substitution.infer(self.id) else {
                env.diagnostics.push(no_type_inference(env, self));

                return SmallVec::new();
            };

            self = env.types[infer].copied();
        }

        if *other.kind == TypeKind::Infer {
            let Some(infer) = env.substitution.infer(other.id) else {
                env.diagnostics.push(no_type_inference(env, other));

                return SmallVec::new();
            };

            other = env.types[infer].copied();
        }

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
                self.map(|_| lhs).meet(other.map(|_| rhs), env)
            }
            (TypeKind::Primitive(_), TypeKind::Tuple(_)) => SmallVec::new(),

            (TypeKind::Tuple(lhs), TypeKind::Tuple(rhs)) => {
                self.map(|_| lhs).meet(other.map(|_| rhs), env)
            }
            (TypeKind::Tuple(_), TypeKind::Primitive(_)) => SmallVec::new(),

            (TypeKind::Union(lhs), TypeKind::Union(rhs)) => {
                self.map(|_| lhs).meet(other.map(|_| rhs), env)
            }
            (
                TypeKind::Union(lhs),
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
            ) => {
                let lhs_variants = lhs.unnest(env);
                let rhs_variants = [other.id];

                UnionType::meet_variants(&lhs_variants, &rhs_variants, env)
            }
            (
                TypeKind::Primitive(_) | TypeKind::Tuple(_) | TypeKind::Intersection(_),
                TypeKind::Union(rhs),
            ) => {
                let lhs_variants = [self.id];
                let rhs_variants = rhs.unnest(env);

                UnionType::meet_variants(&lhs_variants, &rhs_variants, env)
            }

            (TypeKind::Intersection(lhs), TypeKind::Intersection(rhs)) => {
                self.map(|_| lhs).meet(other.map(|_| rhs), env)
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
            TypeKind::Primitive(primitive_type) => self.map(|_| primitive_type).is_bottom(env),
            TypeKind::Tuple(tuple_type) => self.map(|_| tuple_type).is_bottom(env),
            TypeKind::Union(union_type) => self.map(|_| union_type).is_bottom(env),
            TypeKind::Intersection(intersection_type) => {
                self.map(|_| intersection_type).is_bottom(env)
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
            TypeKind::Primitive(primitive_type) => self.map(|_| primitive_type).is_top(env),
            TypeKind::Tuple(tuple_type) => self.map(|_| tuple_type).is_top(env),
            TypeKind::Union(union_type) => self.map(|_| union_type).is_top(env),
            TypeKind::Intersection(intersection_type) => {
                self.map(|_| intersection_type).is_top(env)
            }
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
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        todo!()
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        match self.kind {
            TypeKind::Primitive(primitive_type) => self.map(|_| primitive_type).simplify(env),
            TypeKind::Tuple(tuple_type) => self.map(|_| tuple_type).simplify(env),
            TypeKind::Union(union_type) => self.map(|_| union_type).simplify(env),
            TypeKind::Intersection(intersection_type) => {
                self.map(|_| intersection_type).simplify(env)
            }
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
        todo!()
    }
}

const _: () = {
    assert!(
        !core::mem::needs_drop::<TypeKind<'static>>(),
        "TypeKind cannot contain a `Drop` constructor, as it would cause a memory leak on heap \
         reset, as `Drop` won't be run."
    );
};
