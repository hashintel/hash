//! HashQL abstract syntax tree and lowering pipeline.
//!
//! This crate defines the AST for HashQL and the [`lower`] pipeline that
//! transforms it into a form suitable for HIR construction. The AST is
//! frontend-agnostic: nodes are defined independently of any syntax, with
//! J-Expr as the current primary parser.
//!
//! # Modules
//!
//! - [`node`]: AST node types (expressions, types, paths, generics).
//! - [`lower`]: Lowering pipeline (expansion, sanitization, type extraction).
//! - [`visit`]: Visitor trait for AST traversal.
//! - [`format`](mod@format): Debug formatting for AST dumps.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![expect(clippy::indexing_slicing)]
#![feature(
    // Language Features
    coverage_attribute,
    macro_metavar_expr_concat,
    default_field_values,

    // Library Features
    allocator_api,
    formatting_options,
    iter_intersperse,
)]

extern crate alloc;

pub mod error;
pub mod format;
pub mod lower;
pub mod node;
pub mod visit;
