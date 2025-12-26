use alloc::borrow::Cow;
use core::fmt::{self, Display, Write as _};

use logos::Logos;

use super::{Number, error::LexerError, syntax_kind::SyntaxKind};
use crate::lexer::parse::{parse_number, parse_string};

// https://github.com/maciejhirsz/logos/issues/133#issuecomment-619444615
#[derive(Debug, Clone, PartialEq, Eq, Hash, Logos)]
#[logos(error = LexerError)]
#[logos(utf8 = false)]
#[logos(skip r"[ \t\r\n\f]+")]
#[logos(skip r"//[^\n]*")]
#[logos(skip r"/\*(?:[^*]|\*[^/])*\*/")]
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
    Number(Number<'source>),

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
            Self::String(string) => write!(
                fmt,
                "\"{}\"",
                string.replace('\\', "\\\\").replace('"', "\\\"")
            ),
        }
    }
}
