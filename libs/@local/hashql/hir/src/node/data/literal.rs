use hashql_core::{literal::LiteralKind, span::SpanId};

use crate::node::NodeId;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Literal<'heap> {
    pub id: NodeId,
    pub span: SpanId,

    pub kind: LiteralKind<'heap>,
}
