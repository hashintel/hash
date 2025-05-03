use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// An input parameter declaration in the HashQL Abstract Syntax Tree.
///
/// Represents a named input parameter with optional type and default value.
/// Input parameters define external values that can be provided to a query,
/// similar to function parameters but specifically for query entry points.
///
/// In effectful languages, these might be called context or requirements.
/// In HashQL, input declarations create bindings visible within their body
/// expression and are used to parameterize queries.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["input", "limit", "Int"]
/// ["input", "limit", "Int", 10]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// input(limit, Int)
/// input(limit, Int, 10)
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct InputExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub r#type: heap::Box<'heap, Type<'heap>>,
    pub default: Option<heap::Box<'heap, Expr<'heap>>>,
}
