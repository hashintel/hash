//! # HASH Graph Store
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
    never_type,
)]

extern crate alloc;

pub mod account;
pub mod data_type;
pub mod entity;
pub mod entity_type;
pub mod property_type;

pub mod error;
pub mod filter;
pub mod migration;
pub mod pool;
pub mod query;
pub mod subgraph;
