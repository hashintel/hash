use core::fmt::Display;

use error_stack::Report;
use text_size::TextRange;

use super::SourceId;
use crate::error::ResolveError;

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
    pub fn new<S, C>(span: &S, context: &mut C) -> Result<Self, Report<ResolveError>>
    where
        S: DiagnosticSpan<C>,
    {
        let source = span.source();

        let mut range = span
            .span(context)
            .ok_or_else(|| ResolveError::UnknownSpan {
                span: span.to_string(),
            })?;

        for ancestor in span.ancestors(context) {
            range += ancestor
                .span(context)
                .ok_or_else(|| ResolveError::UnknownSpan {
                    span: span.to_string(),
                })?
                .start();
        }

        Ok(Self { source, range })
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
