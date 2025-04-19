use pretty::RcDoc;
use smallvec::SmallVec;

use super::TypeKind;
use crate::r#type::{
    Type, TypeId,
    environment::{Environment, LatticeEnvironment, SimplifyEnvironment, TypeAnalysisEnvironment},
    lattice::Lattice,
    pretty_print::PrettyPrint,
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ListType {
    element: TypeId,
}

impl<'heap> Lattice<'heap> for ListType {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let element = env.join(self.kind.element, other.kind.element);

        if element == self.kind.element {
            return SmallVec::from_slice(&[self.id]);
        }

        if element == other.kind.element {
            return SmallVec::from_slice(&[other.id]);
        }

        SmallVec::from_slice(&[env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
        })])
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        let element = env.meet(self.kind.element, other.kind.element);

        if element == self.kind.element {
            return SmallVec::from_slice(&[self.id]);
        }

        if element == other.kind.element {
            return SmallVec::from_slice(&[other.id]);
        }

        SmallVec::from_slice(&[env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
        })])
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        // Never bottom, even if the inner element is bottom, as a list can always be empty.
        false
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.element)
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.in_covariant(|env| env.is_subtype_of(self.kind.element, supertype.kind.element))
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.in_covariant(|env| env.is_equivalent(self.kind.element, other.kind.element))
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let element = env.simplify(self.kind.element);

        if element == self.kind.element {
            return self.id;
        }

        env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::List(Self { element }))),
        })
    }
}

impl PrettyPrint for ListType {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        RcDoc::text("List")
            .append(RcDoc::text("<"))
            .append(limit.pretty(env, self.element))
            .append(RcDoc::text(">"))
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DictType {
    pub key: TypeId,
    pub value: TypeId,
}

impl<'heap> Lattice<'heap> for DictType {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        todo!()
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        todo!()
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        // Never bottom, as even with a `!` key or value a dict can be empty
        false
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        false
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        env.is_concrete(self.kind.key) && env.is_concrete(self.kind.value)
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.in_invariant(|env| env.is_subtype_of(self.kind.key, supertype.kind.key))
            && env.in_covariant(|env| env.is_subtype_of(self.kind.value, supertype.kind.value))
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        env.is_equivalent(self.kind.key, other.kind.key)
            && env.is_equivalent(self.kind.value, other.kind.value)
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        let key = env.simplify(self.kind.key);
        let value = env.simplify(self.kind.value);

        if self.kind.key == key && self.kind.value == value {
            return self.id;
        }

        env.alloc(|id| Type {
            id,
            span: self.span,
            kind: env.intern_kind(TypeKind::Intrinsic(IntrinsicType::Dict(Self {
                key,
                value,
            }))),
        })
    }
}

impl PrettyPrint for DictType {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        RcDoc::text("Dict")
            .append(RcDoc::text("<"))
            .append(
                RcDoc::intersperse(
                    [self.key, self.value]
                        .into_iter()
                        .map(|id| limit.pretty(env, id)),
                    RcDoc::text(",").append(RcDoc::line()),
                )
                .nest(1)
                .group(),
            )
            .append(RcDoc::text(">"))
    }
}

// Intrinsics are "magical" types in the HashQL language that have no "substance", in the sense that
// there's no way to define them in terms of HashQL itself.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum IntrinsicType {
    List(ListType),
    Dict(DictType),
}

impl<'heap> Lattice<'heap> for IntrinsicType {
    fn join(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        match (self.kind, other.kind) {
            (Self::List(lhs), Self::List(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (Self::Dict(lhs), Self::Dict(rhs)) => self.with(lhs).join(other.with(rhs), env),
            (Self::List(_), Self::Dict(_)) | (Self::Dict(_), Self::List(_)) => {
                SmallVec::from_slice(&[self.id, other.id])
            }
        }
    }

    fn meet(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut LatticeEnvironment<'_, 'heap>,
    ) -> SmallVec<TypeId, 4> {
        match (self.kind, other.kind) {
            (Self::List(lhs), Self::List(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (Self::Dict(lhs), Self::Dict(rhs)) => self.with(lhs).meet(other.with(rhs), env),
            (Self::List(_), Self::Dict(_)) | (Self::Dict(_), Self::List(_)) => SmallVec::new(),
        }
    }

    fn is_bottom(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_bottom(env),
            Self::Dict(inner) => self.with(inner).is_bottom(env),
        }
    }

    fn is_top(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_top(env),
            Self::Dict(inner) => self.with(inner).is_top(env),
        }
    }

    fn is_concrete(self: Type<'heap, Self>, env: &mut TypeAnalysisEnvironment<'_, 'heap>) -> bool {
        match self.kind {
            Self::List(inner) => self.with(inner).is_concrete(env),
            Self::Dict(inner) => self.with(inner).is_concrete(env),
        }
    }

    fn is_subtype_of(
        self: Type<'heap, Self>,
        supertype: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        match (self.kind, supertype.kind) {
            (Self::List(lhs), Self::List(rhs)) => {
                self.with(lhs).is_subtype_of(supertype.with(rhs), env)
            }
            (Self::Dict(inner), Self::Dict(rhs)) => {
                self.with(inner).is_subtype_of(supertype.with(rhs), env)
            }
            (Self::List(_), Self::Dict(_)) | (Self::Dict(_), Self::List(_)) => false,
        }
    }

    fn is_equivalent(
        self: Type<'heap, Self>,
        other: Type<'heap, Self>,
        env: &mut TypeAnalysisEnvironment<'_, 'heap>,
    ) -> bool {
        match (self.kind, other.kind) {
            (Self::List(lhs), Self::List(rhs)) => {
                self.with(lhs).is_equivalent(other.with(rhs), env)
            }
            (Self::Dict(inner), Self::Dict(rhs)) => {
                self.with(inner).is_equivalent(other.with(rhs), env)
            }
            (Self::List(_), Self::Dict(_)) | (Self::Dict(_), Self::List(_)) => false,
        }
    }

    fn simplify(self: Type<'heap, Self>, env: &mut SimplifyEnvironment<'_, 'heap>) -> TypeId {
        match self.kind {
            Self::List(list) => self.with(list).simplify(env),
            Self::Dict(dict) => self.with(dict).simplify(env),
        }
    }
}

impl PrettyPrint for IntrinsicType {
    fn pretty<'env>(
        &self,
        env: &'env Environment,
        limit: RecursionDepthBoundary,
    ) -> RcDoc<'env, anstyle::Style> {
        match self {
            Self::List(list) => list.pretty(env, limit),
            Self::Dict(dict) => dict.pretty(env, limit),
        }
    }
}
