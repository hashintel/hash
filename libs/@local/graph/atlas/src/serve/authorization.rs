//! The authority token: one view's sealed identity and state, carried by a client across requests.
//!
//! A token seals the [`Scope`] that names an authorized view: the actor, the filter digest - the
//! visibility proof's identity, resolved over the filter at bootstrap - and the view state derived
//! for that proof, today the delivery-cut offset `k`. The plaintext is encrypted under a
//! per-generation key and the tag proves this server minted it. The server keeps no token state:
//! a re-mint reads the sealed state out of the presented token, so a refresh renews authority
//! while the view stays fixed.
//!
//! The filter travels as its digest. The client holds the filter document itself and re-presents
//! it when a server-side entry has expired; the sealed digest is the check that the presented
//! document is this view's filter. One actor may hold several active filters as several tokens,
//! distinguished by their digests. A filter binds at the manifest, where the token re-mints: a
//! pinned run accumulates delivered state under one filter for its whole lifetime.
//!
//! # The envelope
//!
//! `header | ciphertext | trailer`, [`TOKEN_BYTES`] wide, with every field at a fixed offset:
//! [`SealedAuthority`] is the envelope as a type, and a blob resolves into one by a zerocopy cast.
//! The header is [`AuthorityHeader`] in the clear, the ciphertext seals the [`Scope`] itself -
//! the scope is its own byte-level form - and the trailer is Poly1305's tag.
//!
//! The associated data is the header's own bytes, so both sides authenticate an identical form.
//! The clear header is fixed at mint: a rewritten `issued_at` invalidates the tag.
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
use core::{ops::Deref, time::Duration};
use std::{sync::nonpoison::Mutex, time::SystemTime};

use chacha20poly1305::{
    AeadCore, KeyInit as _, KeySizeUser, Tag, XChaCha20Poly1305, XNonce,
    aead::{AeadInPlace as _, generic_array::typenum::Unsigned},
};
use hkdf::Hkdf;
use rand::{TryCryptoRng, TryRng as _};
use sha2::Sha256;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

use super::{CutOffset, GenerationId, cache::FilterDigest};
use crate::integrity::SecretHexBytes;

/// The HKDF expansion label: one sealed value, one label, versioned in place.
const LABEL: &[u8] = b"atlas.authorization.v0";

/// The nonce width: the cipher's own.
const NONCE_BYTES: usize = <<XChaCha20Poly1305 as AeadCore>::NonceSize as Unsigned>::USIZE;

/// The sealing key's width: the cipher's own.
const KEY_BYTES: usize = <<XChaCha20Poly1305 as KeySizeUser>::KeySize as Unsigned>::USIZE;

/// The tag width: the cipher's own.
const TAG_BYTES: usize = <<XChaCha20Poly1305 as AeadCore>::TagSize as Unsigned>::USIZE;

/// One refused token, by cause.
///
/// The causes are server-side diagnostics. Every variant answers the client with the same uniform
/// refusal, so a caller learns that it must re-manifest and nothing about why.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub(crate) enum AuthorityError {
    /// The blob is not this format.
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

/// The token envelope's clear header.
///
/// The format version, the issue time, and the nonce. The tag authenticates them verbatim, which
/// fixes their values at mint.
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

/// The token envelope's trailer: the AEAD's tag over the ciphertext and the clear header.
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
struct AuthorityTrailer {
    tag: [u8; TAG_BYTES],
}

/// The byte-level form of an [`ActorEntityUuid`].
#[derive(
    Debug,
    Copy,
    Clone,
    zerocopy::ByteEq,
    zerocopy::ByteHash,
    zerocopy::IntoBytes,
    zerocopy::FromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(transparent)]
pub(crate) struct ArchivedActorEntityUuid([u8; 16]);

impl From<ActorEntityUuid> for ArchivedActorEntityUuid {
    #[inline]
    fn from(actor: ActorEntityUuid) -> Self {
        Self(Uuid::from(actor).into_bytes())
    }
}

