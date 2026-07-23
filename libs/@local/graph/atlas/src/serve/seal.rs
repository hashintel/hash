//! The sealed visibility blob: one scope's bitmap as a self-authenticating value.
//!
//! A visibility bitmap is expensive to evaluate and cheap to carry, so the transport hands it to
//! the client sealed and readmits it on a cache miss without re-evaluating policy. The seal is
//! XChaCha20-Poly1305 over the padded, serialized bitmap with the blob's bindings as associated
//! data: purpose, scope, generation, issue time, and format version. Opening verifies before it
//! trusts - a blob bound to another generation, another purpose, another scope, or an expired
//! clock refuses, and tampered bytes fail the tag. Dense rows renumber per generation, so
//! cross-generation rejection is load-bearing: an old blob against a new generation is not stale
//! policy, it is scrambled authorization, and no remap exists.
//!
//! # Envelope
//!
//! `version u8 | key-id u8 | issued-at seconds u64 LE | nonce 24 B | ciphertext | tag 16 B`. The
//! issue time travels in the clear so the opener can reconstruct the associated data and so a cache
//! can judge staleness without decrypting; the tag binds it, so a forged clock fails
//! authentication. The plaintext is the bitmap in roaring's portable serialization behind a `u32`
//! length prefix, zero-padded to a power-of-two bucket (1 KiB floor): ciphertext length reveals the
//! bucket index, never the cardinality.
//!
//! # Keys
//!
//! One key per generation and purpose: `HKDF-SHA256` over the server secret, salted by the
//! generation identity and expanded under the purpose label. The label separates authorization
//! blobs from filter blobs cryptographically; equal `(secret, generation, purpose)` derive equal
//! keys, so sealed blobs survive server restarts within a generation.

#![expect(
    clippy::little_endian_bytes,
    reason = "envelope integers are pinned little-endian by the wire contract"
)]

use core::time::Duration;

use chacha20poly1305::{
    KeyInit as _, XChaCha20Poly1305, XNonce,
    aead::{Aead as _, Payload},
};
use hkdf::Hkdf;
use roaring::RoaringBitmap;
use sha2::Sha256;

use crate::{file::generation::GenerationId, salt::wire::cbor::CborWriter};

/// The envelope format version this module seals and the only one it opens.
const FORMAT_VERSION: u8 = 1;

/// The key identifier of the sole version-0 key schedule.
const KEY_ID: u8 = 0;

/// The XChaCha20-Poly1305 nonce width.
const NONCE_LEN: usize = 24;

/// The Poly1305 tag width.
const TAG_LEN: usize = 16;

/// The clear envelope header width: version, key id, issue time, and nonce.
const HEADER_LEN: usize = 1 + 1 + 8 + NONCE_LEN;

/// The smallest padded plaintext bucket.
const PAD_FLOOR: usize = 1024;

/// The staleness caps of the sealed-blob clock rule.
///
/// `soft` is the stale-while-revalidate horizon a cache refreshes behind; `hard` is the rejection
/// bound: [`open`] refuses a blob older than it. The pair is the revocation window until the
/// permission epoch replaces the clock, and the manifest publishes both from this struct, so the
/// advertised window cannot disagree with enforcement.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct SealCaps {
    /// The asynchronous-refresh horizon.
    pub soft: Duration,
    /// The rejection bound.
    pub hard: Duration,
}

impl Default for SealCaps {
    fn default() -> Self {
        Self {
            soft: Duration::from_mins(10),
            hard: Duration::from_mins(15),
        }
    }
}

/// The value domain a sealed bitmap serves.
///
/// The purpose selects the HKDF expansion label, so the two domains' keys differ
/// cryptographically: an authorization blob presented as a filter blob fails authentication
/// before any semantic check runs.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum SealPurpose {
    /// A scope's visibility bitmap.
    Authorization,
    /// A promoted filter's row set.
    Filter,
}

