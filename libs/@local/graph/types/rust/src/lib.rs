//! # HASH Graph Types
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(impl_trait_in_assoc_type)]
#![feature(hash_raw_entry)]

extern crate alloc;

pub mod knowledge;
pub mod ontology;

pub mod owned_by_id;

pub mod account;

pub use self::embedding::Embedding;

mod embedding;
