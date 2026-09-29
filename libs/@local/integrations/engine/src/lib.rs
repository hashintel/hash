//! # HASH Integrations Engine
//!
//! Runs an integration's pipelines in DuckDB. Each run has a [`Workspace`], a database file in
//! which the pipelines' statements run.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

mod sql;
mod workspace;

pub use self::{
    sql::{Identifier, StringLiteral},
    workspace::{
        CloseError, OpenError, Rows, SnapshotError, StatementError, Workspace, WorkspaceConfig,
    },
};
