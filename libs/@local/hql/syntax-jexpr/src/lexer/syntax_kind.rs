use core::fmt::{self, Display};

use super::token_kind::TokenKind;

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum SyntaxKind {
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

impl SyntaxKind {
    pub(crate) const fn into_u128(self) -> u128 {
        match self {
            Self::String => 1 << 0,
            Self::Number => 1 << 1,
            Self::True => 1 << 2,
            Self::False => 1 << 3,
            Self::Null => 1 << 4,
            Self::Comma => 1 << 5,
            Self::Colon => 1 << 6,
            Self::LBrace => 1 << 7,
            Self::RBrace => 1 << 8,
            Self::LBracket => 1 << 9,
            Self::RBracket => 1 << 10,
        }
    }
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
