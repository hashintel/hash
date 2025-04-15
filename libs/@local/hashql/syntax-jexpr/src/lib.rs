//! # HashQL J-Expr syntax
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    assert_matches,
    new_range_api,
    box_into_boxed_slice,
    decl_macro,
    portable_simd,
    result_flattening,
    ascii_char,
    if_let_guard,
    variant_count
)]

extern crate alloc;

use alloc::sync::Arc;

use hashql_ast::{heap::Heap, node::expr::Expr};
use hashql_core::span::storage::SpanStorage;

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

pub struct Parser<'heap> {
    heap: &'heap Heap,
    spans: Arc<SpanStorage<Span>>,
}

impl<'heap> Parser<'heap> {
    pub fn new(heap: &'heap Heap, spans: impl Into<Arc<SpanStorage<Span>>>) -> Self {
        Self {
            heap,
            spans: spans.into(),
        }
    }

    /// Parse an expression from a byte slice.
    ///
    /// # Errors
    ///
    /// - Lexer errors if the input contains invalid tokens
    /// - Parser errors if the tokens don't form a valid expression
    /// - Unexpected EOF if the input is incomplete
    pub fn parse_expr(&self, source: &[u8]) -> Result<Expr<'heap>, JExprDiagnostic> {
        let lexer = lexer::Lexer::new(source, Arc::clone(&self.spans));

        let mut state = ParserState::new(self.heap, lexer, Arc::clone(&self.spans));

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
    use alloc::sync::Arc;

    use hashql_ast::{format::SyntaxDump as _, heap::Heap};
    use hashql_core::span::storage::SpanStorage;
    use insta::{assert_snapshot, with_settings};

    use crate::{Parser, test::render_diagnostic};

    /// Helper struct to organize parsing test results
    #[derive(Debug)]
    struct ParseTestResult {
        /// String representation of the syntax tree
        dump: String,
        /// Original input text that was parsed
        input: &'static str,
    }

    /// Attempt to parse an input string and return either a successful result or formatted error
    fn parse_input(input: &'static str) -> Result<ParseTestResult, String> {
        let heap = Heap::new();
        let spans = Arc::new(SpanStorage::new());
        let parser = Parser::new(&heap, Arc::clone(&spans));

        match parser.parse_expr(input.as_bytes()) {
            Ok(expr) => Ok(ParseTestResult {
                dump: expr.syntax_dump_to_string(),
                input,
            }),
            Err(diagnostic) => Err(render_diagnostic(input, diagnostic, &spans)),
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
