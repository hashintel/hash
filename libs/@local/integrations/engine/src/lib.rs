//! # HASH Integrations Engine
//!
//! Runs an integration's pipelines in DuckDB. Each run has a [`Workspace`], a database file in
//! which the pipelines' queries run.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]
#![feature(
    ip,
    const_array,
    const_closures,
    const_trait_impl,
    type_info,
    variant_count
)]

extern crate alloc;

mod byte_size;
mod capture;
mod entity_id;
mod pipeline;
mod progress;
mod sources;
mod sql;
mod storage;
mod variant_name;
mod workspace;

pub use self::{
    byte_size::ByteSize,
    capture::{CaptureError, SourceCapture},
    entity_id::derive_entity_id,
    pipeline::{
        AssertionFailure, PreparationError, PreparedLink, PreparedPipeline, PreparedSink,
        TableAssertions,
    },
    progress::{Progress, ProgressSnapshot},
    sources::{
        CaptureLimits, CaptureRun, CaptureStore, GraphVaultConfig, GraphVaultSecretStore,
        SecretStore, SecretValue, SourceError, SourceReader,
    },
    storage::{CaptureStorage, S3Bucket},
    workspace::{
        CloseError, DataErrorType, DiskUsageError, OpenError, QueryErrorType, Rows, Setting,
        SnapshotError, StatementError, Workspace, WorkspaceConfig,
    },
};
