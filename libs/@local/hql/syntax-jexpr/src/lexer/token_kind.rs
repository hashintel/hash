use alloc::borrow::Cow;
use core::fmt::{self, Display, Write};

use json_number::Number;
use logos::Logos;

use super::{error::LexingError, syntax_kind::SyntaxKind};
use crate::lexer::parse::{parse_number, parse_string};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Logos)]
#[logos(error = LexingError)]
#[logos(source = [u8])]
#[logos(skip r"[ \t\r\n\f]+")]
pub(crate) enum TokenKind<'source> {
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

impl TokenKind<'_> {
    pub(crate) fn syntax(&self) -> SyntaxKind {
        SyntaxKind::from(self)
    }
}

impl Display for TokenKind<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Bool(bool) => Display::fmt(bool, fmt),
            Self::Null => fmt.write_str("null"),
            Self::LBrace => fmt.write_char('{'),
            Self::RBrace => fmt.write_char('}'),
            Self::LBracket => fmt.write_char('['),
            Self::RBracket => fmt.write_char(']'),
            Self::Colon => fmt.write_char(':'),
            Self::Comma => fmt.write_char(','),
            Self::Number(number) => Display::fmt(number, fmt),
            Self::String(string) => write!(fmt, "\"{string}\""),
        }
    }
}
