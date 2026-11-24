//! # HASH Integrations Ledger
//!
//! Keeps the state of an integration's ledger pipeline in S3. [`Storage`] reads and writes the
//! place of one integration in a bucket, which [`IntegrationNamespace`] derives.
//!
//! [`start`] starts a run of the integration. A run is named by a [`RunId`], which the caller makes
//! once per run, so that a start that failed can be repeated with the same id.
//!
//! [`capture`] is the first stage of a run. It stores the files the run works on, one per table.
//! A stage that fails says with a [`StageError`] whether running it again can help.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

mod run;
mod stage;
mod storage;
#[cfg_attr(
    not(test),
    expect(dead_code, reason = "Prepare writes the sync table and Send reads it")
)]
mod sync_table;
#[cfg(test)]
mod testing;

pub use self::{
    run::{RunId, Stage, StartError, StartInput, start},
    stage::{StageError, capture},
    storage::{IntegrationNamespace, S3Bucket, Storage, StorageError},
};
