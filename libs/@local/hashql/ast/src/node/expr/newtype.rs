use hashql_core::{heap, span::SpanId, symbol::Ident};

use super::Expr;
use crate::node::{id::NodeId, r#type::Type};

/// A new type definition expression in the HashQL Abstract Syntax Tree.
///
/// Represents a `newtype` declaration that creates a distinct nominal type
/// based on an existing type. Unlike type aliases (created with `type`),
/// newtypes are not interchangeable with their underlying types.
///
/// When defining a new type, a constructor function of the same name is generated automatically and
/// brought into scope.
///
/// # Examples
///
/// ## J-Expr
///
/// ```json
/// ["newtype", "UserId", "String", <body>]
/// ["newtype", "Coordinates", {"#type": {"lat": "Float", "lng": "Float"}}, <body>]
///
/// ["newtype", "AccountId", "String"
///     ["AccountId", {"#literal": "1234"}]
/// ]
/// ```
///
/// ## Documentation Format
///
/// ```text
/// newtype UserId = String in <body>
/// newtype Coordinates = {lat: Float, lng: Float} in <body>
///
/// newtype AccountId = String in
///     AccountId("1234")
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct NewTypeExpr<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub name: Ident,
    pub value: heap::Box<'heap, Type<'heap>>,

    pub body: heap::Box<'heap, Expr<'heap>>,
}
