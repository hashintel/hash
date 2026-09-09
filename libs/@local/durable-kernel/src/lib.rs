//! The kernel records events in object storage and rebuilds application state
//! from that history after a restart. Snapshots save the state so recovery can
//! begin partway through the journal. Each shard has one writer, and opening
//! a replacement writer prevents the earlier writer from appending.
//!
//! A domain implements the user-facing traits in [`domain`]. Domains that need
//! control over record encoding and recovery implement [`port::Domain`] and
//! use the command loop in [`shard_log`]. The [`runtime`] module runs domains
//! built with [`domain::SimpleDomain`].
//! Storage layout is derived in [`keyspace`]. Record codecs register through
//! [`registry`]. Append and recovery are implemented in [`shard_log`].

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
