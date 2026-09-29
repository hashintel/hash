//! # HASH Integrations Engine
//!
//! Runs an integration's pipelines in DuckDB.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

mod sql;

pub use self::sql::{Identifier, StringLiteral};
