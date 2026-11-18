//! # HASH Integrations Ledger
//!
//! Applies the incremental updates of a capture to the Graph in three stages:
//!
//! 1. [`capture()`] stores the changed rows of each source.
//! 2. [`prepare()`] turns the changed rows into entity changes and appends them to the sync table.
//! 3. [`send()`] builds the Graph requests from the sync table and sends them in batches.
//!
//! The stages share the state of a run, [`Run`], which is stored as `run.json`. A stage writes
//! its result to storage first and its part of `run.json` second, so a stage that stopped can be
//! run again.
#![feature(variant_count)]
#![expect(
    dead_code,
    unused_variables,
    clippy::needless_pass_by_ref_mut,
    clippy::needless_pass_by_value,
    reason = "the crate is a skeleton for review: every function body is `unimplemented!()`"
)]

extern crate alloc;

mod capture;
pub mod graph;
mod prepare;
pub mod run;
mod send;
mod sync_table;
mod table;

pub use self::{
    capture::{CaptureOutput, CapturedSource, capture},
    prepare::{PrepareOutput, prepare},
    run::{
        BatchSettings, Clock, Code, Current, Failure, Run, RunContext, RunId, RunInput, Stage,
        StageError, SystemClock, start,
    },
    send::{SendCounts, SendOutput, SendProgress, SendSettings, send},
    sync_table::{Change, Operation},
};
