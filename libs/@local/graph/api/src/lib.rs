#![cfg_attr(doc, doc = include_str!("../README.md"))]
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    impl_trait_in_assoc_type,
    never_type,
    return_type_notation,

    // Library Features
    error_generic_member_access,
)]

extern crate alloc;

pub mod rest;
pub mod rpc;
