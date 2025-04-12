use core::fmt::Display;

use error_stack::Report;
use text_size::{TextRange, TextSize};

use crate::error::ResolveError;

pub trait DiagnosticSpan: Display {
    type Context;

    fn span(&self, context: &mut Self::Context) -> Option<TextRange>;

    fn ancestors(&self, context: &mut Self::Context) -> impl IntoIterator<Item = Self> + use<Self>;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AbsoluteDiagnosticSpan {
    span: TextRange,
}

impl AbsoluteDiagnosticSpan {
    /// Creates a new `AbsoluteDiagnosticSpan` from a diagnostic span and its context.
    ///
    /// # Errors
    ///
    /// Returns `ResolveError::UnknownSpan` if either the span or any of its ancestors
    /// cannot be resolved in the provided context.
    pub fn new<S>(span: &S, context: &mut S::Context) -> Result<Self, Report<ResolveError>>
    where
        S: DiagnosticSpan,
    {
        let mut absolute = span
            .span(context)
            .ok_or_else(|| ResolveError::UnknownSpan {
                span: span.to_string(),
            })?;

        for ancestor in span.ancestors(context) {
            absolute += ancestor
                .span(context)
                .ok_or_else(|| ResolveError::UnknownSpan {
                    span: span.to_string(),
                })?
                .start();
        }

        Ok(Self { span: absolute })
    }

    #[must_use]
    pub const fn span(self) -> TextRange {
        self.span
    }

    pub(crate) const fn full() -> Self {
        Self {
            span: TextRange::new(TextSize::new(0), TextSize::new(u32::MAX)),
        }
    }
}

impl ariadne::Span for AbsoluteDiagnosticSpan {
    type SourceId = ();

    fn source(&self) -> &Self::SourceId {
        &()
    }

    fn start(&self) -> usize {
        self.span.start().into()
    }

    fn end(&self) -> usize {
        self.span.end().into()
    }

    fn len(&self) -> usize {
        self.span.len().into()
    }

    fn is_empty(&self) -> bool {
        self.span.is_empty()
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "Text will never be larger than u32::MAX (4GiB) due to the use of `TextSize`"
    )]
    fn contains(&self, offset: usize) -> bool {
        self.span.contains(TextSize::from(offset as u32))
    }
}
