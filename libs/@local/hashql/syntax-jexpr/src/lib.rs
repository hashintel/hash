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
    ascii_char
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

    pub fn parse_expr<'source>(&self, source: &[u8]) -> Result<Expr<'heap>, JExprDiagnostic> {
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
