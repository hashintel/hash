use hql_core::{span::SpanId, symbol::Symbol};

use crate::node::id::NodeId;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StringLiteral {
    pub id: NodeId,
    pub span: SpanId,

    pub value: Symbol,
}

impl StringLiteral {
    #[must_use]
    pub fn as_str(&self) -> &str {
        self.value.as_str()
    }
}
