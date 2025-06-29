//! # HashQL Diagnostics
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![expect(clippy::indexing_slicing)]
#![feature(trait_alias, variant_count, int_from_ascii)]

extern crate alloc;

pub mod category;
pub mod config;
pub mod diagnostic;
#[cfg(feature = "serde")]
pub mod encoding;
pub mod error;
pub mod help;
pub mod label;
pub mod note;
pub mod severity;
pub mod span;

pub use anstyle as color;

pub use self::{diagnostic::Diagnostic, help::Help, note::Note, severity::Severity};
