// HashQL type system

pub mod error;
pub mod intrinsic;
pub mod pretty_print;
pub mod primitive;
pub mod unify;

use self::{
    intrinsic::IntrinsicType,
    pretty_print::{PrettyPrint, RecursionLimit},
    primitive::PrimitiveType,
    unify::UnificationContext,
};
use crate::{arena::Arena, id::HasId, newtype, span::SpanId};

newtype!(
    pub struct TypeId(u32 is 0..=0xFFFF_FF00)
);

pub struct ClosureType {}

pub struct StructType {}

pub struct TupleType {}

pub struct OpaqueType {}

pub struct UnionType {}

pub struct Param {}

pub struct GenericArgument {}

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
    todo!()
}
