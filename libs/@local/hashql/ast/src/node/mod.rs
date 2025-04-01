//! Core Abstract Syntax Tree node types for HashQL.
//!
//! This module defines the fundamental building blocks of the HashQL Abstract
//! Syntax Tree (AST). The AST represents the structure of a HashQL program after
//! parsing, capturing all the language constructs in a hierarchical tree structure.
//!
//! ## Module Organization
//!
//! The node module is organized into several submodules:
//!
//! - [`expr`]: Expression nodes representing computations that produce values
//! - [`generic`]: Generic type parameter and argument definitions
//! - [`id`]: Node identifier types and utilities
//! - [`path`]: Path expressions for variable references and qualified names
//! - [`type`]: Type system representations including struct, tuple, and other types
//!
//! ## Memory Management
//!
//! All AST nodes use arena allocation through the `'heap` lifetime parameter,
//! which references the memory region where nodes are allocated. This approach
//! improves performance by minimizing allocations and simplifies memory management
//! during parsing and analysis.
//!
//! ## Node Identification
//!
//! Each node in the AST has a unique [`id::NodeId`] that can be used to track
//! the node through various processing stages. Nodes also include a span identifier that points to
//! the source location of the node.
//!
//! ## AST Structure
//!
//! The AST is structured as a tree with expressions ([`expr::Expr`]) at the core.
//! Other node types like types ([`type::Type`]) and paths ([`path::Path`]) are
//! used as components within expressions or on their own for declarations.
//!
//! The entire tree represents a complete HashQL program or query, ready for
//! analysis, transformation, and evaluation.
pub mod expr;
pub mod generic;
pub mod id;
pub mod path;
pub mod r#type;
