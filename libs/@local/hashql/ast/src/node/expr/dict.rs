use hashql_core::{heap, span::SpanId};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// A key-value entry in a dictionary.
///
/// Represents a single key-value pair in a dictionary expression.
/// Both the key and value are expressions that will be evaluated
/// when the dictionary is created.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DictEntry<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub key: heap::Box<'heap, Expr<'heap>>,
    pub value: heap::Box<'heap, Expr<'heap>>,
}

/// A dictionary expression in the HashQL Abstract Syntax Tree.
///
/// Represents a collection of key-value pairs where keys are dynamically
/// computed expressions. Unlike structs, dictionaries have homogeneous values
/// (all values must be of the same type) and support dynamic key lookup.
///
/// The type field specifies the dictionary's type, including the key and value types.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// {"#dict": {"key1": "value1", "key2": "value2"}}
/// ```
///
/// ## Documentation Format
///
/// ```text
/// {"key1": value1, "key2": value2}
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DictExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub entries: heap::Vec<'heap, DictEntry<'heap>>,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,
}
