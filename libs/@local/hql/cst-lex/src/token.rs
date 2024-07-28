use text_size::TextRange;

use crate::kind::TokenKind;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Token<'source> {
    pub kind: TokenKind<'source>,
    pub span: TextRange,
}
