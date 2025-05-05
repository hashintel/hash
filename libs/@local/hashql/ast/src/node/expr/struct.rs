use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// A key-value entry in a struct literal.
///
/// A struct entry consists of a named field (represented by an identifier)
/// and its corresponding value expression.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructEntry<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub key: Ident<'heap>,
    pub value: heap::Box<'heap, Expr<'heap>>,
}

/// A struct expression in the HashQL Abstract Syntax Tree.
///
/// Represents a collection of named fields with their associated values.
/// Structs in HashQL are heterogeneous collections that provide named access to their members.
///
/// Unlike dictionaries, struct fields must be identifiers known at compile time,
/// not dynamically computed expressions.
///
/// The type is used to optionally assign/assert a specific type to the struct, but only if the
/// struct is compatible with the specified type.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// {"#struct": {}}
/// {"#struct": {"field1": "value1", "field2": "value2"}}
/// ```
///
/// ## Documentation Format
///
/// ```text
/// (:)
/// (field1: value1, field2: value2)
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub entries: heap::Vec<'heap, StructEntry<'heap>>,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,
}
