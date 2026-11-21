use alloc::borrow::Cow;

use super::{SyntaxToken, SyntaxTokenData, Token, kind};
use crate::{
    error::StringError, lexer::decode_quoted, syntax_kind::SyntaxKind,
    syntax_kind_set::SyntaxKindSet,
};

pub type StringToken<'tree> = SyntaxToken<'tree, kind::String>;

impl<'tree> StringToken<'tree> {
    /// Decodes JSON escape sequences, borrowing the inner slice directly when no escapes appear.
    ///
    /// # Errors
    ///
    /// Returns [`StringError`] if the token contains an unescaped control character, invalid
    /// escape sequence, or missing closing quote.
    pub fn decode(self) -> Result<Cow<'tree, str>, StringError> {
        decode_quoted(self.syntax.text())
    }
}

pub type NumberToken<'tree> = SyntaxToken<'tree, kind::Number>;

impl NumberToken<'_> {
    /// Reports whether the spelling includes a decimal point or exponent (`1.0` and `1e0` are
    /// floats).
    #[must_use]
    pub fn is_float(self) -> bool {
        memchr::memchr3(b'.', b'e', b'E', self.syntax.text().as_bytes()).is_some()
    }
}

pub type BoolToken<'tree> = SyntaxToken<'tree, kind::Bool>;

impl BoolToken<'_> {
    #[must_use]
    pub fn value(self) -> bool {
        self.syntax.kind() == SyntaxKind::True
    }
}

pub type NullToken<'tree> = SyntaxToken<'tree, kind::Null>;

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum LiteralToken<'tree> {
    String(StringToken<'tree>),
    Number(NumberToken<'tree>),
    Bool(BoolToken<'tree>),
    Null(NullToken<'tree>),
}

impl<'tree> Token<'tree> for LiteralToken<'tree> {
    const SYNTAX_KINDS: crate::syntax_kind_set::SyntaxKindSet = SyntaxKindSet::from_union(&[
        StringToken::SYNTAX_KINDS,
        NumberToken::SYNTAX_KINDS,
        BoolToken::SYNTAX_KINDS,
        NullToken::SYNTAX_KINDS,
    ]);

    #[expect(
        clippy::wildcard_enum_match_arm,
        reason = "only primitive literal token kinds cast to LiteralToken"
    )]
    fn cast(syntax: SyntaxTokenData<'tree>) -> Option<Self> {
        match syntax.kind() {
            SyntaxKind::String => StringToken::cast(syntax).map(Self::String),
            SyntaxKind::Number => NumberToken::cast(syntax).map(Self::Number),
            SyntaxKind::True | SyntaxKind::False => BoolToken::cast(syntax).map(Self::Bool),
            SyntaxKind::Null => NullToken::cast(syntax).map(Self::Null),
            _ => None,
        }
    }

    fn syntax(self) -> SyntaxTokenData<'tree> {
        match self {
            Self::String(token) => token.syntax(),
            Self::Number(token) => token.syntax(),
            Self::Bool(token) => token.syntax(),
            Self::Null(token) => token.syntax(),
        }
    }
}
