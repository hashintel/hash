//! # HashQL Diagnostics
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(cfg_eval, trait_alias)]

extern crate alloc;

pub mod category;
pub mod config;
pub mod diagnostic;
pub mod error;
pub mod help;
pub mod label;
pub mod note;
pub mod severity;
pub mod span;

pub use anstyle as color;

#[cfg(feature = "serde")]
pub(crate) mod encoding;

pub use diagnostic::Diagnostic;
