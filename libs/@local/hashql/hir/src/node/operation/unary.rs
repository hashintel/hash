use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum UnOpKind {
    /// The `!` operator (not)
    Not,
    /// The `~` operator (bitwise not)
    BitNot,
    /// The `-` operator (negation)
    Neg,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct UnOp {
    pub span: SpanId,

    pub kind: UnOpKind,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct UnaryOperation<'heap> {
    pub span: SpanId,

    pub op: UnOp,
    pub expr: Interned<'heap, Node<'heap>>,
}
