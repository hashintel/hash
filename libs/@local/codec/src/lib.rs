#![cfg_attr(doc, doc = include_str!("../README.md"))]
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]

extern crate alloc;

#[cfg(feature = "bytes")]
pub mod bytes;
#[cfg(feature = "harpc")]
pub mod harpc;
#[cfg(feature = "numeric")]
pub mod numeric;
#[cfg(feature = "serde")]
pub mod serde;
