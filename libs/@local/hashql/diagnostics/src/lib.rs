//! # HashQL Diagnostics
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    trait_alias,
    const_trait_impl,
    const_convert,

    // Library Features
    variant_count,
    int_from_ascii,
)]

extern crate alloc;

pub mod category;
mod config;
pub mod diagnostic;
#[cfg(feature = "serde")]
pub(crate) mod encoding;
pub mod error;
pub mod issues;
pub mod severity;
pub mod source;
mod status;

pub use anstyle as color;

pub use self::{
    category::DiagnosticCategory,
    config::ReportConfig,
    diagnostic::{Diagnostic, Label},
    issues::{DiagnosticIssues, DiagnosticSink},
    severity::Severity,
    status::{Failure, Status, StatusExt, Success},
};
