//! Typed CST token wrappers borrowing immutable Rowan green tokens.

use alloc::borrow::Cow;

use super::{SyntaxToken, Token, TypedToken, kind};
use crate::{error::StringError, lexer::decode_quoted, syntax_kind::SyntaxKind};

/// JSON string literal token (`"..."`).
pub type StringToken<'tree> = TypedToken<'tree, kind::String>;

impl<'tree> StringToken<'tree> {
    /// Decodes escape sequences in the string token, borrowing directly when unescaped.
    ///
    /// # Errors
    ///
    /// Returns [`StringError`] if the raw token contains an unescaped control character, invalid
    /// escape sequence, or missing closing quote.
    pub fn decode(self) -> Result<Cow<'tree, str>, StringError> {
        decode_quoted(self.syntax.text())
    }
}

/// JSON number literal token (integer or floating-point).
pub type NumberToken<'tree> = TypedToken<'tree, kind::Number>;

impl NumberToken<'_> {
    /// Reports whether this number token has a fractional part or exponent.
    #[must_use]
    pub fn is_float(self) -> bool {
        self.syntax.text().contains(['.', 'e', 'E'])
    }
}

/// JSON boolean literal token (`true` or `false`).
pub type BoolToken<'tree> = TypedToken<'tree, kind::Bool>;

impl BoolToken<'_> {
    /// Returns the boolean value represented by this token.
    #[must_use]
    pub fn value(self) -> bool {
        self.syntax.kind() == SyntaxKind::True
    }
}

/// JSON `null` literal token.
pub type NullToken<'tree> = TypedToken<'tree, kind::Null>;

/// Concrete primitive token inside a [`super::LiteralValue`].
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum LiteralToken<'tree> {
    /// String primitive token.
    String(StringToken<'tree>),
    /// Number primitive token (integer or floating-point).
    Number(NumberToken<'tree>),
    /// Boolean primitive token.
    Bool(BoolToken<'tree>),
    /// Null primitive token.
    Null(NullToken<'tree>),
}

impl<'tree> Token<'tree> for LiteralToken<'tree> {
    fn can_cast(kind: SyntaxKind) -> bool {
        matches!(
            kind,
            SyntaxKind::String
                | SyntaxKind::Number
                | SyntaxKind::True
                | SyntaxKind::False
                | SyntaxKind::Null
        )
    }

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only primitive literal token kinds cast to LiteralToken"
    )]
    fn cast(syntax: SyntaxToken<'tree>) -> Option<Self> {
        match syntax.kind() {
            SyntaxKind::String => StringToken::cast(syntax).map(Self::String),
            SyntaxKind::Number => NumberToken::cast(syntax).map(Self::Number),
            SyntaxKind::True | SyntaxKind::False => BoolToken::cast(syntax).map(Self::Bool),
            SyntaxKind::Null => NullToken::cast(syntax).map(Self::Null),
            _ => None,
        }
    }

    fn syntax(self) -> SyntaxToken<'tree> {
        match self {
            Self::String(token) => token.syntax(),
            Self::Number(token) => token.syntax(),
            Self::Bool(token) => token.syntax(),
            Self::Null(token) => token.syntax(),
        }
    }
}
