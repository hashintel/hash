use hashql_core::{span::SpanId, symbol::Ident};

use super::{generic::GenericArgument, id::NodeId};
use crate::heap;

/// A segment in a path expression.
///
/// Represents a single component of a qualified path, consisting of an identifier
/// and optional generic type arguments. Path segments are connected to form
/// complete paths like `module::submodule::item<T>`.
///
/// # Examples
///
/// In a path like `std::collections::HashMap<K, V>`:
/// - `std` is a segment with no generic arguments
/// - `collections` is a segment with no generic arguments
/// - `HashMap` is a segment with generic arguments `K` and `V`
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct PathSegment<'heap> {
    pub id: NodeId,

    pub name: Ident,
    /// Type parameters attached to this path segment
    pub arguments: heap::Box<'heap, [GenericArgument]>,
}

/// A path expression in the HashQL Abstract Syntax Tree.
///
/// Represents a qualified reference to a variable, function, type, or module.
/// Paths can be simple identifiers (like `x`) or qualified names with multiple
/// segments separated by double colons (like `std::collections::HashMap`).
///
/// Path expressions are used for variable references, module access, and type names.
/// They can include generic type arguments applied to specific segments.
///
/// # Examples
///
/// Simple paths:
/// ```text
/// x                     // A local variable
/// length                // A function or variable
/// ```
///
/// Qualified paths:
/// ```text
/// std::collections::HashMap  // An item in a nested module
/// math::sin                  // A function in a module
/// ```
///
/// Paths with generic arguments:
/// ```text
/// Vec<Int>                       // A type with one type argument
/// HashMap<String, User>          // A type with two type arguments
/// graph::query<User, Connection> // A generic function
/// ```
///
/// J-Expr explicit:
/// ```json
/// {"#path", ["std", "collections", "HashMap"]}
/// {"#path", [{"name": "HashMap", "arguments": ["K, V"]}]}
/// ```
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Path<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    /// Whether the path is rooted (starts with a double colon `::`).
    pub rooted: bool,
    pub segments: heap::Box<'heap, [PathSegment<'heap>]>,
}
