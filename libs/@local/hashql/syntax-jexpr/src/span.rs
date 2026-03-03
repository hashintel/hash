use hashql_core::span::TextRange;
use jsonptr::PointerBuf;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Span {
    pub range: TextRange,
    pub pointer: Option<PointerBuf>,
}

impl Span {
    pub(crate) const fn new(range: TextRange) -> Self {
        Self {
            range,
            pointer: None,
        }
    }
}

impl hashql_core::span::Span for Span {
    fn range(&self) -> TextRange {
        self.range
    }
}
