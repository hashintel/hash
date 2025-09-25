use core::fmt::Display;

use text_size::TextRange;

use super::SourceId;

pub trait DiagnosticSpan<R>: Display {
    fn source(&self) -> SourceId;

    fn span(&self, resolver: &mut R) -> Option<TextRange>;

    fn ancestors(&self, resolver: &mut R) -> impl IntoIterator<Item = Self> + use<Self, R>;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AbsoluteDiagnosticSpan {
    source: SourceId,
    range: TextRange,
}

impl AbsoluteDiagnosticSpan {
    /// Creates a new `AbsoluteDiagnosticSpan` from a diagnostic span and its context.
    ///
    /// # Errors
    ///
    /// Returns `ResolveError::UnknownSpan` if either the span or any of its ancestors
    /// cannot be resolved in the provided context.
    pub fn new<S, R>(span: &S, context: &mut R) -> Option<Self>
    where
        S: DiagnosticSpan<R>,
    {
        let source = span.source();

        let mut range = span.span(context)?;

        for ancestor in span.ancestors(context) {
            range += ancestor.span(context)?.start();
        }

        Some(Self { source, range })
    }

    #[must_use]
    pub const fn from_parts(source: SourceId, range: TextRange) -> Self {
        Self { source, range }
    }

    #[must_use]
    pub const fn source(self) -> SourceId {
        self.source
    }

    #[must_use]
    pub const fn range(self) -> TextRange {
        self.range
    }
}
