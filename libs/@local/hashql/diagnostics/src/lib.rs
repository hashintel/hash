//! # HashQL Diagnostics
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(
    // Language Features
    const_trait_impl,
    impl_restriction,

    // Library Features
    const_array,
    const_closures,
    const_convert,
    const_default,
    variant_count,
)]

extern crate alloc;

pub mod category;
pub mod diagnostic;
#[cfg(feature = "serde")]
pub(crate) mod encoding;
pub mod issues;
pub mod severity;
pub mod source;
mod status;

pub use anstyle as color;

pub use self::{
    category::DiagnosticCategory,
    diagnostic::{Diagnostic, Label, Message, Patch, Suggestions},
    issues::{DiagnosticIssues, DiagnosticSink},
    severity::Severity,
    source::{Source, Sources},
    status::{Failure, IntoStatus, IteratorStatusExt, Status, StatusExt, Success},
};
