//! The authority token, which this server seals and a client carries across requests.
//!
//! A token seals the [`Scope`] that names an authorized view. The scope holds the actor, the filter
//! digest (the visibility proof's identity, resolved over the filter at bootstrap), and the view
//! state derived for that proof, the delivery-cut offset `k`. A per-generation key encrypts the
//! plaintext, and the tag proves this server issued it. The server keeps no token state: a renewal
//! reads the sealed state out of the presented token. A refresh renews authority while the view
//! stays fixed.
//!
//! The filter travels as its digest. The client holds the filter document itself and re-presents it
//! when a server-side entry has expired. The sealed digest is the check that the presented document
//! is this view's filter. An actor with more than one active filter holds one token per filter, and
//! the digests tell them apart. A filter binds at the manifest, where the token renews, and a
//! pinned run accumulates delivered state under one filter for its whole lifetime.
//!
//! # The envelope
//!
//! `header | ciphertext | trailer`, [`TOKEN_BYTES`] wide, with every field at a fixed offset:
//! [`SealedAuthority`] is the envelope as a type, and a blob resolves into one by a zerocopy cast.
//! The header is [`AuthorityHeader`] in the clear, the ciphertext seals [`SealedState`] - the
//! scope and the authority's delta epoch, each its own byte-level form - and the trailer is
//! Poly1305's tag.
//!
//! The associated data is the header's own bytes, the identical form on both sides. The clear
//! header stays as issued, because a rewritten `issued_at` invalidates the tag.
//!
//! # The key
//!
//! The key comes from `HKDF-SHA256` over the server secret, with the generation digest as the salt
//! and the fixed label `atlas.authorization.v1` as the expansion label. RFC 5869 admits a public
//! and predictable salt, and this one separates generations cryptographically: a token opens only
//! under the generation that sealed it. The secret arrives as [`SecretHexBytes`], which fixes
//! its width by type. The derivation runs once, when this module constructs the authority, and the
//! authority keeps only the key, never the secret.
//!
//! # The epoch
//!
//! The sealed state carries the delta epoch the authority held at issuance, absent for a process
//! serving without a delta consumer. Every open compares the sealed value against the held one
//! and refuses any other, the renewal read included, because slot assignment is process-local: a
//! token issued beside one delta register must not authorize reads over another. The refusal is
//! the same uniform answer as every other cause, and the client's remedy is the same fresh
//! manifest, which issues under the held epoch. A process serving with no delta consumer holds the
//! absent form, and its tokens survive restarts.
//!
//! # The nonce
//!
//! Each issuance samples the nonce from an injected [`TryCryptoRng`] behind a lock. Issuing locks
//! for the draw alone and seals outside it, and opening never touches the generator. A nonce is
//! unique per key, because reuse repeats the keystream and the Poly1305 one-time key. `XChaCha20`'s
//! 192-bit width makes sampling a safe way to reach that uniqueness. Collision probability stays
//! below 2⁻³² until about 2⁸⁰ issued tokens, and the same bound covers a fleet of replicas that
//! derive one key per generation from shared configuration.
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
use type_system::principal::actor::{ActorEntityUuid, ActorId, AiId, MachineId, UserId};
use uuid::Uuid;
use zerocopy::{IntoBytes as _, LE, TryFromBytes as _, U64};

use super::{CutOffset, cache::scope::FilterDigest, delta::DeltaEpoch};
use crate::{file::generation::GenerationId, integrity::SecretHexBytes};

/// The HKDF expansion label, versioned in place for the one value this module seals.
const LABEL: &[u8] = b"atlas.authorization.v1";

/// The nonce width: the cipher's own.
const NONCE_BYTES: usize = <<XChaCha20Poly1305 as AeadCore>::NonceSize as Unsigned>::USIZE;

/// The sealing key's width: the cipher's own.
const KEY_BYTES: usize = <<XChaCha20Poly1305 as KeySizeUser>::KeySize as Unsigned>::USIZE;

