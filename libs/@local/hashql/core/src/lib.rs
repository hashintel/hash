//! # HashQL Core
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(never_type, decl_macro, assert_matches)]

extern crate alloc;

pub mod arena;
pub mod id;
pub mod span;
pub mod symbol;
pub mod r#type;