impl Deref for ArchivedActorEntityUuid {
    type Target = ActorEntityUuid;

    #[inline]
    fn deref(&self) -> &Self::Target {
        const {
            assert!(size_of::<Self>() == size_of::<ActorEntityUuid>());
            assert!(align_of::<Self>() == align_of::<ActorEntityUuid>());
        }

        let ptr = &raw const *self;
        // SAFETY: `Self` is `repr(transparent)` over `[u8; 16]`, and the target chain
        // `ActorEntityUuid(EntityUuid)`, `EntityUuid(Uuid)`, `Uuid([u8; 16])` is
        // `repr(transparent)` at every link.
        unsafe { &*ptr.cast::<ActorEntityUuid>() }
    }
}

/// A scope's request filter, by identity.
///
/// The discriminant is the presence and the payload is the digest, one validated field: parsing
/// admits the two written forms and a tampered discriminant refuses as
/// [`AuthorityError::Envelope`]. The absent form carries zeroed payload bytes, so a filter's
/// presence never shows in the envelope's length.
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
pub(crate) enum ScopeFilter {
    Absent([u8; 32]),
    Present(FilterDigest),
}

impl ScopeFilter {
    /// Returns the filter's digest, absent when the scope is unfiltered.
    pub(crate) const fn digest(self) -> Option<FilterDigest> {
        match self {
            Self::Present(digest) => Some(digest),
            Self::Absent(_) => None,
        }
    }
}

impl From<Option<FilterDigest>> for ScopeFilter {
    fn from(filter: Option<FilterDigest>) -> Self {
        filter.map_or(Self::Absent([0; 32]), Self::Present)
    }
}

/// One view's sealed identity and state: what a token carries and a mint seals.
///
/// The actor and filter digest name the visibility proof the view answers under; `k` is the state
/// derived for it at bootstrap. A re-mint carries a presented token's `k` forward verbatim, which
/// is what keeps the view stable across a refresh, while the filter digest re-derives from the
/// filter the client presents at that boundary.
///
/// The scope is its own byte-level form - every field is a zerocopy type - so a mint seals it
/// verbatim and an open reads it in place. The filter discriminant is the one validated byte;
/// every other pattern is a valid value, trusted because the tag already vouched for it.
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
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
#[repr(C)]
pub(crate) struct Scope {
    /// The actor the view is authorized for.
    pub actor: ArchivedActorEntityUuid,
    /// The digest of the filter the view's visibility proof was resolved over, absent when
    /// unfiltered.
    pub filter: ScopeFilter,
    /// The view's delivery-cut offset.
    pub k: CutOffset,
}

impl Scope {
    /// Binds one view's identity and state.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    pub(crate) fn new(actor: ActorEntityUuid, filter: Option<FilterDigest>, k: CutOffset) -> Self {
        Self {
            actor: ArchivedActorEntityUuid::from(actor),
            filter: ScopeFilter::from(filter),
            k,
        }
    }
}

/// One sealed token: the envelope as a type, read in place.
///
/// Every field sits at a fixed offset, so a blob of [`TOKEN_BYTES`] resolves into header,
/// ciphertext, and trailer in one zerocopy cast, and the cast validates the format version.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
    zerocopy::TryFromBytes,
)]
#[repr(C)]
struct SealedAuthority {
    header: AuthorityHeader,
    ciphertext: [u8; size_of::<Scope>()],
    trailer: AuthorityTrailer,
}

impl SealedAuthority {
    const SIZE: usize = size_of::<Self>();
}

/// The token envelope's width: the clear header, the sealed scope, and the tag.
///
/// Derived from the envelope type itself, so it moves when the layout does.
pub(crate) const TOKEN_BYTES: usize = SealedAuthority::SIZE;

