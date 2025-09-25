use core::fmt::Display;

use text_size::TextRange;

use super::SourceId;

pub trait DiagnosticSpan<Context>: Display {
    fn source(&self) -> SourceId;

    fn span(&self, context: &mut Context) -> Option<TextRange>;

    fn ancestors(
        &self,
        context: &mut Context,
    ) -> impl IntoIterator<Item = Self> + use<Self, Context>;
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
    pub fn new<S, C>(span: &S, context: &mut C) -> Option<Self>
    where
        S: DiagnosticSpan<C>,
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
