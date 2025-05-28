use hashql_core::{span::SpanId, r#type::TypeId};

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
// TODO: in the future we might want to generalize these more, and have the ability to actually
// "move" them around, e.g. `let x = identity(Some)` (this doesn't work at the current time)
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct TypeConstructor<'heap> {
    pub span: SpanId,

    pub value: Node<'heap>, /* <- This is the problem. I don't think we need this actually. What
                             * we need instead is just to have a reference! */
    pub r#type: TypeId, /* This should be the type of the closure
                         * The problem is that if we don't have an underlying value - an
                         * application - then we cannot easily just "optimize" this node out,
                         * because we can only optimize it out if there's. well actually an
                         * application, but that isn't easily achievable here, but with a value
                         * we can't just use e.g. `None` as a constructor without a value. But
                         * in the case of just a normal function, it'd be very similar to
                         * just... a closure, except this could help us in the long run when
                         * trying to optimize? It's good to know for sure, because we know the
                         * value. I am just trying to figure out *how* to do this best. I think
                         * because this is just a normal function, like any other (except that
                         * it's an intrinsic). I think it makes sense to just treat it as such -
                         * meaning it's just a closure with a set of arguments and a return
                         * type. This would then also allow us to "move around" the things in
                         * the future. I mean for now we can just deny `TypeConstructor` in
                         * non-function positions, but I feel like that'd be a good idea either
                         * way? */
}

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
