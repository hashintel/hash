//! The authority token: one view's sealed identity and state, carried by a client across requests.
//!
//! A token seals what names an authorized view and what was resolved for it: the actor and the
//! filter digest - the visibility proof's identity, since the proof is resolved *over* the filter -
//! beside every view parameter derived at bootstrap, today the delivery-cut offset `k`. All of it
//! is encrypted under a key derived per generation; the tag proves the server minted it. The client
//! holds its token for as long as it wants the view, the server keeps no token state, and
//! re-minting extracts the sealed state from the presented token, so a refresh renews authority
//! without perturbing the view.
//!
//! The filter *document* deliberately does not travel in the token: it is too large to roundtrip,
//! and a digest is not a recoverable form of it - many documents may hash to one value, so treating
//! the digest as the filter would be information loss. The document lives in two places instead:
//! durably with the client, which holds exactly two pieces of state - this token, verified, and
//! its own filter, unverified - and server-side inside the visibility cache entry it was resolved
//! over, which is what lets the soft window revalidate a filtered scope without a client round
//! trip. When an entry has expired, the client re-presents the document, and the sealed digest is
//! the check that it is this view's filter. One actor may hold several active filters as several
//! tokens, distinguished exactly by their digests. The filter may change at a re-manifest - the
//! derived view state carries regardless, so a filter change never perturbs `k` - never in flight:
//! while a run is pinned, delivered state accumulates under one filter, and the boundary where it
//! may change is exactly the boundary where the token re-mints.
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
//! secret arrives as [`SecretHexBytes`], which fixes its width by type, and the derivation runs
//! once, when the authority is built: the authority holds the key, never the secret.
//!
//! # The nonce
//!
//! Sampled per mint from an injected [`TryCryptoRng`] held behind a lock: minting locks for the
//! draw alone and seals outside it, and opening never touches the generator. A nonce is unique per
//! key, because reuse repeats the keystream and the Poly1305 one-time key. `XChaCha20`'s 192-bit
//! width makes sampling a safe way to reach uniqueness, with collision probability below 2⁻³²
//! until roughly 2⁸⁰ mints, and it holds for a fleet of replicas that derive one key per
//! generation from shared configuration.
#![expect(
    clippy::empty_enums,
    reason = "zerocopy's TryFromBytes derive expands to an empty enum for the discriminant check, \
              which is the validation this type exists for"
)]
use core::time::Duration;
use std::{sync::nonpoison::Mutex, time::SystemTime};

use chacha20poly1305::{
    AeadCore, KeyInit as _, KeySizeUser, XChaCha20Poly1305, XNonce,
    aead::{Aead as _, Payload, generic_array::typenum::Unsigned},
};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hkdf::Hkdf;
use rand::{TryCryptoRng, TryRng as _};
use sha2::Sha256;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

use super::{CutOffset, GenerationId, cache::FilterDigest};
use crate::integrity::{SecretHexBytes, Sha256Digest};

/// The HKDF expansion label: one sealed value, one label, versioned in place.
const LABEL: &[u8] = b"atlas.authorization.v0";

/// The token envelope's width: the clear header, the sealed scope, and the AEAD's tag.
///
/// Derived from the layout types and the cipher's own tag size, so it moves when they do.
pub(crate) const TOKEN_BYTES: usize = size_of::<AuthorityHeader>()
    + size_of::<ScopeToken>()
    + <<XChaCha20Poly1305 as AeadCore>::TagSize as Unsigned>::USIZE;

/// The nonce width: the cipher's own.
const NONCE_BYTES: usize = <<XChaCha20Poly1305 as AeadCore>::NonceSize as Unsigned>::USIZE;

/// The sealing key's width: the cipher's own.
const KEY_BYTES: usize = <<XChaCha20Poly1305 as KeySizeUser>::KeySize as Unsigned>::USIZE;

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

/// The sealed plaintext: one view's identity and derived state.
///
/// The [`TokenAuthority`] opening a token supplies the generation, whose key sealed it. The
/// presence byte is the one validated discriminant; every other byte pattern is a valid value,
/// trusted because the tag already vouched for it.
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
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
struct ScopeToken {
    actor: [u8; 16], // NOTE: why is this not a proper type? Why not have this be properly typed?
    filter: FilterPresence,
    /// The filter's digest, zero throughout when [`FilterPresence::Absent`].
    filter_digest: [u8; Sha256Digest::BYTES], /* NOTE: same here. Shouldn't this be a proper
                                               * zerocopy type? */
    /// The delivery-cut offset the view was resolved with.
    k: u8, // NOTE: same here
}

