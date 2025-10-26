use hashql_core::symbol::Ident;

use crate::node::Node;

/// A field access operation in the HashQL HIR.
///
/// Represents accessing a named field from a composite value such as a struct or tuple.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct FieldAccess<'heap> {
    pub expr: Node<'heap>,
    pub field: Ident<'heap>,
}
