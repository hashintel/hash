//! # HASH Graph Types
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

pub mod knowledge;
pub mod ontology;

pub use self::embedding::Embedding;

mod embedding;
