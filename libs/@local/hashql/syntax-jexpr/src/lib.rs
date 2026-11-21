//! # HashQL J-Expr syntax
//!
//! Lossless Rowan concrete syntax tree parser and HashQL AST lowerer for J-Expr.
//!
//! If you just want API documentation, start with [`Parser::parse_expr_cst`] for lossless CST
//! parsing and [`Parser`] for lowering into a [`hashql_ast::node::expr::Expr`].
//!
//! # Example
//!
//! ```
//! use hashql_core::{heap::Heap, span::SpanTable};
//! use hashql_diagnostics::source::SourceId;
//! use hashql_syntax_jexpr::{Parser, cst};
//!
//! let source = r##"{"#literal": 42}"##;
//! let parse = Parser::parse_expr_cst(source);
//! assert!(parse.is_valid());
//! assert!(matches!(parse.tree().item(), Some(cst::Expr::Literal(_))));
//!
//! let heap = Heap::new();
//! let mut spans = SpanTable::new(SourceId::new_unchecked(0));
//! let success = Parser::new(&heap, &mut spans)
//!     .lower_expr(&parse)
//!     .expect("valid literal lowers to an AST expression");
//! assert!(success.advisories.is_empty());
//! ```
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![expect(clippy::indexing_slicing)]
#![cfg_attr(test, feature(decl_macro))]
#![feature(
    // Language Features
    const_trait_impl,

    // Library Features
    ascii_char,
    const_convert,
    portable_simd,
)]

extern crate alloc;

use hashql_ast::node::expr::Expr;
use hashql_core::{
    heap::Heap,
    span::{SpanId, SpanTable},
};
use hashql_diagnostics::Status;

#[cfg(feature = "bench")]
#[doc(hidden)]
pub mod bench;
pub mod cst;
pub(crate) mod embedded;
pub mod error;
pub(crate) mod lexer;
pub(crate) mod lower;
pub(crate) mod parser;
pub(crate) mod pointer;
pub mod span;
pub mod syntax_kind;
pub(crate) mod syntax_kind_set;
#[cfg(test)]
mod tests;

pub use self::{
    error::{JExprDiagnostic, JExprDiagnosticCategory},
    parser::Document,
    span::Span,
};

pub struct Parser<'heap, 'spans> {
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
}

impl<'heap, 'spans> Parser<'heap, 'spans> {
    #[must_use]
    pub const fn new(heap: &'heap Heap, spans: &'spans mut SpanTable<Span>) -> Self {
        Self { heap, spans }
    }

    /// Parses a J-Expr expression document into a lossless CST without lowering.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    #[must_use]
    pub fn parse_expr_cst(source: &str) -> Document<cst::ExprRoot> {
        parser::Parser::<parser::expr::ExprGrammar>::parse_cst(source)
    }

    /// Parses a J-Expr document and lowers it into an arena-allocated HashQL [`Expr`].
    ///
    /// # Errors
    ///
    /// Returns a [`hashql_diagnostics::Failure`] containing all lexical, syntactic, and
    /// embedded-DSL diagnostics collected across the document.
    pub fn parse_expr(
        &mut self,
        source: &str,
    ) -> Status<Expr<'heap>, JExprDiagnosticCategory, SpanId> {
        let parse = Self::parse_expr_cst(source);
        self.lower_expr(&parse)
    }

    /// Lowers a parsed J-Expr CST into an arena-allocated HashQL [`Expr`].
    ///
    /// # Errors
    ///
    /// Returns a [`hashql_diagnostics::Failure`] containing all lexical, syntactic, and
    /// embedded-DSL diagnostics collected across the document.
    pub fn lower_expr(
        &mut self,
        parse: &Document<cst::ExprRoot>,
    ) -> Status<Expr<'heap>, JExprDiagnosticCategory, SpanId> {
        lower::lower_expr(self.heap, self.spans, parse)
    }
}