/// One view's sealed identity and state: what a token carries and a mint seals.
///
/// The actor and filter digest name the visibility proof the view answers under; `k` is the state
/// derived for it at bootstrap. A re-mint carries a presented token's `k` forward verbatim, which
/// is what keeps the view stable across a refresh, while the filter digest re-derives from the
/// filter the client presents at that boundary.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
pub(crate) struct Scope {
    // NOTE: I believe most of this could be done w/ a repr(transparent) and deref, similar to what
    // I already have had for ArchivedEntityUuid. Encode in types, don't just transfer between
    // them... that defeats the point of zerocopy.
    /// The actor the view is authorized for.
    pub actor: AuthenticatedActor,
    /// The digest of the filter the view's visibility proof was resolved over, absent when
    /// unfiltered.
    pub filter: Option<FilterDigest>,
    /// The view's delivery-cut offset.
    pub k: CutOffset,
}

/// One refused token, by cause.
///
/// The causes are server-side diagnostics. Every variant answers the client with the same uniform
/// refusal, so a caller learns that it must re-manifest and nothing about why.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum AuthorityError {
    // NOTE: errors always at the top of the file.
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
    /// The token names an actor other than its presenter.
    ///
    /// The tag proves the server minted the token, not that the presenter is its subject; without
    /// this refusal a leaked token would grant any authenticated actor the subject's scope.
    Actor,
}

impl core::fmt::Display for AuthorityError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str(match self {
            Self::Envelope => "the authority token's envelope is malformed",
            Self::Authentication => "the authority token failed authentication",
            Self::Stale => "the authority token's issue time is outside the acceptance window",
            Self::Actor => "the authority token names an actor other than its presenter",
        })
    }
}

impl core::error::Error for AuthorityError {}

/// Mints and opens the authority tokens of one generation.
///
/// The whole judgment context in one value: the generation, its sealing key (derived once, at
/// construction), the acceptance window, and the entropy source - the latter behind its own lock,
/// held for the nonce draw alone, so opening never contends with minting. A token opens under the
/// authority whose generation sealed it, for the actor it names, within the window.
#[derive(Debug)]
pub(crate) struct TokenAuthority<R> {
    // NOTE: doc etiquette
    /// This generation's sealing key.
    ///
    /// The generation itself travels inside it, as the derivation's salt: a foreign generation's
    /// token refuses at the tag, so no generation field needs comparing. As secret as the secret
    /// it derives from, and typed accordingly: redacted rendering, zeroed on drop.
    key: SecretHexBytes<KEY_BYTES>,
    /// The acceptance window: a token older than this at open refuses as stale.
    hard: Duration,
    rng: Mutex<R>,
}

