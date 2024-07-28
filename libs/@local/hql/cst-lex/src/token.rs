use text_size::TextRange;

use crate::kind::TokenKind;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Token<'source> {
    pub kind: TokenKind<'source>,
    pub span: TextRange,
}

impl<'source> Token<'source> {
    #[must_use]
    pub fn into_owned(self) -> Token<'static> {
        Token {
            kind: self.kind.into_owned(),
            span: self.span,
        }
    }
}
