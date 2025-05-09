use hashql_core::span::SpanId;

use super::NodeId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum AccessKind {
    Field,
    Index,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Access {
    id: NodeId,
    span: SpanId,

    kind: AccessKind,
}
