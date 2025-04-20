//! # HashQL Abstract Syntax Tree
//!
//! This crate defines the Abstract Syntax Tree (AST) for HashQL, a side-effect free,
//! purely functional query language designed for bi-temporal graph databases.
//!
//! ## Overview
//!
//! The HashQL AST provides a structured representation of HashQL programs after parsing.
//! It captures the hierarchical structure of the code with nodes for expressions, types,
//! and declarations. This AST is the foundation for subsequent compilation phases including
//! type checking, optimization, and evaluation.
//!
//! ## Key Features
//!
//! - **Frontend Agnostic**: The AST is designed to be independent of any particular syntax. While
//!   the current primary interface is through J-Expr (JSON-based expressions), the AST can support
//!   multiple frontend syntaxes.
//!
//! - **Memory Efficient**: Uses arena allocation through a custom [`heap`] module to minimize
//!   allocations and improve performance during parsing and transformation.
//!
//! - **Source Tracking**: Each node maintains its location in the source code via span identifiers.
//!
//! - **Comprehensive Language Model**: Supports the full range of language constructs in HashQL,
//!   including expressions, types, path references, and special forms.
//!
//! ## Core Modules
//!
//! - [`node`]: Defines the AST node types that represent language constructs
//! - [`lowering`]: Defines the lowering process for AST nodes, converting them into a more
//!   optimized form suitable for conversion into the HIR.
//!
//! ## Special Forms
//!
//! HashQL implements several language constructs as "special forms" that are initially parsed
//! as function calls and then transformed into specialized AST nodes. These include:
//!
//! - `let` for variable binding
//! - `if` for conditional expressions
//! - `fn` for closure definitions
//! - `use` for module imports
//! - Field and index access expressions
//!
//! [`heap`]: hashql_core::heap
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    allocator_api,
    box_into_boxed_slice,
    formatting_options,
    never_type,
    decl_macro,
    macro_metavar_expr,
    let_chains
)]
#![cfg_attr(test, feature(assert_matches))]

extern crate alloc;

pub mod error;
pub mod format;
pub mod lowering;
pub mod node;
pub mod visit;
