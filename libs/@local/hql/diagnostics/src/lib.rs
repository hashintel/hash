#![feature(cfg_eval)]

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

#[cfg(feature = "serde")]
pub(crate) mod encoding;
pub mod rob;

pub use diagnostic::Diagnostic;
