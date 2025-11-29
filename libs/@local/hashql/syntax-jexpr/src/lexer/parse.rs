use alloc::{borrow::Cow, sync::Arc};

use hashql_core::span::{TextRange, TextSize};
use hifijson::{SliceLexer, num::Lex as _, str::LexAlloc as _, token::Lex as _};
use json_number::Number;
use logos::Lexer;

use super::{error::LexerError, token_kind::TokenKind};

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
) -> Result<Cow<'source, Number>, LexerError> {
    let span = lexer.span();
    // This time we cannot automatically exclude the first character
    let slice = &lexer.source()[span.start..];
    let mut consumed = 0;
    let mut lex = SliceLexer::new(slice);

    // The lexer doesn't check for `-` as the first character.
    if slice[0] == b'-' {
        consumed += 1;
        lex.discarded();
    }

    lex.num_foreach(
        #[inline]
        |_| {
            consumed += 1;
        },
    )
    .map_err(|error| {
        let range = TextRange::empty(TextSize::from((span.start + consumed) as u32));

        LexerError::Number {
            error: Arc::new(error),
            range,
        }
    })?;

    // The first character is already consumed
    lexer.bump(consumed - 1);

    debug_assert!(Number::new(&slice[..consumed]).is_ok());

    #[expect(unsafe_code, reason = "already validated to be valid number")]
    // SAFETY: The number is guaranteed to be a valid number
    let number = unsafe { Number::new_unchecked(&slice[..consumed]) };

    Ok(Cow::Borrowed(number))
}
