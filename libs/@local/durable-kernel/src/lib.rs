//! Persists application events and rebuilds state from them after a restart.
//!
//! Each shard has one writer. Opening a replacement writer prevents the old writer from
//! appending. Snapshots let recovery start from saved state and replay the remaining events.
//!
//! Implement [`domain::SimpleDomain`] to use the [`runtime`], or [`port::Domain`] to supply
//! record formats and recovery logic to the [`shard_log`] command loop. [`keyspace`] defines
//! storage paths; [`registry`] checks record declarations and codecs.

extern crate alloc;

use core::fmt;

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

/// Context for storage, envelope, or durable-worker failures.
#[derive(Debug)]
pub struct DurableError;

impl fmt::Display for DurableError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("durable kernel operation failed")
    }
}

impl core::error::Error for DurableError {}