/// The tag width: the cipher's own.
const TAG_BYTES: usize = <<XChaCha20Poly1305 as AeadCore>::TagSize as Unsigned>::USIZE;

/// One refused token, by cause.
///
/// The causes are server-side diagnostics. Every variant answers the client with the same uniform
/// refusal. A caller learns that it must re-manifest and nothing about why.
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
    /// The tag proves the server created the token, not that the presenter is its subject. Without
    /// this refusal a leaked token would grant any authenticated actor the subject's scope.
    Actor,
    /// The token seals a delta epoch other than the held one.
    ///
    /// Slot assignment is process-local, so authority issued beside one delta register must not
    /// reach another.
    Epoch,
}

impl core::fmt::Display for AuthorityError {
    fn fmt(&self, fmt: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        fmt.write_str(match self {
            Self::Envelope => "the authority token's envelope is malformed",
            Self::Authentication => "the authority token failed authentication",
            Self::Stale => "the authority token's issue time is outside the acceptance window",
            Self::Actor => "the authority token names an actor other than its presenter",
            Self::Epoch => "the authority token seals a delta epoch other than the held one",
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
    V1 = 1,
}

/// The token envelope's clear header.
///
/// The format version, the issue time, and the nonce. The tag authenticates them verbatim, which
/// fixes their values at issuance.
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
    /// The wall clock narrows to seconds at this field. Every signature in this module speaks
    /// [`SystemTime`]. Clock agreement between the process that issues and the process that opens
    /// bounds the field's accuracy, and the acceptance window it feeds spans minutes. Truncation
    /// reads earlier than the instant it records, and a token expires marginally early.
    issued_at: U64<LE>,
    nonce: [u8; NONCE_BYTES],
}

/// The token envelope's trailer, the AEAD's tag over the ciphertext and the clear header.
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

/// A sealed actor's kind.
///
/// The discriminant half of [`ArchivedActorId`], one validated byte: parsing refuses every value
/// outside the principal kinds.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::TryFromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(u8)]
pub(crate) enum ArchivedActorType {
    User,
    Machine,
    Ai,
}

/// A sealed actor identity holding the kind beside the uuid, the byte-level form of an
/// [`ActorId`].
///
/// The `From` conversions are the only writers, so equality over both fields is exact.
#[derive(
    Debug,
    Copy,
    Clone,
    PartialEq,
    Eq,
    zerocopy::IntoBytes,
    zerocopy::TryFromBytes,
    zerocopy::Immutable,
    zerocopy::Unaligned,
    zerocopy::KnownLayout,
)]
#[repr(C)]
pub(crate) struct ArchivedActorId {
    pub r#type: ArchivedActorType,
    pub id: ArchivedActorEntityUuid,
}

impl From<ActorId> for ArchivedActorId {
    fn from(value: ActorId) -> Self {
        match value {
            ActorId::User(uuid) => Self {
                r#type: ArchivedActorType::User,
                id: ArchivedActorEntityUuid::from(ActorEntityUuid::new(uuid)),
            },
            ActorId::Machine(uuid) => Self {
                r#type: ArchivedActorType::Machine,
                id: ArchivedActorEntityUuid::from(ActorEntityUuid::new(uuid)),
            },
            ActorId::Ai(uuid) => Self {
                r#type: ArchivedActorType::Ai,
                id: ArchivedActorEntityUuid::from(ActorEntityUuid::new(uuid)),
            },
        }
    }
}

impl From<ArchivedActorId> for ActorId {
    fn from(value: ArchivedActorId) -> Self {
        match value.r#type {
            ArchivedActorType::User => Self::User(UserId::new(*value.id)),
            ArchivedActorType::Machine => Self::Machine(MachineId::new(*value.id)),
            ArchivedActorType::Ai => Self::Ai(AiId::new(*value.id)),
        }
    }
}

