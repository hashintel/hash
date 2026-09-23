//! Stores application events, rebuilds state after a restart, and resumes unfinished work.
//!
//! Start with [`domain`] to define events, state updates, and external operations. Use
//! [`runtime::Kernel`] to open storage and run the application. Each shard has one journal and
//! one writer. [`domain::PartitionKey`] groups related events for routing to a shard.
//!
//! For custom record formats or scheduling, implement the traits in [`port`] and use the
//! [`shard_log`] command loop. [`registry`] manages record formats, [`ids`] computes record
//! identities, [`sequence`] defines journal sequences, and [`keyspace`] defines storage paths.
//!
//! The `customer_sync` and `webhook_relay` examples show external operations and crash recovery:
//!
//! ```text
//! cargo run -p durable-kernel --example customer_sync
//! cargo run -p durable-kernel --example webhook_relay
//! ```
//!
//! The `test-util` feature exposes the simulation tools for tests.
#![feature(ascii_char, ascii_char_variants, never_type)]

extern crate alloc;

use core::time::Duration;

use bytes::Bytes;

use crate::sequence::{JournalSequence, SequenceRange};

pub mod domain;
pub mod ids;
pub mod keyspace;
pub mod port;
pub mod properties;
pub mod registry;
pub mod routing;
pub mod runtime;
pub mod sequence;
pub mod shard_log;
#[cfg(any(test, feature = "test-util"))]
pub mod sim;

/// Describes a journal storage, record encoding, or recovery failure.
#[derive(Debug, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum DurableError {
    #[display("could not register record {name}")]
    RegisterRecord { name: &'static str },
    #[display("could not validate registration for record {name}")]
    ValidateRecordRegistration { name: &'static str },
    #[display("could not encode record {name}")]
    EncodeRecord { name: &'static str },
    #[display("could not decode record {name} at sequence {sequence}")]
    DecodeRecord {
        name: &'static str,
        sequence: JournalSequence,
    },
    #[display("could not open journal reader")]
    OpenReader,
    #[display("could not open journal writer")]
    OpenWriter,
    #[display("could not read journal")]
    ReadJournal,
    #[display("could not scan journal key {key:?} in range {range}")]
    Scan { key: Bytes, range: SequenceRange },
    #[display("could not read journal key {key:?} from scan cursor {next_sequence}")]
    ReadRecord {
        key: Bytes,
        /// The first journal sequence the scan has not covered.
        next_sequence: JournalSequence,
    },
    #[display("could not close journal")]
    CloseJournal,
    #[display("journal writer close timed out after {timeout:?}")]
    CloseTimeout { timeout: Duration },
    #[display("could not append journal record")]
    AppendRecord,
    #[display("could not flush journal record")]
    FlushRecord,
    #[display("journal flush timed out after {timeout:?}")]
    FlushTimeout { timeout: Duration },
    #[display("shard writer is unavailable")]
    WriterUnavailable,
    #[display("recovery sequence {sequence} cannot advance past u64::MAX")]
    RecoverySequenceOverflow { sequence: JournalSequence },
    #[display("recovery start {start} is beyond durable end {end}")]
    InvalidRecoveryRange {
        start: JournalSequence,
        end: JournalSequence,
    },
    #[display("record {name} at sequence {sequence} is outside recovery range [{start}, {end})")]
    RecordOutsideRecoveryRange {
        name: &'static str,
        sequence: JournalSequence,
        start: JournalSequence,
        end: JournalSequence,
    },
    #[display("scan of {name} ended at {observed_end}, expected exclusive end {expected_end}")]
    IncompleteScan {
        name: &'static str,
        observed_end: JournalSequence,
        expected_end: JournalSequence,
    },
    #[display("durable sequence subscription closed before reaching {required}")]
    DurabilitySubscriptionClosed { required: JournalSequence },
    #[display(
        "durable sequence did not reach {required} within {attempts} waits of {attempt_timeout:?}"
    )]
    DurabilityTimeout {
        required: JournalSequence,
        attempts: u32,
        attempt_timeout: Duration,
    },
    #[display("unsupported journal key {key:?}")]
    UnsupportedJournalKey { key: Bytes },
}
