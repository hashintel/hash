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
