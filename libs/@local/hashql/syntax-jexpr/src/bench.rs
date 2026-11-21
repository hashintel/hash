use core::hint::black_box;

use crate::{
    lexer::Lexer,
    parser::{Parser, expr::ExprGrammar},
};

/// Tokenizes `source` without constructing a syntax tree.
///
/// # Panics
///
/// Panics if the input contains a lexical error.
pub fn tokenize(source: &str) {
    let mut lexer = Lexer::new(source);
    while let Some(token) = lexer.next_token() {
        assert!(
            token.error().is_none(),
            "benchmark input should contain only valid tokens"
        );
        black_box(token.kind);
    }
}

/// Parses `source` into a lossless CST without lowering to an AST.
///
/// # Panics
///
/// Panics if the input contains a syntax error.
pub fn parse_cst(source: &str) {
    let parse = Parser::<ExprGrammar>::parse_cst(source);
    assert!(
        parse.is_valid(),
        "benchmark input should parse without syntax errors"
    );
    black_box(parse);
}
