#![feature(cfg_eval)]

pub mod category;
pub mod diagnostic;
#[cfg(feature = "serde")]
pub(crate) mod encoding;
pub mod label;
pub mod note;
pub mod severity;
pub mod source;

pub use diagnostic::Diagnostic;
