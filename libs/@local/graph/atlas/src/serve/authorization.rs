//! The authority token: one scope, sealed, carried by a client across requests.
//!
//! A token holds the cache key of one authorized view, encrypted under a key derived per
//! generation. A client presenting one names the scope it wants served, and the tag proves the
//! server minted it. The client holds its token for as long as it wants the view, and the server
//! keeps no token state.
//!
//! # The envelope
//!
//! `header | ciphertext | tag`, where the header is [`AuthorityHeader`] in the clear and the tag is
//! Poly1305's. Every field has a fixed width, so reading one is a zerocopy cast:
//! [`SealedAuthority`] resolves a blob into a header and a body in one step, and a blob shorter
//! than a header refuses as [`AuthorityError::Envelope`].
//!
//! The associated data is the header's own bytes, so both sides authenticate an identical form. The
//! clear header is fixed at mint: a rewritten `issued_at` invalidates the tag.
//!
//! The tag authenticates the plaintext, which is where the scope travels.
//!
//! # The key
//!
//! `HKDF-SHA256` over the server secret, salted by the generation digest, expanded under the fixed
//! label `atlas.authorization.v0`. RFC 5869 admits a public and predictable salt, and this one
//! separates generations cryptographically: a token opens under the generation that sealed it. The
//! secret arrives as [`SecretHexBytes`], which fixes its width by type.
//!
//! # The nonce
//!
//! Sampled per mint from an injected [`CryptoRng`]. A nonce is unique per key, because reuse
//! repeats the keystream and the Poly1305 one-time key. `XChaCha20`'s 192-bit width makes sampling
//! a safe way to reach uniqueness, with collision probability below 2⁻³² until roughly 2⁸⁰ mints,
//! and it holds for a fleet of replicas that derive one key per generation from shared
//! configuration.
#![expect(
    clippy::empty_enums,
    reason = "zerocopy's TryFromBytes derive expands to an empty enum for the discriminant check, \
              which is the validation this type exists for"
)]
use core::time::Duration;
use std::time::SystemTime;

use chacha20poly1305::{
    KeyInit as _, XChaCha20Poly1305, XNonce,
    aead::{Aead as _, Payload},
};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hkdf::Hkdf;
use rand::CryptoRng;
use sha2::Sha256;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

use super::{
    GenerationId,
    cache::{FilterDigest, VisibilityKey},
};
use crate::integrity::{SecretHexBytes, Sha256Digest};

/// The HKDF expansion label: one sealed value, one label, versioned in place.
const LABEL: &[u8] = b"atlas.authorization.v0";

/// The XChaCha20-Poly1305 nonce width.
const NONCE_BYTES: usize = 24;

/// The envelope's format version.
///
/// Parsing admits exactly the layout this module writes. Increment on any layout change.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u8)]
enum MessageVersion {
    V0 = 0,
}

/// Whether a scope carries a request filter.
///
/// Parsing admits `0` and `1`, so a tampered presence byte refuses as
/// [`AuthorityError::Envelope`].
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(u8)]
enum FilterPresence {
    Absent = 0,
    Present = 1,
}

/// The token envelope's clear header.
///
/// Thirty-three bytes carrying the format version, the issue time, and the nonce. The tag
/// authenticates them verbatim, which fixes their values at mint.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(C)]
struct AuthorityHeader {
    version: MessageVersion,
    /// The issue time as whole seconds since the Unix epoch.
    ///
    /// The wall clock narrows to seconds at this field, and every signature in this module speaks
    /// [`SystemTime`]. The field's accuracy is bounded by clock agreement between the process that
    /// mints and the process that opens, and the acceptance window it feeds is measured in
    /// minutes. Truncation reads earlier than the instant it records, so a token expires
    /// marginally early.
    issued_at: U64<LE>,
    nonce: [u8; NONCE_BYTES],
}

/// One sealed token, read in place.
///
/// The body is the ciphertext with Poly1305's tag appended, which is the form the AEAD produces and
/// consumes.
#[derive(zerocopy::Immutable, zerocopy::KnownLayout, zerocopy::TryFromBytes)]
#[repr(C)]
struct SealedAuthority {
    header: AuthorityHeader,
    body: [u8],
}

/// The sealed plaintext: the actor and filter identity of one scope.
///
/// The [`Authority`] opening a token supplies the generation, whose key sealed it.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(C)]
struct ScopeToken {
    actor: [u8; 16],
    filter: FilterPresence,
    /// The filter's digest, zero throughout when [`FilterPresence::Absent`].
    filter_digest: [u8; Sha256Digest::BYTES],
}

/// One refused token, by cause.
///
/// The causes are server-side diagnostics. Every variant answers the client with the same uniform
/// refusal, so a caller learns that it must re-manifest and nothing about why.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum AuthorityError {
    /// The blob is not this format.
    ///
    /// Too short for a header, a foreign format version, or an unknown discriminant.
    Envelope,
    /// The tag rejected the ciphertext under the header it arrived with.
    Authentication,
    /// The issue time is outside the acceptance window.
    ///
    /// Older than the hard window, or dated in the future.
    Stale,
}

