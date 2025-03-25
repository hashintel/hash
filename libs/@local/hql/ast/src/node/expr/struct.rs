use hql_span::SpanId;

use super::Expr;
use crate::{heap::P, node::r#type::Type};

/// Represents a key-value entry in a struct literal.
///
/// A struct entry consists of a key expression and its corresponding value expression.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructEntry<'heap> {
    pub span: SpanId,

    /// The expression representing the key of this entry.
    pub key: P<'heap, Expr<'heap>>,
    /// The expression representing the value of this entry.
    pub value: P<'heap, Expr<'heap>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StructExpr<'heap> {
    pub span: SpanId,

    /// The sequence of key-value entries in this struct literal.
    pub entries: P<'heap, [StructEntry<'heap>]>,
    pub r#type: P<'heap, Type<'heap>>,
}
