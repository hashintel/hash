use alloc::borrow::Cow;

use json_number::Number;
use logos::Logos;

use crate::{
    error::LexingError,
    parse::{parse_number, parse_string},
};

#[derive(Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Logos)]
#[logos(error = LexingError)]
#[logos(skip r"[ \t\r\n\f]+")]
pub enum TokenKind<'source> {
    #[token("false", |_| false)]
    #[token("true", |_| true)]
    Bool(bool),

    #[token("{")]
    LBrace,

    #[token("}")]
    RBrace,

    #[token("[")]
    LBracket,

    #[token("]")]
    RBracket,

    #[token(":")]
    Colon,

    #[token(",")]
    Comma,

    #[token("null")]
    Null,

    #[regex(r#"[0-9-]"#, parse_number)]
    Number(&'source Number),

    #[token(r#"""#, parse_string)]
    String(Cow<'source, str>),
}
