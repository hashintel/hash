// HashQL type system

pub mod error;
pub mod intrinsic;
pub mod pretty_print;
pub mod primitive;
#[cfg(test)]
pub(crate) mod test;
pub mod unify;

use self::{
    intrinsic::{IntrinsicType, unify_intrinsic},
    pretty_print::{PrettyPrint, RecursionLimit},
    primitive::{PrimitiveType, unify_primitive},
    unify::UnificationContext,
};
use crate::{arena::Arena, id::HasId, newtype, span::SpanId};

newtype!(
    pub struct TypeId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct ClosureType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct StructType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TupleType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct OpaqueType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct UnionType {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Param {}

pub struct GenericArgument {}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
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
    Error,
}

impl TypeKind {
    #[must_use]
    pub const fn into_primitive(self) -> Option<PrimitiveType> {
        match self {
            Self::Primitive(r#type) => Some(r#type),
            _ => None,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Type<K = TypeKind> {
    id: TypeId,
    span: SpanId,

    kind: K,
}

impl<K> Type<K> {
    pub fn map<K2>(self, closure: impl FnOnce(K) -> K2) -> Type<K2> {
        Type {
            id: self.id,
            span: self.span,
            kind: closure(self.kind),
        }
    }
}

impl<K> PrettyPrint for Type<K> {
    fn pretty(&self, _: &Arena<Type>, _: RecursionLimit) -> pretty::RcDoc<anstyle::Style> {
        todo!()
    }
}

impl HasId for Type {
    type Id = TypeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

pub(crate) fn unify_type(context: &mut UnificationContext, lhs: TypeId, rhs: TypeId) {
    let lhs = context.arena[lhs];
    let rhs = context.arena[rhs];

    match (lhs.kind, rhs.kind) {
        (TypeKind::Primitive(lhs_kind), TypeKind::Primitive(rhs_kind)) => {
            unify_primitive(context, lhs.map(|_| lhs_kind), rhs.map(|_| rhs_kind));
        }
        (TypeKind::Intrinsic(lhs_kind), TypeKind::Intrinsic(rhs_kind)) => {
            unify_intrinsic(context, lhs.map(|_| lhs_kind), rhs.map(|_| rhs_kind));
        }
        (TypeKind::Error, _) => {
            // do nothing, simply propagate the error up
            context.mark_error(rhs);
        }
        (_, TypeKind::Error) => {
            // do nothing, simply propagate the error up
            context.mark_error(lhs);
        }
        _ => {
            todo!()
        }
    }
}
