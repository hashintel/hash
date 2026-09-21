//! # HaRPC Types
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(
    // Language Features
    macro_metavar_expr,
)]

pub mod error_code;
pub mod procedure;
pub mod response_kind;
pub mod subsystem;
pub mod version;
