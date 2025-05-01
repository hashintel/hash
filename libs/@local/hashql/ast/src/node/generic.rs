use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::{id::NodeId, r#type::Type};

/// A concrete type argument for a generic type.
///
/// Represents a specific type used to instantiate a generic type parameter.
/// In a generic type instantiation like `Vec<String>`, `String` would be
/// represented as a [`GenericArgument`].
///
/// # Examples
///
/// In a type reference like `HashMap<K, V>`, `K` and `V` are generic arguments.
/// In an instantiated type like `List<Int>`, `Int` is a generic argument.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct GenericArgument<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub r#type: heap::Box<'heap, Type<'heap>>,
}

/// Represents a constraint applied to a generic type parameter.
///
/// Constraints define requirements that a type argument must satisfy
/// to be used for a specific generic parameter. This is often expressed
/// using syntax like `T: Bound` or `T: Bound1 & Bound2`.
///
/// The `bound` field holds a `Type` which represents the requirement.
/// If multiple constraints are needed (e.g., `T: Debug + Clone`), they
/// are typically represented using intersection types within the `bound`
/// field (e.g., a `Type` representing `Debug & Clone`).
///
/// # Examples
///
/// In a declaration like `fn<T: Debug>(x: T)`, the constraint `T: Debug`
/// would be represented by a `GenericConstraint` where `name` is `T`
/// and `bound` is the `Type` for `Debug`.
///
/// For `fn<K: Hash + Eq>`, there would be a `GenericConstraint` for `K`
/// with a `bound` representing the intersection type `Hash & Eq`.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct GenericConstraint<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    // Due to the fact that we have `&` and `|`, we don't need to have `Vec` of bounds
    pub bound: Option<heap::Box<'heap, Type<'heap>>>,
}

/// A generic type parameter declaration.
///
/// Represents a type parameter in a generic type or function declaration.
/// Each parameter has a name and an optional type bound that constrains
/// what types can be used as arguments for this parameter.
///
/// # Examples
///
/// In a declaration like `fn<T>(x: T): T`, `T` is a generic parameter.
/// In a declaration like `fn<T: Number>(x: T): T`, `T` is a generic parameter
/// with a bound of `Number`.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct GenericParam<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub bound: Option<heap::Box<'heap, Type<'heap>>>,
}

/// A collection of generic parameters for a type or function.
///
/// Represents the complete set of type parameters in a generic declaration,
/// such as the `<T, U>` in `fn<T, U>(x: T, y: U): U`.
///
/// # Examples
///
/// For a function like `fn<T, U: Comparable>(x: T, y: U): Bool`:
/// - The `Generics` would contain two `GenericParam` entries
/// - One for `T` with no bound
/// - One for `U` with a bound of `Comparable`
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Generics<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub params: heap::Vec<'heap, GenericParam<'heap>>,
}
