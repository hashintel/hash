use hashql_core::span::SpanId;

use crate::node::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct If<'heap> {
    pub span: SpanId,

    pub test: Node<'heap>,
    pub then: Node<'heap>,
    pub r#else: Node<'heap>,
}
