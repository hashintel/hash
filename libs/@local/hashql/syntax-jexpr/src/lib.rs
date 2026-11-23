//! # HashQL J-Expr syntax
//!
//! Parser and HashQL AST lowerer for J-Expr.
//!
//! Start with [`Parser`] for parsing a J-Expr document into a [`hashql_ast::node::expr::Expr`],
//! or [`JsonPointers`] for RFC 6901 JSON Pointer resolution.
//!
//! # Example
//!
//! ```
//! use hashql_core::{heap::Heap, span::SpanTable};
//! use hashql_diagnostics::source::SourceId;
//! use hashql_syntax_jexpr::Parser;
//!
//! let source = r##"{"#literal": 42}"##;
//! let heap = Heap::new();
//! let mut spans = SpanTable::new(SourceId::new_unchecked(0));
//! let success = Parser::new(&heap, &mut spans)
//!     .parse_expr(source)
//!     .expect("valid literal parses to an AST expression");
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
    bstr,
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
pub(crate) mod cst;
pub(crate) mod embedded;
pub mod error;
pub(crate) mod lexer;
pub(crate) mod lower;
pub(crate) mod parser;
pub(crate) mod pointer;
pub mod span;
pub(crate) mod stack;
pub(crate) mod syntax_kind;
pub(crate) mod syntax_kind_set;
#[cfg(test)]
mod tests;

pub use self::{
    error::{JExprDiagnostic, JExprDiagnosticCategory},
    pointer::JsonPointers,
    span::Span,
};

/// Parser from J-Expr source to the HashQL AST.
///
/// The parser reports every syntax error it finds in a document. A document nested more than 256
/// levels deep is rejected, whether the nesting is in its arrays and objects or inside one of
/// its type and expression strings.
pub struct Parser<'heap, 'spans> {
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
}

impl<'heap, 'spans> Parser<'heap, 'spans> {
    #[must_use]
    pub const fn new(heap: &'heap Heap, spans: &'spans mut SpanTable<Span>) -> Self {
        Self { heap, spans }
    }

    /// Parses a J-Expr document into an [`Expr`] alongside an RFC 6901 [`JsonPointers`] resolver.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    pub fn parse_expr_with_pointers(
        &mut self,
        source: &str,
    ) -> (
        Status<Expr<'heap>, JExprDiagnosticCategory, SpanId>,
        JsonPointers,
    ) {
        let parse = parser::Parser::<parser::expr::ExprGrammar>::parse_cst(source);
        let status = lower::lower_expr(self.heap, self.spans, &parse);
        (status, JsonPointers::from_green(parse.into_green()))
    }

    /// Parses a J-Expr document and lowers it into an arena-allocated HashQL [`Expr`].
    ///
    /// # Errors
    ///
    /// Returns a [`hashql_diagnostics::Failure`] containing all lexical, syntactic, and
    /// embedded-DSL diagnostics collected across the document.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    pub fn parse_expr(
        &mut self,
        source: &str,
    ) -> Status<Expr<'heap>, JExprDiagnosticCategory, SpanId> {
        self.parse_expr_with_pointers(source).0
    }
}
