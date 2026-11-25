//! # HASH Integrations Ledger
//!
//! Keeps the state of an integration's ledger pipeline in S3. [`Storage`] reads and writes the
//! place of one integration in a bucket, which [`IntegrationNamespace`] derives.
//!
//! [`start`] starts a run of the integration. A run is named by a [`RunId`], which the caller makes
//! once per run, so that a start that failed can be repeated with the same id.
//!
//! [`capture`] is the first stage of a run. It stores the files the run works on, one per table.
//! [`prepare_incremental`] is the second stage for incremental updates. It turns the captured rows
//! into the run's entity changes. [`send`] is the third stage. It writes the changes to the Graph
//! through a [`GraphClient`] and completes the run.
//!
//! A stage that fails says with a [`StageError`] whether running it again can help.
//!
//! ## Workspace dependencies
#![doc = simple_mermaid::mermaid!("../docs/dependency-diagram.mmd")]

extern crate alloc;

mod run;
mod stage;
mod storage;
mod sync_table;
#[cfg(test)]
mod testing;

pub use self::{
    run::{RunId, Stage, StartError, StartInput, start},
    stage::{GraphClient, GraphError, StageError, capture, prepare_incremental, send},
    storage::{IntegrationNamespace, S3Bucket, Storage, StorageError},
};
