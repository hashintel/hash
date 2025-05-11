use hashql_core::{span::SpanId, symbol::Ident};

use super::Node;

/// A variable binding node in the HashQL HIR.
///
/// Represents a `let` expression that binds a value to a name within a lexical scope.
/// The binding is only visible within the body expression and creates a new variable
/// that can be referenced by name.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Let<'heap> {
    pub span: SpanId,

    pub name: Ident<'heap>,
    pub value: Node<'heap>,

    pub body: Node<'heap>,
}
