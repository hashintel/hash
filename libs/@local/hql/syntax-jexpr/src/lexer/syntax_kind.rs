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
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::String => fmt.write_str("string"),
            Self::Number => fmt.write_str("number"),
            Self::True => fmt.write_str("`true`"),
            Self::False => fmt.write_str("`false`"),
            Self::Null => fmt.write_str("`null`"),
            Self::Comma => fmt.write_str("`,`"),
            Self::Colon => fmt.write_str("`:`"),
            Self::LBrace => fmt.write_str("`{`"),
            Self::RBrace => fmt.write_str("`}`"),
            Self::LBracket => fmt.write_str("`[`"),
            Self::RBracket => fmt.write_str("`]`"),
        }
    }
}
