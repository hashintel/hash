// HashQL type system

mod collection;
pub mod environment;
pub mod error;
pub mod inference;
pub mod kind;
pub mod lattice;
pub mod pretty_print;
pub(crate) mod recursion;
#[cfg(test)]
pub(crate) mod test;
pub mod visit;

use core::ops::Receiver;

use self::{kind::TypeKind, pretty_print::PrettyPrint, recursion::RecursionDepthBoundary};
use crate::{
    id::HasId,
    intern::{Decompose, Interned},
    newtype,
    span::SpanId,
};

newtype!(
    pub struct TypeId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct Type<'heap, K: ?Sized = TypeKind<'heap>> {
    pub id: TypeId,
    pub span: SpanId,

    pub kind: &'heap K,
}

impl<K: ?Sized> Copy for Type<'_, K> {}
impl<K: ?Sized> Clone for Type<'_, K> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<'heap, K> Type<'heap, K> {
    pub fn map<K2>(self, closure: impl FnOnce(&'heap K) -> &'heap K2) -> Type<'heap, K2> {
        Type {
            id: self.id,
            span: self.span,
            kind: closure(self.kind),
        }
    }

    pub const fn with<K2>(self, kind: &'heap K2) -> Type<'heap, K2> {
        Type {
            id: self.id,
            span: self.span,
            kind,
        }
    }
}

impl<K> PrettyPrint for Type<'_, K>
where
    K: PrettyPrint,
{
    fn pretty<'env>(
        &self,
        env: &'env environment::Environment,
        limit: RecursionDepthBoundary,
    ) -> pretty::RcDoc<'env, anstyle::Style> {
        self.kind.pretty(env, limit)
    }
}

impl<K> HasId for Type<'_, K> {
    type Id = TypeId;

    fn id(&self) -> Self::Id {
        self.id
    }
}

impl<K: ?Sized> Receiver for Type<'_, K> {
    type Target = K;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct PartialType<'heap> {
    pub span: SpanId,
    pub kind: Interned<'heap, TypeKind<'heap>>,
}

impl<'heap> Decompose<'heap> for Type<'heap> {
    type Partial = PartialType<'heap>;

    fn from_parts(id: Self::Id, partial: Interned<'heap, Self::Partial>) -> Self {
        Type {
            id,
            span: partial.span,
            kind: partial.kind.0,
        }
    }
}
