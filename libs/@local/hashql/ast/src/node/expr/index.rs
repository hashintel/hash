use hashql_core::{heap, span::SpanId};

use super::Expr;
use crate::node::id::NodeId;

/// An indexing expression in the HashQL Abstract Syntax Tree.
///
/// Represents accessing an element from a collection by its index or key.
/// Indexing works with various collection types including lists, tuples,
/// dictionaries, structs, and other indexed data structures.
///
/// The index expression can be any expression that evaluates to a valid
/// index for the collection type - typically an integer for lists or a value of appropriate key
/// type for dictionaries.
///
/// Tuples and structs can be indexed using this expression, but only if the type system can prove
/// that the index is within bounds.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["[]", "items", 0]
/// ["items[0]"]
/// ["matrix[i][j]"]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// items[0]
/// matrix[i][j]
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct IndexExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
    pub index: heap::Box<'heap, Expr<'heap>>,
}
