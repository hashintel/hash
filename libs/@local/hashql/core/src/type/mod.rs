// HashQL type system

mod collection;
pub mod environment;
pub mod error;
pub mod inference;
pub mod kind;
pub mod lattice;
pub(crate) mod recursion;
#[cfg(test)]
pub(crate) mod test;
pub mod visit;

use core::ops::Receiver;

use self::{environment::Environment, inference::Variable, kind::TypeKind};
use crate::{
    id::HasId,
    intern::{Decompose, Interned},
    newtype,
    pretty::{PrettyPrint, PrettyRecursionBoundary},
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

impl Type<'_> {
    #[must_use]
    pub const fn into_variable(self) -> Option<Variable> {
        // This destructuring might look weird, but allows us to use `const fn`
        let Some(kind) = self.kind.into_variable() else {
            return None;
        };

        Some(Variable {
            span: self.span,
            kind,
        })
    }
}

impl<'heap, K> PrettyPrint<'heap> for Type<'heap, K>
where
    K: PrettyPrint<'heap>,
{
    fn pretty(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
    ) -> pretty::RcDoc<'heap, anstyle::Style> {
        self.kind.pretty(env, boundary)
    }

    fn pretty_generic(
        &self,
        env: &Environment<'heap>,
        boundary: &mut PrettyRecursionBoundary,
        arguments: kind::GenericArguments<'heap>,
    ) -> pretty::RcDoc<'heap, anstyle::Style> {
        self.kind.pretty_generic(env, boundary, arguments)
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
        let Interned(kind, _) = partial.kind;

        Type {
            id,
            span: partial.span,
            kind,
        }
    }
}
