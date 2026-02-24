// HashQL type system

pub mod builder;
mod collections;
pub mod environment;
pub mod error;
pub mod inference;
pub mod kind;
pub mod lattice;
mod pretty;
pub(crate) mod recursion;
#[cfg(test)]
pub(crate) mod tests;
pub mod visit;

use core::ops::{Deref, Receiver};

pub use self::{
    builder::TypeBuilder,
    pretty::{RecursionGuardStrategy, TypeFormatter, TypeFormatterOptions},
    recursion::RecursionBoundary,
};
use self::{inference::Variable, kind::TypeKind};
use crate::{
    id::{self, HasId},
    intern::{Decompose, Interned},
    span::SpanId,
};

id::newtype!(
    /// A unique identifier for a type in the HashQL Type System
    ///
    /// Each type inside the HashQL Type System is identified by a unique `TypeId`.
    /// This identifier is used to refer to types throughout the system.
    ///
    /// The value space is restricted to `0..=0xFFFF_FF00`, reserving the last 256 for niches.
    /// As real pattern types are an experimental feature in Rust, these can currently only be
    /// used by directly modifying and accessing the `TypeId`'s internal value.
    pub struct TypeId(u32 is 0..=0xFFFF_FF00)
);

impl TypeId {
    /// `TypeId` which is never valid.
    ///
    /// This is used as a placeholder throughout the system if required.
    ///
    /// The uniqueness constraint is not enforced by the type system, but rather just a statistical
    /// improbability, considering that 4.294.967.040 types would need to be generated, for a
    /// collision to occur.
    pub const PLACEHOLDER: Self = Self(0xFFFF_FF00);
}

id::newtype_collections!(pub type TypeId* from TypeId);

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

/// A value paired with its type information.
///
/// [`Typed<T>`] is a wrapper that associates a value of type `T` with its corresponding [`TypeId`]
/// in the type system.
///
/// # Use Cases
///
/// Use [`Typed`] when:
/// - Passing values between compilation phases where type information must be preserved
/// - Returning values where the type cannot be inferred from context alone
/// - Building data structures where each element may have a different type
///
/// # Ergonomics
///
/// [`Typed<T>`] implements [`Deref`] to `T`, allowing transparent access to the
/// wrapped value without explicit unwrapping:
///
/// ```
/// # use hashql_core::r#type::{Typed, TypeId};
/// let typed_value = Typed {
///     r#type: TypeId::PLACEHOLDER,
///     value: 42,
/// };
/// assert_eq!(*typed_value, 42); // Deref coercion works
/// ```
///
/// # Example
///
/// ```
/// # use hashql_core::r#type::{Typed, TypeId};
/// # use hashql_core::id::Id;
/// fn process_value(typed: Typed<i32>) -> i32 {
///     // Can use type_id for type checking
///     println!("Processing value with type {:?}", typed.r#type);
///     // Can access value directly via Deref
///     typed.value * 2
/// }
/// ```
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Typed<T> {
    /// The type identifier for this value in the type system.
    pub r#type: TypeId,
    /// The actual value being wrapped.
    pub value: T,
}

impl<T> Deref for Typed<T> {
    type Target = T;

    fn deref(&self) -> &Self::Target {
        &self.value
    }
}
