// HashQL type system

mod collection;
pub mod environment;
pub mod error;
pub mod intern;
pub mod kind;
pub mod lattice;
pub mod pretty_print;
pub(crate) mod recursion;
#[cfg(test)]
pub(crate) mod test;

use core::ops::Receiver;

use self::{kind::TypeKind, pretty_print::PrettyPrint, recursion::RecursionDepthBoundary};
use crate::{id::HasId, newtype, span::SpanId};

// TODO: consider interning types to reduce memory usage
// TODO: see https://github.com/rust-lang/rust/blob/94015d3cd4b48d098abd0f3e44af97dab2b713b4/compiler/rustc_data_structures/src/intern.rs#L26 and https://github.com/rust-lang/rust/blob/94015d3cd4b48d098abd0f3e44af97dab2b713b4/compiler/rustc_data_structures/src/sharded.rs#L204

newtype!(
    pub struct TypeId(u32 is 0..=0xFFFF_FF00)
);

#[derive(Debug, PartialEq, Eq, Hash)]
pub struct Type<'heap, K: ?Sized = TypeKind<'heap>> {
    id: TypeId,
    span: SpanId,

    kind: &'heap K,
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
