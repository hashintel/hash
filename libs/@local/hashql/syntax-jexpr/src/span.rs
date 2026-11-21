use hashql_core::span::TextRange;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Span {
    pub range: TextRange,
}

impl Span {
    #[must_use]
    pub const fn new(range: TextRange) -> Self {
        Self { range }
    }
}

impl hashql_core::span::Span for Span {
    fn range(&self) -> TextRange {
        self.range
    }
}
