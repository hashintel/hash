#![feature(cfg_eval)]

pub mod category;
pub mod config;
pub mod diagnostic;
#[cfg(feature = "serde")]
pub(crate) mod encoding;
pub mod file_span;
pub mod help;
pub mod label;
pub mod note;
pub mod severity;

pub use diagnostic::Diagnostic;
