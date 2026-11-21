//! Source spans recorded in the compiler's span table.

use hashql_core::span::TextRange;

/// Byte range in a J-Expr source string.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Span {
    /// Byte offset interval covered by this span in the source text.
    pub range: TextRange,
}

impl Span {
    /// Creates a span covering `range`.
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
