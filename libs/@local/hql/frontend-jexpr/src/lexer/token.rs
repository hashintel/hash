use text_size::TextRange;

use super::token_kind::TokenKind;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct Token<'source> {
    pub kind: TokenKind<'source>,
    pub span: TextRange,
}

impl<'source> Token<'source> {
    #[must_use]
    pub(crate) fn into_owned(self) -> Token<'static> {
        Token {
            kind: self.kind.into_owned(),
            span: self.span,
        }
    }
}
