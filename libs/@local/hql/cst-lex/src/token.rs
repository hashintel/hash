use text_size::TextRange;

use crate::kind::TokenKind;

pub struct Token<'source> {
    pub kind: TokenKind<'source>,
    pub span: TextRange,
}
