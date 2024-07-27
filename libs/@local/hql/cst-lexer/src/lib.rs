use std::{borrow::Cow, sync::Arc};

use hifijson::{num::LexWrite, str::LexAlloc, SliceLexer};
use json_number::Number;
use logos::{Lexer, Logos};

#[derive(Debug, Clone, PartialEq, Eq, Default, thiserror::Error)]
enum LexingError {
    #[error("malformed JSON string: {0}")]
    String(Arc<hifijson::str::Error>),

    #[error("malformed JSON number: {0:?}")]
    Number(Arc<hifijson::num::Error>),

    #[error("unknown error")]
    #[default]
    Unknown,
}

impl From<hifijson::str::Error> for LexingError {
    fn from(error: hifijson::str::Error) -> Self {
        Self::String(Arc::new(error))
    }
}

impl From<hifijson::num::Error> for LexingError {
    fn from(error: hifijson::num::Error) -> Self {
        Self::Number(Arc::new(error))
    }
}

fn ptr_distance<T>(start: *const T, end: *const T) -> usize {
    (end as usize) - (start as usize)
}

fn parse_string<'source>(
    lexer: &mut Lexer<'source, Token<'source>>,
) -> Result<Cow<'source, str>, LexingError> {
    // the first character is '"' so we can skip it
    let span = lexer.span();
    let mut slice = lexer.remainder();
    let mut lex = SliceLexer::new(slice.as_bytes());
    let value = lex.str_string()?;

    let consumed = ptr_distance(slice.as_ptr(), lex.as_ptr());
    lexer.bump(consumed);
    Ok(value)
}

fn parse_number<'source>(
    lexer: &mut Lexer<'source, Token<'source>>,
) -> Result<&'source Number, LexingError> {
    let span = lexer.span();
    // this time we cannot automatically exclude the first character
    let slice = lexer.source()[span.start..].as_bytes();
    let mut lex = SliceLexer::new(slice);
    let (value, _) = lex.num_string()?;

    // the last character of the number is also a reference to the pointer
    let end = value
        .as_bytes()
        .last()
        .expect("infallible; number is always at least a single character");

    let consumed = ptr_distance(slice.as_ptr(), end as *const u8);
    lexer.bump(consumed);

    #[expect(unsafe_code, reason = "already validated to be valid number")]
    // SAFETY: The number is guaranteed to be a valid number
    let number = unsafe { Number::new_unchecked(value) };

    Ok(number)
}

#[derive(Debug, Logos)]
#[logos(error = LexingError)]
#[logos(skip r"[ \t\r\n\f]+")]
enum Token<'source> {
    #[token("false", |_| false)]
    #[token("true", |_| true)]
    Bool(bool),

    #[token("{")]
    BraceOpen,

    #[token("}")]
    BraceClose,

    #[token("[")]
    BracketOpen,

    #[token("]")]
    BracketClose,

    #[token(":")]
    Colon,

    #[token(",")]
    Comma,

    #[token("null")]
    Null,

    #[token("-", parse_number)]
    #[token("0", parse_number)]
    #[token("1", parse_number)]
    #[token("2", parse_number)]
    #[token("3", parse_number)]
    #[token("4", parse_number)]
    #[token("5", parse_number)]
    #[token("6", parse_number)]
    #[token("7", parse_number)]
    #[token("8", parse_number)]
    #[token("9", parse_number)]
    Number(&'source Number),

    #[token(r#"""#, parse_string)]
    String(Cow<'source, str>),
}
