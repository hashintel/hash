//! # HashQL J-Expr syntax
//!
//! Parser and HashQL AST lowerer for J-Expr.
//!
//! Start with [`Parser`] for parsing a J-Expr document into a [`hashql_ast::node::expr::Expr`] or
//! [`hashql_ast::node::value::Value`], or [`JsonPointers`] for RFC 6901 JSON Pointer resolution.
//! With the `schemars` feature, `schemas` describes both kinds of document as JSON Schemas.
//!
//! # Example
//!
//! ```
//! use std::alloc::Global;
//!
//! use hashql_core::{heap::Heap, span::SpanTable};
//! use hashql_diagnostics::source::SourceId;
//! use hashql_syntax_jexpr::{Parser, ParserOptions};
//!
//! let source = r##"{"#literal": 42}"##;
//! let heap = Heap::new();
//! let mut spans = SpanTable::new(SourceId::new_unchecked(0));
//! let success = Parser::new(&heap, &mut spans, ParserOptions::default())
//!     .parse_expr_in(source, Global)
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
    byte_str,
    const_cmp,
    const_convert,
    portable_simd,
)]

extern crate alloc;

use core::alloc::Allocator;

use hashql_ast::node::{expr::Expr, value::Value};
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
#[cfg(feature = "schemars")]
pub mod schemas;
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

/// Limits that a [`Parser`] enforces on the documents it parses.
#[derive(Debug, Copy, Clone)]
pub struct ParserOptions {
    /// Number of levels a document may nest its arrays and objects.
    ///
    /// Parsing fails for a document that nests deeper. A string counts the levels of its type or
    /// expression on its own, starting from zero at any depth of the document.
    ///
    /// The passes over the AST recurse once per level, and the limit bounds the stack they need.
    ///
    /// 256 by default.
    pub nesting_limit: u16,
}

impl Default for ParserOptions {
    fn default() -> Self {
        Self { nesting_limit: 256 }
    }
}

/// Parser from J-Expr source to the HashQL AST.
pub struct Parser<'heap, 'spans> {
    heap: &'heap Heap,
    spans: &'spans mut SpanTable<Span>,
    options: ParserOptions,
}

impl<'heap, 'spans> Parser<'heap, 'spans> {
    /// Creates a parser that allocates the AST in `heap` and inserts its spans into `spans`.
    #[must_use]
    pub const fn new(
        heap: &'heap Heap,
        spans: &'spans mut SpanTable<Span>,
        options: ParserOptions,
    ) -> Self {
        Self {
            heap,
            spans,
            options,
        }
    }

    /// Parses a J-Expr document into an [`Expr`] alongside an RFC 6901 [`JsonPointers`] resolver.
    ///
    /// # Errors
    ///
    /// Returns a [`hashql_diagnostics::Failure`] containing all lexical, syntactic, and
    /// embedded-DSL diagnostics collected across the document.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    pub fn parse_expr_with_pointers_in<A: Allocator>(
        &mut self,
        source: &str,
        alloc: A,
    ) -> (
        Status<Expr<'heap>, JExprDiagnosticCategory, SpanId>,
        JsonPointers,
    ) {
        let parse = parser::Parser::<parser::expr::ExprGrammar, _>::parse_cst_in(
            source,
            self.options,
            &alloc,
        );
        let status = lower::lower_expr_in(self.heap, self.spans, self.options, &parse, &alloc);
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
    pub fn parse_expr_in<A: Allocator>(
        &mut self,
        source: &str,
        alloc: A,
    ) -> Status<Expr<'heap>, JExprDiagnosticCategory, SpanId> {
        self.parse_expr_with_pointers_in(source, alloc).0
    }

    /// Parses a J-Expr value into a [`Value`] alongside an RFC 6901 [`JsonPointers`] resolver.
    ///
    /// Only primitive literals and compound data constructors (`#literal`, `#struct`, `#tuple`,
    /// `#list`, and `#dict`) are accepted. Type annotations, paths, and function calls are
    /// rejected.
    ///
    /// # Errors
    ///
    /// Returns a [`hashql_diagnostics::Failure`] containing all lexical and syntactic diagnostics
    /// collected across the document.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    pub fn parse_value_with_pointers_in<A: Allocator>(
        &mut self,
        source: &str,
        alloc: A,
    ) -> (
        Status<Value<'heap>, JExprDiagnosticCategory, SpanId>,
        JsonPointers,
    ) {
        let parse = parser::Parser::<parser::value::ValueGrammar, _>::parse_cst_in(
            source,
            self.options,
            &alloc,
        );
        let status = lower::lower_value_in(self.heap, self.spans, self.options, &parse, &alloc);
        (status, JsonPointers::from_green(parse.into_green()))
    }

    /// Parses a J-Expr value into an arena-allocated HashQL [`Value`].
    ///
    /// Only primitive literals and compound data constructors (`#literal`, `#struct`, `#tuple`,
    /// `#list`, and `#dict`) are accepted. Type annotations, paths, and function calls are
    /// rejected.
    ///
    /// # Errors
    ///
    /// Returns a [`hashql_diagnostics::Failure`] containing all lexical and syntactic diagnostics
    /// collected across the document.
    ///
    /// # Panics
    ///
    /// Panics if `source.len()` exceeds `u32::MAX` bytes.
    pub fn parse_value_in<A: Allocator>(
        &mut self,
        source: &str,
        alloc: A,
    ) -> Status<Value<'heap>, JExprDiagnosticCategory, SpanId> {
        self.parse_value_with_pointers_in(source, alloc).0
    }
}
