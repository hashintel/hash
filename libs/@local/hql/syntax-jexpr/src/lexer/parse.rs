use alloc::{borrow::Cow, sync::Arc};

use hifijson::{SliceLexer, num::LexWrite as _, str::LexAlloc as _};
use hql_span::{TextRange, TextSize};
use json_number::Number;
use logos::Lexer;

use super::{error::LexingError, token_kind::TokenKind};

fn ptr_offset(start: *const u8, current: *const u8) -> usize {
    debug_assert!(current >= start);
    current as usize - start as usize
}

#[expect(
    clippy::cast_possible_truncation,
    reason = "4GiB limit enforced by lexer "
)]
pub(crate) fn parse_string<'source>(
    lexer: &mut Lexer<'source, TokenKind<'source>>,
) -> Result<Cow<'source, str>, LexingError> {
    // the first character is '"' so we can skip it
    let slice = lexer.remainder();
    let mut lex = SliceLexer::new(slice);

    let value = lex.str_string().map_err(|error| {
        let span = lexer.span();
        let consumed = ptr_offset(slice.as_ptr(), lex.as_slice().as_ptr());
        let range = TextRange::empty(TextSize::from((span.end + consumed) as u32));

        LexingError::String {
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
    reason = "4GiB limit enforced by lexer "
)]
pub(crate) fn parse_number<'source>(
    lexer: &mut Lexer<'source, TokenKind<'source>>,
) -> Result<Cow<'source, Number>, LexingError> {
    let span = lexer.span();
    // this time we cannot automatically exclude the first character
    let slice = &lexer.source()[span.start..];
    let mut lex = SliceLexer::new(slice);
    let (value, _) = lex.num_string().map_err(|error| {
        let consumed = ptr_offset(slice.as_ptr(), lex.as_slice().as_ptr());
        let range = TextRange::empty(TextSize::from((span.start + consumed) as u32));

        LexingError::Number {
            error: Arc::new(error),
            range,
        }
    })?;

    let consumed = ptr_offset(slice.as_ptr(), lex.as_slice().as_ptr());

    // the first character is already consumed
    lexer.bump(consumed - 1);

    #[expect(unsafe_code, reason = "already validated to be valid number")]
    // SAFETY: The number is guaranteed to be a valid number
    let number = unsafe { Number::new_unchecked(value) };

    Ok(Cow::Borrowed(number))
}
