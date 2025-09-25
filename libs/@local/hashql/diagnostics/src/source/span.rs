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
struct AbsoluteDiagnosticSpanInner {
    source: SourceId,
    range: TextRange,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AbsoluteDiagnosticSpan(Option<AbsoluteDiagnosticSpanInner>);

impl AbsoluteDiagnosticSpan {
    /// Creates a new `AbsoluteDiagnosticSpan` from a diagnostic span and its context.
    ///
    /// # Errors
    ///
    /// Returns `ResolveError::UnknownSpan` if either the span or any of its ancestors
    /// cannot be resolved in the provided context.
    pub fn new<S, C>(span: &S, context: &mut C) -> Self
    where
        S: DiagnosticSpan<C>,
    {
        let source = span.source();

        let Some(mut range) = span.span(context) else {
            return Self(None);
        };

        for ancestor in span.ancestors(context) {
            let Some(ancestor_range) = ancestor.span(context) else {
                return Self(None);
            };

            range += ancestor_range.start();
        }

        Self(Some(AbsoluteDiagnosticSpanInner { source, range }))
    }

    #[must_use]
    pub const fn from_parts(source: SourceId, range: TextRange) -> Self {
        Self(Some(AbsoluteDiagnosticSpanInner { source, range }))
    }

    #[must_use]
    pub const fn source(self) -> Option<SourceId> {
        match self.0 {
            Some(inner) => Some(inner.source),
            None => None,
        }
    }

    #[must_use]
    pub const fn range(self) -> Option<TextRange> {
        match self.0 {
            Some(inner) => Some(inner.range),
            None => None,
        }
    }
}
