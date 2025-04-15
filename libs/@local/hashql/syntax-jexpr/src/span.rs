use hashql_core::span::{SpanId, TextRange};
use jsonptr::PointerBuf;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Span {
    pub range: TextRange,
    pub pointer: Option<PointerBuf>,

    pub parent_id: Option<SpanId>,
}

impl Span {
    pub(crate) const fn new(range: TextRange) -> Self {
        Self {
            range,
            pointer: None,
            parent_id: None,
        }
    }
}

impl hashql_core::span::Span for Span {
    fn range(&self) -> TextRange {
        self.range
    }

    fn parent_id(&self) -> Option<SpanId> {
        self.parent_id
    }
}
