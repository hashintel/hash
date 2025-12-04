//! # HashQL J-Expr syntax
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    decl_macro,
    if_let_guard,

    // Library Features
    ascii_char,
    assert_matches,
    box_into_boxed_slice,
    new_range_api,
    portable_simd,
    variant_count,
)]

extern crate alloc;

use hashql_ast::node::expr::Expr;
use hashql_core::{heap::Heap, span::SpanTable};

use self::{
    error::{JExprDiagnostic, JExprDiagnosticCategory, ResultExt as _},
    parser::state::ParserState,
    span::Span,
};

pub mod error;
pub(crate) mod lexer;
pub(crate) mod parser;
pub mod span;
#[cfg(test)]
pub(crate) mod test;

pub struct Parser<'heap, 'spans> {
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
}

impl<'heap, 'spans> Parser<'heap, 'spans> {
    pub const fn new(heap: &'heap Heap, spans: &'spans mut SpanTable<Span>) -> Self {
        Self { heap, spans }
    }

    /// Parse an expression from a byte slice.
    ///
    /// # Errors
    ///
    /// - Lexer errors if the input contains invalid tokens
    /// - Parser errors if the tokens don't form a valid expression
    /// - Unexpected EOF if the input is incomplete
    pub fn parse_expr(&mut self, source: &[u8]) -> Result<Expr<'heap>, JExprDiagnostic> {
        let lexer = lexer::Lexer::new(source);

        let mut state = ParserState::new(self.heap, lexer, self.spans);

        let expr = parser::expr::parse_expr(&mut state)
            .change_category(JExprDiagnosticCategory::Parser)?;

        state
            .finish()
            .change_category(JExprDiagnosticCategory::Parser)?;

        Ok(expr)
    }
}

#[cfg(test)]
mod tests {

    use hashql_ast::format::SyntaxDump as _;
    use hashql_core::{heap::Heap, span::SpanTable};
    use hashql_diagnostics::source::SourceId;
    use insta::{assert_snapshot, with_settings};

    use crate::{Parser, test::render_diagnostic};

    /// Helper struct to organize parsing test results.
    #[derive(Debug)]
    struct ParseTestResult {
        /// String representation of the syntax tree.
        dump: String,
        /// Original input text that was parsed.
        input: &'static str,
    }

    /// Attempt to parse an input string and return either a successful result or formatted error.
    fn parse_input(input: &'static str) -> Result<ParseTestResult, String> {
        let heap = Heap::new();
        let mut spans = SpanTable::new(SourceId::new_unchecked(0x00));
        let mut parser = Parser::new(&heap, &mut spans);

        match parser.parse_expr(input.as_bytes()) {
            Ok(expr) => Ok(ParseTestResult {
                dump: expr.syntax_dump_to_string(),
                input,
            }),
            Err(diagnostic) => Err(render_diagnostic(input, &diagnostic, &spans)),
        }
    }

    #[test]
    fn parse_literal_expression() {
        // Basic test with a literal to validate the pipeline works
        let result = parse_input(r##"{"#literal": 42}"##).expect("should parse simple literal");

        with_settings!({
            description => "End-to-end test of parsing a literal expression"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_complex_nested_expression() {
        // A more complex test that exercises multiple node types
        let result = parse_input(
            r##"["let",
            {"#literal": "x"},
            {"#literal": 10},
            ["if",
                [">", {"#literal": "x"}, {"#literal": 5}],
                {"#struct": {"result": {"#literal": "large"}}},
                {"#struct": {"result": {"#literal": "small"}}}
            ]
            ]"##,
        )
        .expect("should parse complex nested expression");

        with_settings!({
            description => "End-to-end test of parsing a complex nested expression"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, result.dump, &result.input);
        });
    }

    #[test]
    fn parse_invalid_json() {
        // Test error handling in the full pipeline
        let error = parse_input("{invalid").expect_err("should fail on invalid JSON");

        with_settings!({
            description => "End-to-end test of error handling with invalid JSON"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error);
        });
    }

    #[test]
    fn parse_incomplete_expression() {
        // Another error case focusing on unexpected EOF
        let error = parse_input(r#"["incomplete""#).expect_err("should fail on unexpected EOF");

        with_settings!({
            description => "End-to-end test of handling unexpected EOF"
        }, {
            assert_snapshot!(insta::_macro_support::AutoName, error);
        });
    }
}
