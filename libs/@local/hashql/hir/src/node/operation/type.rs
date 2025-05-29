use hashql_core::{
    intern::Interned,
    span::SpanId,
    r#type::{TypeId, kind::generic::GenericArgumentReference},
};

use crate::node::Node;

/// A type assertion operation in the HashQL HIR.
///
/// Represents a check that a value conforms to a specified type. Type assertions
/// help enforce type safety within the language and can be used for type narrowing
/// in pattern matching contexts.
///
/// Type assertions can be either non-forcing (allowing compatible subtypes) or
/// forcing (which coerces the value to exactly the specified type). When forcing,
/// the type is automatically set to the target type without additional checks.
///
/// The `force` field determines the assertion behavior:
/// - When `force` is `false`: The assertion only verifies compatibility but preserves the original,
///   potentially more specific type of the value. This is used for type checking and pattern
///   matching where you want to confirm a value meets minimum requirements without losing type
///   information.
/// - When `force` is `true`: The assertion acts as a type cast, changing the type of the value to
///   exactly match the asserted type, potentially discarding more specific type information. This
///   is used when you explicitly want to treat a value as a different type for subsequent
///   operations.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeAssertion<'heap> {
    pub span: SpanId,

    pub value: Node<'heap>,
    pub r#type: TypeId,

    pub force: bool,
}

/// A type constructor operation in the HashQL HIR.
///
/// Represents an operation that creates a value of a specific type. Unlike type
/// assertions which check compatibility, type constructors actively transform
/// or wrap a value to create an instance of the target type.
///
/// Type constructors are particularly important for nominal type systems and
/// newtypes, allowing explicit conversion between otherwise incompatible types.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeConstructor<'heap> {
    pub span: SpanId,

    // The closure that performs the conversion
    pub closure: TypeId,
    // Any unapplied arguments to the constructor
    pub arguments: Interned<'heap, [GenericArgumentReference<'heap>]>,
}
// TODO: we potentially want functions to access the repr and opaque value

/// The kinds of type operations in the HashQL HIR.
///
/// Represents the two primary ways of working with types in HashQL expressions:
/// assertions (checking if a value matches a type) and constructors (creating
/// a value of a specific type).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeOperationKind<'heap> {
    Assertion(TypeAssertion<'heap>),
    Constructor(TypeConstructor<'heap>),
}

/// A type operation node in the HashQL HIR.
///
/// Represents operations that interact with the type system, including type assertions
/// (checking if a value conforms to a type) and type constructors (explicitly creating
/// values of specific types).
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeOperation<'heap> {
    pub span: SpanId,

    pub kind: TypeOperationKind<'heap>,
}
