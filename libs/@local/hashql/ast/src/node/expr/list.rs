use hashql_core::{heap, span::SpanId};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// An element in a list expression.
///
/// Represents a single value in a list, containing the expression that
/// produces the element value.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ListElement<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub value: heap::Box<'heap, Expr<'heap>>,
}

/// A list expression in the HashQL Abstract Syntax Tree.
///
/// Represents a homogeneous collection of values that can be accessed by index.
/// Lists in HashQL contain elements of a uniform type and support indexed access
/// and iteration.
///
/// The type field specifies the list's element type.
///
/// # Examples
///
/// ```json
/// {"#list": ["value1", "value2", "value3"]}
/// {"#list": ["value1", "value2", "value3"], "#type": "List<String>"}
/// ```
///
/// ## Documentation Format
///
/// ```text
/// [value1, value2, value3]
/// [value1, value2, value3] as List<String>
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ListExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub elements: heap::Vec<'heap, ListElement<'heap>>,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,
}
