use core::fmt::Display;

use text_size::TextRange;

use super::SourceId;

pub trait DiagnosticSpan<R>: Display {
    fn source(&self) -> SourceId;

    fn span(&self, resolver: &mut R) -> Option<TextRange>;

    #[expect(clippy::min_ident_chars, reason = "false-positive")]
    fn ancestors(&self, resolver: &mut R) -> impl IntoIterator<Item = Self> + use<Self, R>;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(crate) struct SourceSpan {
    pub source: SourceId,
    pub range: TextRange,
}

impl SourceSpan {
    /// Creates a new `AbsoluteDiagnosticSpan` from a diagnostic span and its context.
    ///
    /// # Errors
    ///
    /// Returns `ResolveError::UnknownSpan` if either the span or any of its ancestors
    /// cannot be resolved in the provided context.
    pub(crate) fn resolve<S, R>(span: &S, resolver: &mut R) -> Option<Self>
    where
        S: DiagnosticSpan<R>,
    {
        let source = span.source();

        let mut range = span.span(resolver)?;

        for ancestor in span.ancestors(resolver) {
            range += ancestor.span(resolver)?.start();
        }

        Some(Self { source, range })
    }
}
