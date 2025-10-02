use hashql_core::span::SpanId;

use crate::node::Node;

/// A conditional expression in the HashQL HIR.
///
/// Represents an if/else expression that evaluates a test condition and executes
/// one of two branches based on the result. The test expression must evaluate to
/// a boolean value.
///
/// All three components (`test`, `then`, and `else`) are required - there is no
/// support for if-without-else at the HIR level, such constructs are desugared during AST
/// reification.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct If<'heap> {
    pub span: SpanId,

    pub test: Node<'heap>,
    pub then: Node<'heap>,
    pub r#else: Node<'heap>,
}
