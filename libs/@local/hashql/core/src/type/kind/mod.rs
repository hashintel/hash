pub mod closure;
pub mod generic_argument;
pub mod intrinsic;
pub mod opaque;
pub mod primitive;
pub mod r#struct;
pub mod tuple;
pub mod union;

use core::ops::Index;

use pretty::RcDoc;

use self::{
    closure::ClosureType, generic_argument::Param, intrinsic::IntrinsicType, opaque::OpaqueType,
    primitive::PrimitiveType, r#struct::StructType, tuple::TupleType, union::UnionType,
};
use super::{
    Type, TypeId,
    environment::StructuralEquivalenceEnvironment,
    pretty_print::{CYAN, GRAY, PrettyPrint},
    recursion::RecursionDepthBoundary,
};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TypeKind {
    Closure(ClosureType),
    Primitive(PrimitiveType),
    Intrinsic(IntrinsicType),
    Struct(StructType),
    Tuple(TupleType),
    Opaque(OpaqueType),
    Union(UnionType),
    Param(Param),
    Never,
    Unknown,
    Infer,
    // This type is linked / the same type as another, only happens on infer chains
    Link(TypeId),
}

impl TypeKind {
    #[must_use]
    pub fn into_closure(self) -> Option<ClosureType> {
        match self {
            Self::Closure(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_primitive(&self) -> Option<PrimitiveType> {
        match self {
            &Self::Primitive(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub const fn as_intrinsic(&self) -> Option<IntrinsicType> {
        match self {
            &Self::Intrinsic(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub fn into_struct(self) -> Option<StructType> {
        match self {
            Self::Struct(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub fn into_tuple(self) -> Option<TupleType> {
        match self {
            Self::Tuple(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub fn into_opaque(self) -> Option<OpaqueType> {
        match self {
            Self::Opaque(r#type) => Some(r#type),
            _ => None,
        }
    }

    #[must_use]
    pub fn into_union(self) -> Option<UnionType> {
        match self {
            Self::Union(r#type) => Some(r#type),
            _ => None,
        }
    }

    pub(super) fn structurally_equivalent(
        this: &Type<Self>,
        other: &Type<Self>,
        env: &mut StructuralEquivalenceEnvironment,
    ) -> bool {
        match (&this.kind, &other.kind) {
            (Self::Closure(lhs), Self::Closure(rhs)) => lhs.structurally_equivalent(rhs, env),
            (&Self::Primitive(lhs), &Self::Primitive(rhs)) => lhs.structurally_equivalent(rhs),
            (Self::Intrinsic(lhs), Self::Intrinsic(rhs)) => lhs.structurally_equivalent(rhs, env),
            (Self::Struct(lhs), Self::Struct(rhs)) => lhs.structurally_equivalent(rhs, env),
            (Self::Tuple(lhs), Self::Tuple(rhs)) => lhs.structurally_equivalent(rhs, env),
            (Self::Opaque(lhs), Self::Opaque(rhs)) => lhs.structurally_equivalent(rhs, env),
            (Self::Union(lhs), Self::Union(rhs)) => lhs.structurally_equivalent(rhs, env),
            (Self::Param(lhs), Self::Param(rhs)) => lhs.structurally_equivalent(rhs),

            (&Self::Link(lhs), &Self::Link(rhs)) => env.structurally_equivalent(lhs, rhs),

            (&Self::Link(lhs), _) => env.structurally_equivalent(lhs, other.id),
            (_, &Self::Link(rhs)) => env.structurally_equivalent(this.id, rhs),

            (Self::Never, Self::Never)
            | (Self::Unknown, Self::Unknown)
            | (Self::Infer, Self::Infer) => true,

            _ => false,
        }
    }
}

impl PrettyPrint for TypeKind {
    fn pretty<'a>(
        &'a self,
        arena: &'a impl Index<TypeId, Output = Type>,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'a, anstyle::Style> {
        match self {
            Self::Closure(closure) => closure.pretty(arena, limit),
            Self::Primitive(primitive) => primitive.pretty(arena, limit),
            Self::Intrinsic(intrinsic) => intrinsic.pretty(arena, limit),
            Self::Struct(r#struct) => r#struct.pretty(arena, limit),
            Self::Tuple(tuple) => tuple.pretty(arena, limit),
            Self::Opaque(opaque) => opaque.pretty(arena, limit),
            Self::Union(union) => union.pretty(arena, limit),
            Self::Param(param) => param.pretty(arena, limit),
            Self::Never => RcDoc::text("!").annotate(CYAN),
            Self::Unknown => RcDoc::text("?").annotate(CYAN),
            Self::Infer => RcDoc::text("_").annotate(GRAY),
            &Self::Link(id) => arena[id].pretty(arena, limit),
        }
    }
}