impl SealPurpose {
    /// Returns the purpose's HKDF expansion label.
    const fn label(self) -> &'static [u8] {
        match self {
            Self::Authorization => b"atlas.seal.authz.v0",
            Self::Filter => b"atlas.seal.filter.v0",
        }
    }

    /// Returns the purpose's associated-data code.
    const fn code(self) -> u64 {
        match self {
            Self::Authorization => 0,
            Self::Filter => 1,
        }
    }
}

/// The bindings a sealed blob authenticates.
///
/// Every field participates in the associated data, so [`open`] accepts a blob only under the
/// exact bindings it was sealed with. The scope fingerprint names the principal context per the
/// serving specification; the issue time is the interim staleness clock and yields to the
/// permission epoch when that stamp lands.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) struct SealBindings {
    /// The value domain.
    pub purpose: SealPurpose,
    /// The bound scope's fingerprint.
    pub scope: [u8; 32],
    /// The bound generation.
    pub generation: GenerationId,
    /// The issue time since the Unix epoch.
    ///
    /// The wire granularity is whole seconds: sealing truncates sub-second precision.
    pub issued_at: Duration,
}

impl SealBindings {
    /// Encodes the associated data: one canonical CBOR map over the bindings.
    ///
    /// Integer keys ascending, definite lengths - the wire profile's canonical form. Key 0 is the
    /// purpose code, 1 the scope fingerprint, 2 the generation digest, 3 the issue time, 4 the
    /// format version.
    fn associated_data(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        let mut cbor = CborWriter::over(&mut bytes);

        cbor.map(5);
        cbor.uint(0);
        cbor.uint(self.purpose.code());
        cbor.uint(1);
        cbor.bytes(&self.scope);
        cbor.uint(2);
        cbor.bytes(&self.generation.digest().to_bytes());
        cbor.uint(3);
        cbor.uint(self.issued_at.as_secs());
        cbor.uint(4);
        cbor.uint(u64::from(FORMAT_VERSION));

        bytes
    }
}

/// One refused open, by cause.
///
/// The causes are server-side diagnostics: every variant refuses the blob, and the transport's
/// client-visible answer is one uniform state-required refusal regardless of cause.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum SealError {
    /// The envelope is too short, names a foreign format version, or names an unknown key.
    Envelope,
    /// The tag rejected the ciphertext under the expected bindings.
    Authentication,
    /// The issue time is outside the acceptance window: older than the hard cap, or future-dated.
    Stale,
    /// The plaintext violates the framing: length prefix out of bounds, undecodable bitmap, or
    /// nonzero padding.
    Format,
}

impl core::fmt::Display for SealError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str(match self {
            Self::Envelope => "the sealed blob envelope is malformed",
            Self::Authentication => "the sealed blob failed authentication",
            Self::Stale => "the sealed blob's issue time is outside the acceptance window",
            Self::Format => "the sealed blob's plaintext violates the framing",
        })
    }
}

impl core::error::Error for SealError {}

/// Derives the sealing key of one generation and purpose from the server secret.
fn derive_key(secret: &[u8], generation: GenerationId, purpose: SealPurpose) -> [u8; 32] {
    let salt = generation.digest().to_bytes();
    let mut key = [0_u8; 32];
    Hkdf::<Sha256>::new(Some(&salt), secret)
        .expand(purpose.label(), &mut key)
        .expect("32 octets stay within HKDF-SHA256's expansion bound");

    key
}

/// Returns the padded plaintext width of a `framed`-byte payload.
///
/// The next power of two at or above the framed width, floored at 1 KiB: every cardinality in a
/// bucket seals to the same ciphertext length.
const fn padded_len(framed: usize) -> usize {
    framed.next_power_of_two().max(PAD_FLOOR)
}

