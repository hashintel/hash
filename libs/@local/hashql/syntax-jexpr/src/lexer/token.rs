use text_size::TextRange;

use super::token_kind::TokenKind;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct Token<'source> {
    pub kind: TokenKind<'source>,
    pub span: TextRange,
}

impl<'source> AsRef<Token<'source>> for Token<'source> {
    fn as_ref(&self) -> &Token<'source> {
        self
    }
}
