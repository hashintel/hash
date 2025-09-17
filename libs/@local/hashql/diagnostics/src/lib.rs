//! # HashQL Diagnostics
//!
//! ## Workspace dependencies
#![cfg_attr(doc, doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd"))]
#![feature(
    // Language Features
    trait_alias,
    never_type,

    // Library Features
    int_from_ascii,
    variant_count,
    try_trait_v2
)]

extern crate alloc;

pub mod category;
pub mod config;
pub mod diagnostic;
#[cfg(feature = "serde")]
pub(crate) mod encoding;
pub mod error;
pub mod help;
pub mod issues;
pub mod label;
pub mod note;
pub mod result;
pub mod severity;
pub mod span;

pub use anstyle as color;

pub use self::{
    diagnostic::Diagnostic,
    help::Help,
    issues::{DiagnosticIssues, DiagnosticSink},
    note::Note,
    result::{DiagnosticError, DiagnosticResult, DiagnosticValue},
    severity::Severity,
};
