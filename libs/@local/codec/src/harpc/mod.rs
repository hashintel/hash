//! HARPC (HASH RPC) protocol related codec implementations.
//!
//! This module provides encoding and decoding functionality for the HARPC protocol,
//! which is used for remote procedure calls within the HASH platform. The wire format
//! uses a binary protocol with a fixed-size header followed by a variable-length payload.
//!
//! The module includes:
//! - Wire protocol codec for serializing and deserializing HARPC messages
//! - Type aliases for working with request and response messages

#![expect(clippy::big_endian_bytes, reason = "This is a protocol requirement")]

pub mod wire;
