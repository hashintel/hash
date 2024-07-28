extern crate alloc;

use error_stack::Report;
pub use json_number::Number;
use logos::SpannedIter;
use text_size::{TextRange, TextSize};

pub use self::{
    error::{LexingError, Location},
    kind::TokenKind,
    token::Token,
};

mod error;
mod kind;
mod parse;
mod token;

pub struct Lexer<'source> {
    inner: SpannedIter<'source, TokenKind<'source>>,
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
        }
    }
}

impl<'source> Iterator for Lexer<'source> {
    type Item = error_stack::Result<Token<'source>, LexingError>;

    fn next(&mut self) -> Option<Self::Item> {
        let (kind, span) = self.inner.next()?;

        let span = {
            // The constructor verifies that the span is always less than `u32::MAX`.
            let start = TextSize::try_from(span.start).unwrap_or_else(|_error| unreachable!());
            let end = TextSize::try_from(span.end).unwrap_or_else(|_error| unreachable!());

            TextRange::new(start, end)
        };

        match kind {
            Ok(kind) => Some(Ok(Token { kind, span })),
            Err(error) => Some(Err(Report::new(error).attach(Location::new(span)))),
        }
    }
}
