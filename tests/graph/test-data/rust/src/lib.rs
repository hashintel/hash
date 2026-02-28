//! Test data for testing the Graph API.
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
    never_type,

    // Library Features
    unwrap_infallible,
)]

extern crate alloc;

pub mod data_type;
pub mod entity;
pub mod entity_type;
pub mod property_type;
pub mod seeding;
