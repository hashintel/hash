//! Integrity and authenticity primitives for atlas artifacts.
//!
//! This module answers three different trust questions about bytes, each
//! with the cheapest primitive that actually answers it:
//!
//! - "Are these the bytes the manifest meant?" [`Sha256Digest`] is a collision-resistant content
//!   identity, computed with [`Sha256`]. A digest pins content: recording it in a manifest commits
//!   to the exact artifact bytes.
//! - "Did these bytes survive storage and transport?" [`Crc64`] computes a CRC-64/NVME checksum, a
//!   fast 64-bit corruption check for framing on-disk artifacts. It detects accidental damage only;
//!   anyone who can choose the bytes can forge it.
//! - "Did the right party produce these bytes?" [`Signer`] and [`Verifier`] are an Ed25519 key
//!   pair. A [`Signature`] binds a message to the holder of the secret key, and verification is
//!   pinned to one exact public key.
//!
//! The primitives compose upward: checksum storage frames so readers reject
//! torn pages before interpreting them, digest artifacts so manifests can
//! name their contents, and sign the digests so consumers can authenticate
//! the producer without rehashing anything.
//!
//! Both accumulators implement [`Update`], and [`Writer`] adapts any
//! [`Update`] implementation into [`std::io::Write`],
//! [`tokio::io::AsyncWrite`], and [`futures::Sink`], so a stream can be
//! digested or checksummed during a copy without buffering it in memory.
//!
//! # Text encodings
//!
//! Every fixed-width value ([`Sha256Digest`], [`Signature`], and the
//! [`Verifier`] public key) displays, parses, and serializes as canonical
//! lowercase hexadecimal. Parsing rejects uppercase digits and noncanonical
//! lengths, so values that round-trip through text or JSON are
//! byte-identical.
#![expect(clippy::empty_enums, reason = "zerocopy uses them in the derive")]

mod crc;
mod hash;
mod hex;
mod sign;
mod writer;

pub use self::{
    crc::Crc64,
    hash::{Sha256, Sha256Digest},
    hex::ParseHexError,
    sign::{
        InvalidPublicKeyError, InvalidSignatureError, ParseVerifierError, Signature, Signer,
        Verifier,
    },
    writer::{Update, Writer},
};
