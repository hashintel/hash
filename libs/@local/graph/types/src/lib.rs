//! # HASH Graph Types
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
)]

extern crate alloc;

pub mod knowledge;
pub mod ontology;

pub use self::embedding::Embedding;

mod embedding;