impl<R> TokenAuthority<R>
where
    R: TryCryptoRng,
{
    /// Builds the authority of one generation: key derived from `secret`, tokens accepted for
    /// `hard`, nonces sampled from `rng`.
    pub(crate) fn new<const N: usize>(
        generation: GenerationId,
        secret: &SecretHexBytes<N>,
        hard: Duration,
        rng: R,
    ) -> Self {
        let salt = generation.digest().to_bytes();
        let mut key = [0_u8; KEY_BYTES];

        Hkdf::<Sha256>::new(Some(&salt), secret.as_bytes())
            .expand(LABEL, &mut key)
            .expect("the cipher's key size stays within HKDF-SHA256's expansion bound");

        Self {
            key: SecretHexBytes::new(key),
            hard,
            rng: Mutex::new(rng),
        }
    }

    /// Mints the token naming `scope`, issued at `now`.
    ///
    /// `now` is wall-clock time: a token's age is judged by whichever process opens it, and
    /// [`SystemTime`] is the clock that carries meaning across a process boundary.
    ///
    /// # Errors
    ///
    /// Returns the generator's error when drawing the nonce fails: entropy failure refuses the
    /// mint rather than sealing under a predictable nonce.
    pub(crate) fn mint(&self, scope: Scope, now: SystemTime) -> Result<Vec<u8>, R::Error> {
        let mut nonce = [0_u8; NONCE_BYTES];
        self.rng.lock().try_fill_bytes(&mut nonce)?;

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
            k: scope.k.get(),
        };

        let body = XChaCha20Poly1305::new(self.key.as_bytes().into())
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

        Ok(blob)
    }

    /// Opens `blob` as presented by `actor` at `now`, returning the view state it seals.
    ///
    /// Refuses a token whose issue time is older than the acceptance window at `now`, one dated
    /// after `now`, and one naming an actor other than `actor`. The tag is checked first, so a
    /// rewritten issue time refuses as [`AuthorityError::Authentication`] and only an authentic
    /// token reaches the window and the actor comparison.
    ///
    /// # Errors
    ///
    /// [`AuthorityError::Envelope`] for a blob that is not this format,
    /// [`AuthorityError::Authentication`] when the tag refuses, [`AuthorityError::Stale`] outside
    /// the window, and [`AuthorityError::Actor`] for a presenter the token does not name.
    pub(crate) fn open(
        &self,
        blob: &[u8],
        actor: AuthenticatedActor,
        now: SystemTime,
    ) -> Result<Scope, AuthorityError> {
        let (issued_at, token) = self.unseal(blob)?;

        // NOTE: comment etiquette
        // The window is read after the tag, so every field it judges is one the tag has vouched
        // for.
        if issued_at > now || now.saturating_duration_since(issued_at) >= self.hard {
            return Err(AuthorityError::Stale);
        }

        Self::subject(token, actor)
    }

    /// Reads the view state a presented token carries, for a re-mint.
    ///
    /// The acceptance window is deliberately not judged: an expired token is no longer authority,
    /// but it remains authentic evidence of the view state a past mint sealed, and carrying that
    /// state into a fresh mint is what keeps a view stable across a refresh. The tag and the actor
    /// are still enforced - permissions re-resolve fresh on the request that re-mints, so leniency
    /// here extends no privilege.
    ///
    /// # Errors
    ///
    /// [`AuthorityError::Envelope`] for a blob that is not this format,
    /// [`AuthorityError::Authentication`] when the tag refuses, and [`AuthorityError::Actor`] for
    /// a presenter the token does not name.
    pub(crate) fn carried(
        &self,
        blob: &[u8],
        actor: AuthenticatedActor,
    ) -> Result<Scope, AuthorityError> {
        let (_issued_at, token) = self.unseal(blob)?;

        Self::subject(token, actor)
    }

    /// Parses and authenticates one envelope: the zerocopy casts and the tag, nothing judged.
    fn unseal(&self, blob: &[u8]) -> Result<(SystemTime, ScopeToken), AuthorityError> {
        let sealed =
            SealedAuthority::try_ref_from_bytes(blob).map_err(|_error| AuthorityError::Envelope)?;

        let plaintext = XChaCha20Poly1305::new(self.key.as_bytes().into())
            .decrypt(
                &XNonce::from(sealed.header.nonce),
                Payload {
                    msg: &sealed.body,
                    aad: sealed.header.as_bytes(),
                },
            )
            .map_err(|_error| AuthorityError::Authentication)?;

        let token = ScopeToken::try_read_from_bytes(&plaintext)
            .map_err(|_error| AuthorityError::Envelope)?;

        Ok((
            SystemTime::UNIX_EPOCH + Duration::from_secs(sealed.header.issued_at.get()),
            token,
        ))
    }

    /// Resolves the sealed state for `actor`, refusing a presenter the token does not name.
    fn subject(token: ScopeToken, actor: AuthenticatedActor) -> Result<Scope, AuthorityError> {
        let subject = AuthenticatedActor::Uuid(ActorEntityUuid::new(Uuid::from_bytes(token.actor)));
        if subject != actor {
            return Err(AuthorityError::Actor);
        }

        Ok(Scope {
            actor: subject,
            filter: match token.filter {
                FilterPresence::Present => Some(FilterDigest::from_digest(
                    Sha256Digest::from_bytes_unchecked(token.filter_digest),
                )),
                FilterPresence::Absent => None,
            },
            k: CutOffset::carried(token.k),
        })
    }
}