/// Mints and opens the authority tokens of one generation.
///
/// The whole judgment context in one value: the generation's sealing key (derived once, at
/// construction), the acceptance window, and the entropy source - the latter behind its own lock,
/// held for the nonce draw alone, so opening never contends with minting. A token opens under the
/// authority whose generation sealed it, for the actor it names, within the window.
#[derive(Debug)]
pub(crate) struct TokenAuthority<R> {
    /// This generation's sealing key.
    ///
    /// Derived once, at construction, with the generation digest as the derivation's salt.
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
    pub(crate) fn mint(
        &self,
        scope: Scope,
        now: SystemTime,
    ) -> Result<[u8; SealedAuthority::SIZE], R::Error> {
        let mut nonce = [0_u8; NONCE_BYTES];
        self.rng.lock().try_fill_bytes(&mut nonce)?;

        let header = AuthorityHeader {
            version: MessageVersion::V0,
            issued_at: U64::new(
                now.saturating_duration_since(SystemTime::UNIX_EPOCH)
                    .as_secs(),
            ),
            nonce,
        };

        let mut blob = [0_u8; SealedAuthority::SIZE];
        header
            .write_to_prefix(&mut blob)
            .expect("the envelope begins with its header");
        scope
            .write_to_prefix(&mut blob[size_of::<AuthorityHeader>()..])
            .expect("the envelope seals the scope past its header");

        let sealed_tag = XChaCha20Poly1305::new(self.key.as_bytes().into())
            .encrypt_in_place_detached(
                XNonce::from_slice(&nonce),
                header.as_bytes(),
                &mut blob[size_of::<AuthorityHeader>()
                    ..size_of::<AuthorityHeader>() + size_of::<Scope>()],
            )
            .unwrap_or_else(|_error| {
                unreachable!("XChaCha20-Poly1305 encryption is infallible for in-memory payloads")
            });

        sealed_tag
            .write_to_suffix(&mut blob)
            .expect("the envelope ends in its tag");

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
        blob: &[u8; TOKEN_BYTES],
        actor: ActorEntityUuid,
        now: SystemTime,
    ) -> Result<Scope, AuthorityError> {
        let (issued_at, scope) = self.unseal(blob)?;

        if issued_at > now || now.saturating_duration_since(issued_at) >= self.hard {
            return Err(AuthorityError::Stale);
        }

        Self::subject(scope, actor)
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
        blob: &[u8; TOKEN_BYTES],
        actor: ActorEntityUuid,
    ) -> Result<Scope, AuthorityError> {
        let (_issued_at, scope) = self.unseal(blob)?;

        Self::subject(scope, actor)
    }

    /// Parses and authenticates one envelope: the zerocopy cast and the tag, nothing judged.
    fn unseal(&self, blob: &[u8; TOKEN_BYTES]) -> Result<(SystemTime, Scope), AuthorityError> {
        let sealed =
            SealedAuthority::try_ref_from_bytes(blob).map_err(|_error| AuthorityError::Envelope)?;

        let mut plaintext = sealed.ciphertext;
        XChaCha20Poly1305::new(self.key.as_bytes().into())
            .decrypt_in_place_detached(
                &XNonce::from(sealed.header.nonce),
                sealed.header.as_bytes(),
                &mut plaintext,
                &Tag::from(sealed.trailer.tag),
            )
            .map_err(|_error| AuthorityError::Authentication)?;

        let scope =
            Scope::try_read_from_bytes(&plaintext).map_err(|_error| AuthorityError::Envelope)?;

        Ok((
            SystemTime::UNIX_EPOCH + Duration::from_secs(sealed.header.issued_at.get()),
            scope,
        ))
    }

    /// Resolves the sealed state for `actor`, refusing a presenter the token does not name.
    fn subject(scope: Scope, actor: ActorEntityUuid) -> Result<Scope, AuthorityError> {
        if scope.actor != ArchivedActorEntityUuid::from(actor) {
            return Err(AuthorityError::Actor);
        }

        Ok(scope)
    }
}
