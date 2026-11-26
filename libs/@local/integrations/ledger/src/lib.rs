//! # HASH Integrations Ledger
//!
//! Keeps the state of an integration's ledger pipeline in S3. [`Storage`] reads and writes the
//! place of one integration in a bucket, which [`IntegrationNamespace`] derives.
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
