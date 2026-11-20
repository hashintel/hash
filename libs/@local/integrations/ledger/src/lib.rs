//! # HASH Integrations Ledger
//!
//! Runs an integration's ledger pipeline. A run passes through three stages, Capture, Prepare
//! and Send, and each stage keeps its result in the integration's S3 bucket, which [`Storage`]
//! reads and writes.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

#[cfg_attr(
    not(test),
    expect(dead_code, reason = "the run state is the first caller")
)]
mod storage;
#[cfg(test)]
mod testing;

pub use self::storage::{IntegrationNamespace, S3Bucket, Storage, StorageError};