/// Seals one bitmap under the server secret and its bindings.
///
/// The nonce MUST be fresh per seal: the caller samples it from operating-system entropy. The
/// 24-byte XChaCha20-Poly1305 nonce makes random sampling collision-safe without counter state.
///
/// # Panics
///
/// Panics when the serialized bitmap plus its length prefix exceeds `u32::MAX` bytes, which no
/// `u32` row universe produces.
#[must_use]
pub(crate) fn seal(
    bitmap: &RoaringBitmap,
    bindings: &SealBindings,
    secret: &[u8],
    nonce: &[u8; NONCE_LEN],
) -> Vec<u8> {
    let serialized = bitmap.serialized_size();
    let framed = 4 + serialized;
    let mut plaintext = Vec::with_capacity(padded_len(framed));
    plaintext.extend_from_slice(
        &u32::try_from(serialized)
            .expect("bitmap fits u32")
            .to_le_bytes(),
    );
    bitmap
        .serialize_into(&mut plaintext)
        .expect("serializing into a vector cannot fail");
    plaintext.resize(padded_len(framed), 0);

    let key = derive_key(secret, bindings.generation, bindings.purpose);
    let cipher = XChaCha20Poly1305::new((&key).into());
    let sealed = cipher
        .encrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: &plaintext,
                aad: &bindings.associated_data(),
            },
        )
        .expect("XChaCha20-Poly1305 encryption is infallible for in-memory payloads");

    let mut blob = Vec::with_capacity(HEADER_LEN + sealed.len());
    blob.push(FORMAT_VERSION);
    blob.push(KEY_ID);
    blob.extend_from_slice(&bindings.issued_at.as_secs().to_le_bytes());
    blob.extend_from_slice(nonce);
    blob.extend_from_slice(&sealed);

    blob
}

/// Opens one sealed blob under the bindings the session expects.
///
/// `expected` carries the session-derived bindings - purpose, scope, and generation; the issue
/// time is read from the envelope, bound by the tag, and checked against `now` under the hard
/// cap. Every mismatch refuses: the blob never authenticates the session (the session
/// authenticated already), it only proves the server sealed this bitmap under exactly these
/// bindings.
///
/// # Errors
///
/// Returns the refusal cause; the transport collapses every cause to one client-visible answer.
pub(crate) fn open(
    blob: &[u8],
    purpose: SealPurpose,
    scope: [u8; 32],
    generation: GenerationId,
    secret: &[u8],
    now: Duration,
    caps: SealCaps,
) -> Result<RoaringBitmap, SealError> {
    let (meta, tail) = blob.split_first_chunk::<2>().ok_or(SealError::Envelope)?;
    let (issued_bytes, tail) = tail.split_first_chunk::<8>().ok_or(SealError::Envelope)?;
    let (nonce, sealed) = tail
        .split_first_chunk::<NONCE_LEN>()
        .ok_or(SealError::Envelope)?;
    if sealed.len() < TAG_LEN || meta[0] != FORMAT_VERSION || meta[1] != KEY_ID {
        return Err(SealError::Envelope);
    }
    let issued_at = Duration::from_secs(u64::from_le_bytes(*issued_bytes));
    let age = now.checked_sub(issued_at).ok_or(SealError::Stale)?;
    if age > caps.hard {
        return Err(SealError::Stale);
    }

    let bindings = SealBindings {
        purpose,
        scope,
        generation,
        issued_at,
    };
    let key = derive_key(secret, generation, purpose);
    let cipher = XChaCha20Poly1305::new((&key).into());
    let plaintext = cipher
        .decrypt(
            &XNonce::from(*nonce),
            Payload {
                msg: sealed,
                aad: &bindings.associated_data(),
            },
        )
        .map_err(|_error| SealError::Authentication)?;

    let (prefix, framed) = plaintext
        .split_first_chunk::<4>()
        .ok_or(SealError::Format)?;
    let (body, padding) = framed
        .split_at_checked(u32::from_le_bytes(*prefix) as usize)
        .ok_or(SealError::Format)?;
    if padding.iter().any(|&byte| byte != 0) {
        return Err(SealError::Format);
    }

    RoaringBitmap::deserialize_from(body).map_err(|_error| SealError::Format)
}
