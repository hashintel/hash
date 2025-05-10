use hashql_core::span::SpanId;

use super::NodeId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataKind {
    Struct,
    Dict,
    Tuple,
    List,
    Literal,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Data {
    id: NodeId,
    span: SpanId,

    kind: DataKind,
}
