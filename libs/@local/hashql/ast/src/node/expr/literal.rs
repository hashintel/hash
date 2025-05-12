use hashql_core::{heap, literal::LiteralKind, span::SpanId};

use crate::node::{id::NodeId, r#type::Type};

/// A literal expression in the HashQL Abstract Syntax Tree.
///
/// Represents a constant value directly expressed in the source code.
/// Literals are the most basic form of expressions and produce a value
/// without any computation.
///
/// Each literal has a type that describes its data type in the type system,
/// which is used for type checking and inference.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// {"#literal": 123}
/// {"#literal": "hello"}
/// {"#literal": true}
/// {"#literal": null}
/// ```
///
/// ## Documentation Format
///
/// ```text
/// 123
/// "hello"
/// true
/// null
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct LiteralExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: LiteralKind<'heap>,
    pub r#type: Option<heap::Box<'heap, Type<'heap>>>,
}
