use alloc::borrow::Cow;

use hashql_core::span::{TextRange, TextSize};
use logos::{Lexer, Skip};

use super::{Number, error::LexerError, string, token_kind::TokenKind};

pub(crate) fn parse_comment<'source>(lexer: &mut Lexer<'source, TokenKind<'source>>) -> Skip {
    let slice = lexer.remainder();
    let position = memchr::memchr(b'\n', slice).map_or(slice.len(), |index| index + 1);
    lexer.bump(position);

    Skip
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "4GiB limit enforced by lexer"
)]
pub(crate) fn parse_string<'source>(
    lexer: &mut Lexer<'source, TokenKind<'source>>,
) -> Result<Cow<'source, str>, LexerError> {
    let mut rest = lexer.remainder();
    let value = string::decode(&mut rest).map_err(|error| LexerError::String {
        error,
        range: TextRange::empty(TextSize::new((lexer.source().len() - rest.len()) as u32)),
    })?;

    lexer.bump(lexer.remainder().len() - rest.len());
    Ok(value)
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "4GiB limit enforced by lexer"
)]
pub(crate) fn parse_number<'source>(
    lexer: &mut Lexer<'source, TokenKind<'source>>,
) -> Result<Number<'source>, LexerError> {
    let span = lexer.span();
    // This time we cannot automatically exclude the first character
    let slice = &lexer.source()[span.start..];
    let number = Number::parse(slice).map_err(|mut error| {
        error.range += TextSize::new(span.start as u32);

        LexerError::Number(error)
    })?;

    // The first character is already consumed
    lexer.bump(number.as_str().len() - 1);
    Ok(number)
}
