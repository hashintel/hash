use alloc::borrow::Cow;
use core::fmt::{self, Display};

use json_number::Number;
use logos::Logos;

use crate::{
    error::LexingError,
    parse::{parse_number, parse_string},
};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Logos)]
#[logos(error = LexingError)]
#[logos(skip r"[ \t\r\n\f]+")]
pub enum TokenKind<'source> {
    #[token("false", |_| false)]
    #[token("true", |_| true)]
    Bool(bool),

    #[token("null")]
    Null,

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

    #[regex(r#"[0-9-]"#, parse_number)]
    Number(Cow<'source, Number>),

    #[token(r#"""#, parse_string)]
    String(Cow<'source, str>),
}

impl<'source> TokenKind<'source> {
    #[must_use]
    pub fn into_owned(self) -> TokenKind<'static> {
        match self {
            Self::Bool(bool) => TokenKind::Bool(bool),
            Self::Null => TokenKind::Null,
            Self::LBrace => TokenKind::LBrace,
            Self::RBrace => TokenKind::RBrace,
            Self::LBracket => TokenKind::LBracket,
            Self::RBracket => TokenKind::RBracket,
            Self::Colon => TokenKind::Colon,
            Self::Comma => TokenKind::Comma,
            Self::Number(number) => TokenKind::Number(Cow::Owned(number.into_owned())),
            Self::String(string) => TokenKind::String(Cow::Owned(string.into_owned())),
        }
    }
}

impl Display for TokenKind<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Bool(bool) => Display::fmt(bool, f),
            Self::Null => f.write_str("null"),
            Self::LBrace => f.write_str("{"),
            Self::RBrace => f.write_str("}"),
            Self::LBracket => f.write_str("["),
            Self::RBracket => f.write_str("]"),
            Self::Colon => f.write_str(":"),
            Self::Comma => f.write_str(","),
            Self::Number(number) => Display::fmt(number, f),
            Self::String(string) => Display::fmt(string, f),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum SyntaxKind {
    String,
    Number,
    True,
    False,
    Null,
    Comma,
    Colon,
    LBrace,
    RBrace,
    LBracket,
    RBracket,
}

impl From<&TokenKind<'_>> for SyntaxKind {
    fn from(token: &TokenKind<'_>) -> Self {
        match token {
            TokenKind::Bool(true) => Self::True,
            TokenKind::Bool(false) => Self::False,
            TokenKind::Null => Self::Null,
            TokenKind::LBrace => Self::LBrace,
            TokenKind::RBrace => Self::RBrace,
            TokenKind::LBracket => Self::LBracket,
            TokenKind::RBracket => Self::RBracket,
            TokenKind::Colon => Self::Colon,
            TokenKind::Comma => Self::Comma,
            TokenKind::Number(_) => Self::Number,
            TokenKind::String(_) => Self::String,
        }
    }
}

impl Display for SyntaxKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::String => f.write_str("string"),
            Self::Number => f.write_str("number"),
            Self::True => f.write_str("`true`"),
            Self::False => f.write_str("`false`"),
            Self::Null => f.write_str("`null`"),
            Self::Comma => f.write_str("`,`"),
            Self::Colon => f.write_str("`:`"),
            Self::LBrace => f.write_str("`{`"),
            Self::RBrace => f.write_str("`}`"),
            Self::LBracket => f.write_str("`[`"),
            Self::RBracket => f.write_str("`]`"),
        }
    }
}
