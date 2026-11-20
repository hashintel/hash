//! # HASH Integrations Ledger
//!
//! Keeps the state of an integration's ledger pipeline in S3. [`Storage`] reads and writes the
//! place of one integration in a bucket, which [`IntegrationNamespace`] derives.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

#[expect(dead_code, reason = "the stage frame is the first caller")]
mod run;
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "Capture is the first caller of upload and download"
    )
)]
mod storage;
#[cfg(test)]
mod testing;

pub use self::{
    run::RunId,
    storage::{IntegrationNamespace, S3Bucket, Storage, StorageError},
};
