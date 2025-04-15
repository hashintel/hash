use core::fmt::Display;

use error_stack::Report;
use text_size::{TextRange, TextSize};

use crate::error::ResolveError;

pub trait DiagnosticSpan<Context>: Display {
    fn span(&self, context: &mut Context) -> Option<TextRange>;

    fn ancestors(
        &self,
        context: &mut Context,
    ) -> impl IntoIterator<Item = Self> + use<Self, Context>;
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AbsoluteDiagnosticSpan {
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

        Ok(Self { range })
    }

    #[must_use]
    pub const fn from_range(range: TextRange) -> Self {
        Self { range }
    }

    #[must_use]
    pub const fn range(self) -> TextRange {
        self.range
    }

    pub(crate) const fn full() -> Self {
        Self {
            range: TextRange::new(TextSize::new(0), TextSize::new(u32::MAX)),
        }
    }
}

impl ariadne::Span for AbsoluteDiagnosticSpan {
    type SourceId = ();

    fn source(&self) -> &Self::SourceId {
        &()
    }

    fn start(&self) -> usize {
        self.range.start().into()
    }

    fn end(&self) -> usize {
        self.range.end().into()
    }

    fn len(&self) -> usize {
        self.range.len().into()
    }

    fn is_empty(&self) -> bool {
        self.range.is_empty()
    }

    #[expect(
        clippy::cast_possible_truncation,
        reason = "Text will never be larger than u32::MAX (4GiB) due to the use of `TextSize`"
    )]
    fn contains(&self, offset: usize) -> bool {
        self.range.contains(TextSize::from(offset as u32))
    }
}
