use alloc::{borrow::Cow, sync::Arc};

use hashql_core::span::{TextRange, TextSize};
use hifijson::{SliceLexer, str::LexAlloc as _};
use logos::Lexer;

use super::{Number, error::LexerError, token_kind::TokenKind};

fn ptr_offset(start: *const u8, current: *const u8) -> usize {
    debug_assert!(current >= start);
    current as usize - start as usize
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "4GiB limit enforced by lexer"
)]
pub(crate) fn parse_string<'source>(
    lexer: &mut Lexer<'source, TokenKind<'source>>,
) -> Result<Cow<'source, str>, LexerError> {
    // the first character is '"' so we can skip it
    let slice = lexer.remainder();
    let mut lex = SliceLexer::new(slice);

    let value = lex.str_string().map_err(|error| {
        let span = lexer.span();
        let consumed = ptr_offset(slice.as_ptr(), lex.as_slice().as_ptr());
        let range = TextRange::empty(TextSize::from((span.end + consumed) as u32));

        LexerError::String {
            error: Arc::new(error),
            range,
        }
    })?;

    let consumed = ptr_offset(slice.as_ptr(), lex.as_slice().as_ptr());
    lexer.bump(consumed);
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
    let (consumed, number) = Number::parse(slice);

    let number = number.map_err(|mut error| {
        error.range += TextSize::new(span.start as u32);

        LexerError::Number(error)
    })?;

    // The first character is already consumed
    lexer.bump((consumed - 1) as usize);
    Ok(number)
}
