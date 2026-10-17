//! # HASH Integrations Engine
//!
//! Runs an integration's pipelines in DuckDB. Each run has a [`Workspace`], a database file in
//! which the pipelines' queries run.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(
    const_array,
    const_closures,
    const_trait_impl,
    type_info,
    variant_count
)]

extern crate alloc;

mod sql;
mod variant_name;
mod workspace;

pub use self::workspace::{
    CloseError, DataErrorType, OpenError, QueryErrorType, Rows, Setting, SnapshotError,
    StatementError, Workspace,
};
