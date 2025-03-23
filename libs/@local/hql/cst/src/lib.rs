//! # HashQL HQL
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(allocator_api, box_into_boxed_slice, f16, f128)]
#![cfg_attr(test, feature(assert_matches))]

extern crate alloc;

pub mod heap;
pub mod node;
