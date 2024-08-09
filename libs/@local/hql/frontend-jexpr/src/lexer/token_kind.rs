use alloc::borrow::Cow;
use core::fmt::{self, Display};

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

impl<'source> TokenKind<'source> {
    pub(crate) fn syntax(&self) -> SyntaxKind {
        SyntaxKind::from(self)
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
            Self::String(string) => write!(f, "\"{string}\""),
        }
    }
}
