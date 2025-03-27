use hashql_core::span::SpanId;

use super::Expr;
use crate::{
    heap,
    node::{id::NodeId, r#type::Type},
};

/// Represents a key-value entry in a struct literal.
///
/// A struct entry consists of a key expression and its corresponding value expression.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructEntry<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    /// The expression representing the key of this entry.
    pub key: heap::Box<'heap, Expr<'heap>>,
    /// The expression representing the value of this entry.
    pub value: heap::Box<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    /// The sequence of key-value entries in this struct literal.
    pub entries: heap::Box<'heap, [StructEntry<'heap>]>,
    pub r#type: heap::Box<'heap, Type<'heap>>,
}
