//! Stores application events, rebuilds state after a restart, and resumes unfinished work.
//!
//! Start with [`domain`] to define events, state updates, and external operations. Use
//! [`runtime::Kernel`] to open storage and run the application. Each shard has one journal and
//! one writer. [`domain::PartitionKey`] groups related events for routing to a shard.
//!
//! For custom record formats or scheduling, implement the traits in [`port`] and use the
//! [`shard_log`] command loop. [`registry`] manages record formats, [`ids`] computes record
//! identities, and [`keyspace`] defines storage paths.
//!
//! The `customer_sync` and `webhook_relay` examples show external operations and crash recovery:
//!
//! ```text
//! cargo run -p durable-kernel --example customer_sync
//! cargo run -p durable-kernel --example webhook_relay
//! ```
//!
//! The `test-util` feature exposes the simulation tools and direct journal access for tests.

extern crate alloc;

pub mod domain;
pub mod ids;
pub mod keyspace;
pub mod port;
pub mod properties;
pub mod registry;
pub mod routing;
pub mod runtime;
pub mod shard_log;
#[cfg(any(test, feature = "test-util"))]
pub mod sim;

/// Error context for journal storage and record decoding failures.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("durable kernel operation failed")]
pub struct DurableError;
