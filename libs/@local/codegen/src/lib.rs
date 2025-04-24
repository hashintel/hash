//! # HASH Codegen
//!
//! Code generation utilities for the HASH ecosystem.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

use facet::Facet;

/// A facet that provides code generation capabilities.
///
/// The `CodegenFacet` trait extends the `Facet` trait to offer code generation functionality
/// specifically for translating Rust types to TypeScript. This trait is part of a solution for
/// generating TypeScript types from Rust types using a set of transformation rules.
pub trait CodegenFacet<'a>: Facet<'a> {}
