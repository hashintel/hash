use core::hint::black_box;

use logos::Logos as _;

use crate::lexer::token_kind::TokenKind;

/// Tokenizes the entire input without constructing an AST.
///
/// # Panics
///
/// Panics if the input contains an invalid token.
pub fn tokenize(source: &[u8]) {
    for token in TokenKind::lexer(source) {
        black_box(token.expect("benchmark input should contain only valid tokens"));
    }
}