/// A scope's request filter, by identity.
///
/// The discriminant is the presence and the payload is the digest, one validated field: parsing
/// admits the two written forms and a tampered discriminant refuses as
/// [`AuthorityError::Envelope`]. The absent form zeroes its payload bytes, and a filter's presence
/// never shows in the envelope's length.
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
    /// Returns the filter's digest, absent when the scope names no filter.
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

/// A sealed delta epoch, by presence.
///
/// The discriminant is the presence and the payload is the epoch, one validated field: parsing
/// admits the two written forms and a tampered discriminant refuses as
/// [`AuthorityError::Envelope`]. The absent form zeroes its payload bytes and names a token issued
/// with no delta consumer, so equality between two absent values is what lets those tokens survive
/// a restart.
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
enum ScopeEpoch {
    Absent([u8; 16]),
    Present(DeltaEpoch),
}

impl From<Option<DeltaEpoch>> for ScopeEpoch {
    fn from(epoch: Option<DeltaEpoch>) -> Self {
        epoch.map_or(Self::Absent([0; 16]), Self::Present)
    }
}

/// A view's scope as the token carries it, before [`bind`](Self::bind) matches it to a presenter.
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
#[repr(transparent)]
struct UnboundScope(Scope);

impl UnboundScope {
    /// Binds the scope to its presenter, refusing an actor the token does not name.
    #[expect(
        clippy::missing_const_for_fn,
        reason = "the derived `PartialEq` behind `!=` is not const-callable"
    )]
    fn bind(self, actor: ActorId) -> Result<Scope, AuthorityError> {
        if self.0.actor != actor.into() {
            return Err(AuthorityError::Actor);
        }

        Ok(self.0)
    }
}

/// One view's sealed identity and state.
///
/// The actor and filter digest name the visibility proof the view answers under. `k` is the
/// delivery depth the session serves at, resolved at its bootstrap over the occupancy then in
/// force. A renewal carries `k` forward: a session keeps one delivery depth rather than
/// re-optimizing it per request. A re-bind of the filter digest keeps `k` unless the new view
/// resolves coarser, and a coarser view clamps it down. The carried value is the caller's own
/// earlier resolution, and delivery depth reflects that caller's own session history and never
/// another actor's rows.
///
/// The scope is its own byte-level form, with every field a zerocopy type, so issuance seals it
/// verbatim and an open reads it in place. The filter discriminant is the one validated byte. Every
/// other pattern is a valid value, and the tag already vouched for it.
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
    /// The one actor allowed to present this view.
    pub actor: ArchivedActorId,
    /// The digest of the filter the view's visibility proof resolved over, absent when the view
    /// has no filter.
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
    pub(crate) fn new(actor: ActorId, filter: Option<FilterDigest>, k: CutOffset) -> Self {
        Self {
            actor: actor.into(),
            filter: ScopeFilter::from(filter),
            k,
        }
    }
}

/// The caller's scope and the authority's delta epoch, sealed as one plaintext.
///
/// Its own byte-level form exactly as [`Scope`] is. The epoch is the authority's rather than the
/// caller's: issuance stamps the held value and the open refuses any other. No caller can seal a
/// scope under an epoch the process does not hold.
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
struct SealedState {
    scope: UnboundScope,
    epoch: ScopeEpoch,
}

/// One sealed token, the envelope as a type, read in place.
///
/// Every field lies at a fixed offset: a blob of [`TOKEN_BYTES`] resolves into header, ciphertext,
/// and trailer in one zerocopy cast. The cast validates the format version.
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
    ciphertext: [u8; size_of::<SealedState>()],
    trailer: AuthorityTrailer,
}

impl SealedAuthority {
    const SIZE: usize = size_of::<Self>();
}

/// The token envelope's width, covering the clear header, the sealed state, and the tag.
///
/// The value derives from the envelope type itself and moves when the layout does.
pub(crate) const TOKEN_BYTES: usize = SealedAuthority::SIZE;

