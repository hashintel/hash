use hashql_core::{intern::Interned, span::SpanId};

use crate::node::Node;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadHead<'heap> {
    Entity { axis: Node<'heap> },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadBody<'heap> {
    Filter(Node<'heap>), // For now this is always a closure
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum GraphReadTail {
    Collect,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct GraphRead<'heap> {
    pub span: SpanId,

    pub head: GraphReadHead<'heap>,
    pub body: Interned<'heap, [GraphReadBody<'heap>]>,
    pub tail: GraphReadTail,
}
