//! Serialization, deserialization, and encoding utilities for the HASH platform.
//!
//! This crate provides various codec implementations and utilities for serializing,
//! deserializing, and encoding data in different formats. The functionality is
//! organized into feature-gated modules:
//!
//! - [`bytes`]: Provides JSON lines encoding/decoding for streaming data
//! - [`harpc`]: Contains codecs for the HaRPC protocol
//! - [`numeric`]: Utilities for handling numeric data types
//! - [`serde`]: Serialization/deserialization utilities and custom formatters
//!
//! Each module is only available when the corresponding feature is enabled.

extern crate alloc;

#[cfg(feature = "bytes")]
pub mod bytes;
#[cfg(feature = "harpc")]
pub mod harpc;
#[cfg(feature = "numeric")]
pub mod numeric;
#[cfg(feature = "serde")]
pub mod serde;
