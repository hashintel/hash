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

mod byte_size;
mod entity_id;
mod progress;
mod sql;
mod variant_name;
mod workspace;

pub use self::{
    byte_size::ByteSize,
    entity_id::derive_entity_id,
    progress::{Progress, ProgressSnapshot},
    workspace::{
        CloseError, DataErrorType, DiskUsageError, OpenError, QueryErrorType, Rows, Setting,
        SnapshotError, StatementError, Workspace, WorkspaceConfig,
    },
};