/// Issues and opens the authority tokens of one generation.
///
/// One value holds the whole judgment context. The generation's sealing key comes from one
/// derivation at construction, and the acceptance window bounds a token's age. The held delta
/// epoch binds a token to the register lifetime whose process issued it, and the entropy source
/// stays behind its own lock, held for the nonce draw alone. Opening never contends with issuing.
/// A token opens under the authority whose generation sealed it, under the epoch it
/// holds, for the actor it names, and only while its issue time lies inside the window.
#[derive(Debug)]
pub(crate) struct TokenAuthority<R> {
    /// This generation's sealing key.
    ///
    /// Derived once, at construction, with the generation digest as the derivation's salt.
    key: SecretHexBytes<KEY_BYTES>,
    /// The acceptance window.
    ///
    /// A token older than this at open refuses as stale.
    hard: Duration,
    /// The delta epoch every issuance stamps and every open requires.
    epoch: ScopeEpoch,
    rng: Mutex<R>,
}

impl<R> TokenAuthority<R> {
    /// Builds the authority of one generation.
    ///
    /// The key derives from `secret` with the generation digest as its salt. A token stays
    /// acceptable for `hard` after its issue time, nonces come from `rng`, and `epoch` is the
    /// serving process's delta epoch, [`None`] when no delta consumer runs.
    pub(crate) fn new<const N: usize>(
        generation: GenerationId,
        secret: &SecretHexBytes<N>,
        hard: Duration,
        epoch: Option<DeltaEpoch>,
        rng: R,
    ) -> Self {
        let salt = generation.digest().to_bytes();
        let mut key = SecretHexBytes::zeroed();

        Hkdf::<Sha256>::new(Some(&salt), secret.as_bytes())
            .expand(LABEL, key.as_mut())
            .expect("the cipher's key size stays within HKDF-SHA256's expansion bound");

        Self {
            key,
            hard,
            epoch: ScopeEpoch::from(epoch),
            rng: Mutex::new(rng),
        }
    }

