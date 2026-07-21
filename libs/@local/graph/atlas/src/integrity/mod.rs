//! Content identity for atlas artifacts.
//!
//! One trust question is answered here: "are these the bytes the metadata meant?" [`Sha256Digest`]
//! is a collision-resistant content identity, computed with [`Sha256`]. A digest pins content:
//! recording it beside a published file commits to the exact artifact bytes, and tooling recomputes
//! and compares digests to detect substitution or bitrot.
//!
//! Torn writes need no checksum: publication is temporary-path-and-rename, so a published file is
//! either absent or complete (see [`crate::file`]).
//!
//! [`Sha256`] implements [`Update`], and [`Writer`] adapts any [`Update`] implementation into
//! [`std::io::Write`], [`tokio::io::AsyncWrite`], and [`Sink`](futures_sink::Sink), so a stream is
//! digested during a copy without buffering it in memory:
//!
//! ```rust
//! use hash_graph_atlas::integrity::{Sha256, Update as _};
//!
//! let mut hasher = Sha256::new();
//! hasher.update(b"abc");
//!
//! assert_eq!(
//!     hasher.finalize().to_string(),
//!     "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
//! );
//! ```
//!
//! # Text encodings
//!
//! [`Sha256Digest`] displays, parses, and serializes as canonical lowercase hexadecimal. Parsing
//! rejects uppercase digits and noncanonical lengths, so values that round-trip through text or
//! JSON are byte-identical.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

mod hash;
mod hex;
mod writer;

pub use self::{
    hash::{Sha256, Sha256Digest},
    hex::ParseHexError,
    writer::{Update, Writer},
};
