//! Benchmark entry points for lexing and CST construction.

use core::hint::black_box;

use crate::{Parser, lexer::Lexer};

/// Tokenizes the entire input using the streaming lexer without constructing a tree.
///
/// # Panics
///
/// Panics if the input contains a lexical error.
pub fn tokenize(source: &str) {
    let mut lexer = Lexer::new(source);
    while let Some(token) = lexer.next_token() {
        assert!(
            token.error.is_none(),
            "benchmark input should contain only valid tokens"
        );
        black_box(token.kind);
    }
}

/// Parses `source` into a lossless J-Expr CST without lowering to HashQL AST.
///
/// # Panics
///
/// Panics if the input contains a syntax error.
pub fn parse_cst(source: &str) {
    let parse = Parser::parse_expr_cst(source);
    assert!(
        parse.is_valid(),
        "benchmark input should parse without syntax errors"
    );
    black_box(parse);
}