impl core::fmt::Display for AuthorityError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str(match self {
            Self::Envelope => "the authority token's envelope is malformed",
            Self::Authentication => "the authority token failed authentication",
            Self::Stale => "the authority token's issue time is outside the acceptance window",
        })
    }
}

impl core::error::Error for AuthorityError {}

/// Mints and opens the authority tokens of one generation.
///
/// Holds the generation whose key it derives and the entropy source its nonces come from. A token
/// opens under the authority whose generation sealed it.
#[derive(Debug)]
pub(crate) struct Authority<R> {
    generation: GenerationId,
    rng: R,
}

impl<R> Authority<R>
where
    R: CryptoRng,
{
    /// Builds an authority over one generation, sampling nonces from `rng`.
    pub(crate) const fn new(generation: GenerationId, rng: R) -> Self {
        Self { generation, rng }
    }

    /// Derives this generation's sealing key from the server secret.
    fn key<const N: usize>(&self, secret: &SecretHexBytes<N>) -> [u8; 32] {
        let salt = self.generation.digest().to_bytes();
        let mut key = [0_u8; 32];

        Hkdf::<Sha256>::new(Some(&salt), secret.as_bytes())
            .expand(LABEL, &mut key)
            .expect("32 octets stay within HKDF-SHA256's expansion bound");

        key
    }

    /// Mints the token naming `scope`, issued at `now`.
    ///
    /// `now` is wall-clock time: a token's age is judged by whichever process opens it, and
    /// [`SystemTime`] is the clock that carries meaning across a process boundary.
    pub(crate) fn mint<const N: usize>(
        &mut self,
        secret: &SecretHexBytes<N>,
        scope: VisibilityKey,
        now: SystemTime,
    ) -> Vec<u8> {
        let mut nonce = [0_u8; NONCE_BYTES];
        self.rng.fill_bytes(&mut nonce);

        // The only narrowing of the wall clock in this module: the wire carries an integer.
        let header = AuthorityHeader {
            version: MessageVersion::V0,
            issued_at: U64::new(
                now.saturating_duration_since(SystemTime::UNIX_EPOCH)
                    .as_secs(),
            ),
            nonce,
        };

        let (filter, filter_digest) = scope.filter.map_or(
            (FilterPresence::Absent, [0; Sha256Digest::BYTES]),
            |filter| (FilterPresence::Present, filter.digest().to_bytes()),
        );
        let token = ScopeToken {
            actor: Uuid::from(ActorEntityUuid::from(scope.actor)).into_bytes(),
            filter,
            filter_digest,
        };

        let body = XChaCha20Poly1305::new(&self.key(secret).into())
            .encrypt(
                XNonce::from_slice(&nonce),
                Payload {
                    msg: token.as_bytes(),
                    aad: header.as_bytes(),
                },
            )
            .unwrap_or_else(|_error| {
                unreachable!("XChaCha20-Poly1305 encryption is infallible for in-memory payloads")
            });

        let mut blob = Vec::with_capacity(size_of::<AuthorityHeader>() + body.len());
        blob.extend_from_slice(header.as_bytes());
        blob.extend_from_slice(&body);

        blob
    }

    /// Opens `blob`, returning the scope it names.
    ///
    /// Refuses a token whose issue time is older than `hard` at `now`, and one dated after `now`.
    /// The tag is checked first, so a rewritten issue time refuses as
    /// [`AuthorityError::Authentication`] and only an authentic token reaches the window.
    ///
    /// # Errors
    ///
    /// [`AuthorityError::Envelope`] for a blob that is not this format, [`AuthorityError::Stale`]
    /// outside the window, and [`AuthorityError::Authentication`] when the tag refuses.
    pub(crate) fn open<const N: usize>(
        &self,
        secret: &SecretHexBytes<N>,
        blob: &[u8],
        now: SystemTime,
        hard: Duration,
    ) -> Result<VisibilityKey, AuthorityError> {
        let sealed =
            SealedAuthority::try_ref_from_bytes(blob).map_err(|_error| AuthorityError::Envelope)?;

        let plaintext = XChaCha20Poly1305::new(&self.key(secret).into())
            .decrypt(
                &XNonce::from(sealed.header.nonce),
                Payload {
                    msg: &sealed.body,
                    aad: sealed.header.as_bytes(),
                },
            )
            .map_err(|_error| AuthorityError::Authentication)?;

        // The window is read after the tag, so every field it judges is one the tag has vouched
        // for.
        let issued_at = SystemTime::UNIX_EPOCH + Duration::from_secs(sealed.header.issued_at.get());
        if issued_at > now || now.saturating_duration_since(issued_at) >= hard {
            return Err(AuthorityError::Stale);
        }

        let token = ScopeToken::try_read_from_bytes(&plaintext)
            .map_err(|_error| AuthorityError::Envelope)?;

        Ok(VisibilityKey {
            generation: self.generation,
            actor: AuthenticatedActor::Uuid(ActorEntityUuid::new(Uuid::from_bytes(token.actor))),
            filter: match token.filter {
                FilterPresence::Present => Some(FilterDigest::from_digest(
                    Sha256Digest::from_bytes_unchecked(token.filter_digest),
                )),
                FilterPresence::Absent => None,
            },
        })
    }
}
