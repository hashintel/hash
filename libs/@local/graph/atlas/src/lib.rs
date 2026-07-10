//! # HASH Graph Atlas
//!
//! Fits 2D maps over the entity embeddings stored in the HASH Graph, blending semantic
//! similarity (what entities mean) with relational structure (how they connect), and distills
//! each map into a small encoder so that new entities can be placed on existing maps without
//! refitting.
//!
//! This is the Rust home for the functionality prototyped in the `tools/embedding2d` Python
//! tool: sampling embeddings and relations, building the semantic and relational graphs, fitting
//! the alpha ladder of layouts, and distilling the per-level encoders.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    default_field_values,

    // Library Features
    pointer_is_aligned_to,
    future_join
)]
#![expect(
    dead_code,
    clippy::integer_division,
    clippy::integer_division_remainder_used,
    clippy::float_arithmetic,
    clippy::indexing_slicing
)]
pub mod float;
pub mod projection;
