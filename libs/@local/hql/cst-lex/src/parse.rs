use alloc::borrow::Cow;

use hifijson::{num::LexWrite, offset::Offset, str::LexAlloc, SliceLexer};
use json_number::Number;
use logos::Lexer;

use crate::{error::LexingError, token_kind::TokenKind};

pub(crate) fn parse_string<'source>(
    lexer: &mut Lexer<'source, TokenKind<'source>>,
) -> Result<Cow<'source, str>, LexingError> {
    // the first character is '"' so we can skip it
    let slice = lexer.remainder();
    let mut lex = SliceLexer::new(slice.as_bytes());
    let value = lex.str_string()?;

    let consumed = lex.offset_from(&slice.as_bytes());
    lexer.bump(consumed);
    Ok(value)
}

#[expect(clippy::string_slice, reason = "UTF-8 boundary is always valid")]
pub(crate) fn parse_number<'source>(
    lexer: &mut Lexer<'source, TokenKind<'source>>,
) -> Result<Cow<'source, Number>, LexingError> {
    let span = lexer.span();
    // this time we cannot automatically exclude the first character
    let slice = lexer.source()[span.start..].as_bytes();
    let mut lex = SliceLexer::new(slice);
    let (value, _) = lex.num_string()?;

    let consumed = lex.offset_from(&slice);
    // the first character is already consumed
    lexer.bump(consumed - 1);

    #[expect(unsafe_code, reason = "already validated to be valid number")]
    // SAFETY: The number is guaranteed to be a valid number
    let number = unsafe { Number::new_unchecked(value) };

    Ok(Cow::Borrowed(number))
}