    /// Creates the token naming `scope`, issued at `now`, stamped with the held delta epoch.
    ///
    /// `now` is wall-clock time, because whichever process opens the token judges its age, and
    /// [`SystemTime`] is the clock whose value still means the same in another process.
    ///
    /// # Errors
    ///
    /// Returns the generator's error when drawing the nonce fails: entropy failure refuses issuance
    /// rather than sealing under a predictable nonce.
    pub(crate) fn issue(
        &self,
        scope: Scope,
        now: SystemTime,
    ) -> Result<[u8; SealedAuthority::SIZE], R::Error>
    where
        R: TryCryptoRng,
    {
        let sealed = SealedState {
            scope: UnboundScope(scope),
            epoch: self.epoch,
        };

        let mut nonce = [0_u8; NONCE_BYTES];
        self.rng.lock().try_fill_bytes(&mut nonce)?;

        let header = AuthorityHeader {
            version: MessageVersion::V1,
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
        sealed
            .write_to_prefix(&mut blob[size_of::<AuthorityHeader>()..])
            .expect("the envelope seals the state past its header");

        let sealed_tag = XChaCha20Poly1305::new(self.key.as_bytes().into())
            .encrypt_in_place_detached(
                XNonce::from_slice(&nonce),
                header.as_bytes(),
                &mut blob[size_of::<AuthorityHeader>()
                    ..size_of::<AuthorityHeader>() + size_of::<SealedState>()],
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
    /// Refuses a token sealed under any delta epoch other than the held one, one whose issue
    /// time is older than the acceptance window at `now`, one dated after `now`, and one naming
    /// an actor other than `actor`. The open judges the tag first: a rewritten issue time refuses
    /// as [`AuthorityError::Authentication`], and only an authentic token reaches the epoch, the
    /// window, and the actor comparison.
    ///
    /// # Errors
    ///
    /// [`AuthorityError::Envelope`] for a blob that is not this format,
    /// [`AuthorityError::Authentication`] when the tag refuses, [`AuthorityError::Epoch`] for a
    /// sealed delta epoch other than the held one, [`AuthorityError::Stale`] outside the window,
    /// and [`AuthorityError::Actor`] for a presenter the token does not name.
    pub(crate) fn open(
        &self,
        blob: &[u8; TOKEN_BYTES],
        actor: ActorId,
        now: SystemTime,
    ) -> Result<Scope, AuthorityError> {
        let (issued_at, sealed) = self.unseal(blob)?;
        let scope = self.alive(sealed)?;

        if issued_at > now || now.saturating_duration_since(issued_at) >= self.hard {
            return Err(AuthorityError::Stale);
        }

        scope.bind(actor)
    }

    /// Reads the view state a presented token carries, for a renewal.
    ///
    /// This read does not judge the acceptance window. An expired token is no longer authority, yet
    /// it remains authentic evidence of the view state a past issuance sealed, and re-sealing that
    /// state into a fresh token keeps a view stable across a refresh. The tag, the epoch, and the
    /// actor still bind, and the leniency reaches no further than the renewal. This read
    /// authenticates a scope and carries it forward, while every data request under the fresh
    /// token resolves that scope through the visibility cache, whose own hard window bounds how
    /// old a resolution may answer. The epoch binds here exactly because this is the renewal:
    /// view state accumulated beside a dead register must not carry into a token issued under
    /// the live one.
    ///
    /// # Errors
    ///
    /// [`AuthorityError::Envelope`] for a blob that is not this format,
    /// [`AuthorityError::Authentication`] when the tag refuses, [`AuthorityError::Epoch`] for a
    /// sealed delta epoch other than the held one, and [`AuthorityError::Actor`] for a presenter
    /// the token does not name.
    pub(crate) fn continuity(
        &self,
        blob: &[u8; TOKEN_BYTES],
        actor: ActorId,
    ) -> Result<Scope, AuthorityError> {
        let (_issued_at, sealed) = self.unseal(blob)?;
        let scope = self.alive(sealed)?;

        scope.bind(actor)
    }

    /// Parses and authenticates one envelope: the zerocopy cast and the tag, nothing judged.
    fn unseal(
        &self,
        blob: &[u8; TOKEN_BYTES],
    ) -> Result<(SystemTime, SealedState), AuthorityError> {
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

        let state = SealedState::try_read_from_bytes(&plaintext)
            .map_err(|_error| AuthorityError::Envelope)?;

        Ok((
            SystemTime::UNIX_EPOCH + Duration::from_secs(sealed.header.issued_at.get()),
            state,
        ))
    }

    /// Resolves the sealed scope, refusing a delta epoch other than the held one.
    #[expect(
        clippy::missing_const_for_fn,
        reason = "the derived `PartialEq` behind `!=` is not const-callable"
    )]
    fn alive(&self, sealed: SealedState) -> Result<UnboundScope, AuthorityError> {
        if sealed.epoch != self.epoch {
            return Err(AuthorityError::Epoch);
        }

        Ok(sealed.scope)
    }
}

#[cfg(test)]
mod tests {
    const ACTOR_UUID_BYTES: [u8; 16] = [
        0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF, 0x10, 0x32, 0x54, 0x76, 0x98, 0xBA, 0xDC,
        0xFE,
    ];

    /// The tests the `miri` nextest profile selects.
    ///
    /// The test here derefs an archived actor identifier to the identity it wraps.
    /// The profile selects by module path: moving a test in or out of this module is the whole
    /// edit.
    mod miri {
        use uuid::Uuid;
        use zerocopy::FromBytes as _;

        use super::ACTOR_UUID_BYTES;
        use crate::serve::authorization::ArchivedActorEntityUuid;

        /// The archived actor identity derefs to the plain identity the same bytes denote.
        #[test]
        fn archived_actor_entity_uuid_derefs_to_the_same_identity() {
            let archived = ArchivedActorEntityUuid::read_from_bytes(&ACTOR_UUID_BYTES)
                .expect("should read an archived actor uuid from any 16 bytes");

            assert_eq!(Uuid::from(*archived), Uuid::from_bytes(ACTOR_UUID_BYTES),);
        }
    }
}
