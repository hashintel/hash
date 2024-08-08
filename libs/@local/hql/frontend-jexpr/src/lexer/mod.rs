use hql_diagnostics::Diagnostic;
use hql_span::{storage::SpanStorage, SpanId};
use logos::SpannedIter;
use text_size::{TextRange, TextSize};

use self::{
    error::{
        from_hifijson_num_error, from_hifijson_str_error, from_unrecognized_character_error,
        LexingError,
    },
    token::Token,
    token_kind::TokenKind,
};
use crate::span::Span;

mod error;
mod parse;
mod syntax_kind;
mod syntax_kind_set;
mod token;
mod token_kind;

pub struct Lexer<'source> {
    inner: SpannedIter<'source, TokenKind<'source>>,
    spans: SpanStorage<Span>,
}

impl<'source> Lexer<'source> {
    /// Create a new lexer from the given source.
    ///
    /// # Panics
    ///
    /// Panics if the source is larger than 4GiB.
    #[must_use]
    pub fn new(source: &'source str) -> Self {
        assert!(
            u32::try_from(source.len()).is_ok(),
            "source is larger than 4GiB"
        );

        Self {
            inner: logos::Lexer::new(source).spanned(),
            spans: SpanStorage::new(),
        }
    }

    #[must_use]
    fn span(&self) -> TextRange {
        let span = self.inner.span();

        // The constructor verifies that the span is always less than `u32::MAX`.
        let start = TextSize::try_from(span.start).unwrap_or_else(|_error| unreachable!());
        let end = TextSize::try_from(span.end).unwrap_or_else(|_error| unreachable!());

        TextRange::new(start, end)
    }

    pub fn spans_mut(&mut self) -> &mut SpanStorage<Span> {
        &mut self.spans
    }

    pub fn advance(&mut self) -> Option<Result<Token<'source>, Diagnostic<'static, SpanId>>> {
        let (kind, span) = self.inner.next()?;

        let span = {
            // The constructor verifies that the span is always less than `u32::MAX`.
            let start = TextSize::try_from(span.start).unwrap_or_else(|_error| unreachable!());
            let end = TextSize::try_from(span.end).unwrap_or_else(|_error| unreachable!());

            TextRange::new(start, end)
        };

        match kind {
            Ok(kind) => Some(Ok(Token { kind, span })),
            Err(LexingError::Number { error, range }) => {
                let span = self.spans.insert(Span::new(range));

                Some(Err(from_hifijson_num_error(&error, span)))
            }
            Err(LexingError::String { error, range }) => {
                let span = self.spans.insert(Span::new(range));

                Some(Err(from_hifijson_str_error(&error, span)))
            }
            Err(LexingError::UnrecognizedCharacter) => {
                let span = self.spans.insert(Span::new(span));

                Some(Err(from_unrecognized_character_error(span)))
            }
        }
    }
}

impl<'source> Iterator for Lexer<'source> {
    type Item = Result<Token<'source>, Diagnostic<'static, SpanId>>;

    fn next(&mut self) -> Option<Self::Item> {
        self.advance()
    }
}
