#![feature(cfg_eval)]

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

pub use diagnostic::Diagnostic;
