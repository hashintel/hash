use hql_diagnostics::span::DiagnosticSpan;
use hql_span::{SpanId, TextRange};
use jsonptr::PointerBuf;

pub struct Span {
    pub range: TextRange,
    pub pointer: Option<PointerBuf>,

    pub parent_id: Option<SpanId>,
}

impl Span {
    pub(crate) fn new(range: TextRange) -> Self {
        Self {
            range,
            pointer: None,
            parent_id: None,
        }
    }
}

impl hql_span::Span for Span {
    fn parent_id(&self) -> Option<SpanId> {
        self.parent_id
    }
}

impl From<&Span> for DiagnosticSpan {
    fn from(value: &Span) -> Self {
        Self {
            range: value.range,
            parent_id: value.parent_id,
        }
    }
}
