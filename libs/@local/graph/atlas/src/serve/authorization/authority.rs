//! Sealing and verification of the [delivery context](super) retained by a token.
//!
//! [`Authority`] derives a sealing key at construction and issues an [`EncryptedToken`] over a
//! [`Scope`]. Verification authenticates the envelope before comparing its actor, generation and
//! delta lifetime with the request. [`ScopeLease::current`] checks expiry.

use core::time::Duration;
use std::{sync::nonpoison::Mutex, time::SystemTime};

use chacha20poly1305::{
    AeadCore, AeadInPlace as _, KeyInit as _, KeySizeUser, Tag, XChaCha20Poly1305, XNonce,
};
use error_stack::Report;
use hkdf::Hkdf;
use rand::TryCryptoRng;
use sha2::{Sha256, digest::typenum::Unsigned};
use type_system::principal::actor::ActorId;
use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    error::AuthorityError,
    scope::{Scope, ScopeLease},
    token::{EncryptedToken, MessageVersion, Token, TokenHeader, UnixEpochSeconds},
};
use crate::{
    integrity::SecretHexBytes,
    morton::Zoom,
    serve::{delta::epoch::Epoch, visibility::cache::FilterDigest},
};

/// The authenticated cipher protecting the scope and clear header.
type Encryption = XChaCha20Poly1305;

/// The HKDF info string for authorization key derivation.
///
/// This label must change when the envelope's interpretation changes. Distinct labels separate
/// layout versions in key derivation.
const LABEL: &[u8] = b"atlas.authorization.v2";
/// The nonce width the envelope's header reserves.
pub(crate) const NONCE_BYTES: usize = <<Encryption as AeadCore>::NonceSize as Unsigned>::USIZE;
/// The sealing key's width, the number of bytes HKDF expands to.
pub(crate) const KEY_BYTES: usize = <<Encryption as KeySizeUser>::KeySize as Unsigned>::USIZE;
/// The authentication tag's width, the envelope's trailer.
pub(crate) const TAG_BYTES: usize = <<Encryption as AeadCore>::TagSize as Unsigned>::USIZE;

/// The actor, filter identity and delivery offset to seal into a token.
///
/// The generation and delta reference come from the supplied [`Epoch`]. These remaining fields must
/// describe the resolved delivery decision: issuance authenticates the supplied values without
/// recomputing permissions.
#[expect(
    clippy::min_ident_chars,
    reason = "`k` is the delivery-cut offset's name throughout the density contract"
)]
pub(crate) struct Issue {
    /// The principal bound to the token.
    pub actor: ActorId,
    /// The request filter's identity, absent for an unfiltered scope.
    pub filter: Option<FilterDigest>,
    /// The admitted zoom offset for the delivery cut.
    pub k: Zoom,
}

/// An issuer and verifier sharing one sealing key and token-expiration window.
///
/// # Key and nonce requirements
///
/// XChaCha20-Poly1305 requires a secret key and non-repeating nonces under that key. [`Self::new`]
/// derives the key with HKDF-SHA256 from a deployment secret and a random 64-bit salt. Each issue
/// draws a 192-bit nonce from `R`, with access serialized within this authority. Confidentiality
/// and authenticity depend on the cipher's security assumptions, secret key material and a
/// correctly seeded, protected random source.
///
/// Random draws provide probabilistic separation, not uniqueness. The authority checks neither salt
/// nor nonce collisions. The [`TryCryptoRng`] marker alone does not establish correct seeding or
/// protect against duplicated generator state. Keep the secret unpredictable and avoid cloning or
/// restoring a generator's state for independent issuers.
///
/// The derived key is not persisted. A new authority draws another salt, including after restart.
/// Equal secret, salt and label derive equal keys, and a repeated salt can therefore reproduce an
/// earlier key. Authorities constructed independently from the same deployment secret are not
/// configured to share tokens.
pub(crate) struct Authority<R> {
    key: SecretHexBytes<KEY_BYTES>,
    expiration: Duration,
    rng: Mutex<R>,
}

impl<R> Authority<R> {
    /// Derives a sealing key and sets the issue-time window for its tokens.
    ///
    /// Each construction salts `secret` with a newly drawn `u64`. The timestamp recorded in each
    /// token starts its `expiration` window. A zero duration admits no lease as current. The [key
    /// and nonce requirements](Self#key-and-nonce-requirements) apply to `secret` and `rng`.
    ///
    /// # Errors
    ///
    /// Returns `rng`'s error if drawing the salt fails.
    #[expect(
        clippy::big_endian_bytes,
        reason = "HKDF salts are byte strings, and a fixed order keeps the derivation \
                  host-independent"
    )]
    pub(crate) fn new(secret: &[u8], expiration: Duration, mut rng: R) -> Result<Self, R::Error>
    where
        R: TryCryptoRng,
    {
        let salt = rng.try_next_u64()?;
        let mut key = SecretHexBytes::zeroed();

        Hkdf::<Sha256>::new(Some(&salt.to_be_bytes()), secret)
            .expand(LABEL, key.as_mut())
            .expect("the cipher's key size stays within HKDF-SHA256's expansion bound");

        Ok(Self {
            key,
            expiration,
            rng: Mutex::new(rng),
        })
    }

    /// Seals the supplied delivery decision over `epoch`.
    ///
    /// The token records `epoch`'s generation and delta reference. The [`Issue`] fields must
    /// describe an authorized decision for this epoch. This operation makes no permission query.
    ///
    /// # Warning
    ///
    /// [`UnixEpochSeconds`] discards sub-second precision from `now` and maps pre-epoch times to
    /// the Unix epoch. That encoded time starts the expiration window. For post-epoch issuance,
    /// truncation can shorten the usable window by less than one second.
    ///
    /// # Errors
    ///
    /// Returns `rng`'s error if drawing the nonce fails.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    pub(crate) fn issue(
        &self,
        epoch: &Epoch,
        now: SystemTime,
        Issue { actor, filter, k }: Issue,
    ) -> Result<EncryptedToken, R::Error>
    where
        R: TryCryptoRng,
    {
        let scope = Scope {
            generation: epoch.generation(),
            delta: epoch.reference(),
            actor: actor.into(),
            filter: filter.into(),
            k,
        };

        let mut nonce = [0_u8; NONCE_BYTES];
        self.rng.lock().try_fill_bytes(&mut nonce)?;

        let header = TokenHeader {
            version: MessageVersion::V1,
            issued_at: UnixEpochSeconds::new(now),
            nonce,
        };

        let mut blob = [0_u8; Token::BYTES];
        header
            .write_to_prefix(&mut blob)
            .unwrap_or_else(|_err| unreachable!("header is included in the payload"));
        scope
            .write_to_prefix(&mut blob[TokenHeader::BYTES..])
            .unwrap_or_else(|_err| unreachable!("scope is included in the payload"));

        // the fixed-size header and scope fit the cipher's message and associated-data bounds.
        let sealed_tag = Encryption::new(self.key.as_bytes().into())
            .encrypt_in_place_detached(
                XNonce::from_slice(&nonce),
                header.as_bytes(),
                &mut blob[size_of::<TokenHeader>()..size_of::<TokenHeader>() + size_of::<Scope>()],
            )
            .unwrap_or_else(|_error| {
                unreachable!("XChaCha20-Poly1305 encryption is infallible for in-memory payloads")
            });

        sealed_tag
            .write_to_suffix(&mut blob)
            .unwrap_or_else(|_err| unreachable!("trailer only contains tag"));

        Ok(EncryptedToken::new_unchecked(blob))
    }

    /// Opens a presented token and checks that its scope binds this request.
    ///
    /// Verification checks the token's byte layout before AEAD authentication with this authority's
    /// key, then validates the decrypted scope's representation and the timestamp's host
    /// representability. Every request-binding comparison follows authentication: actor, generation
    /// and delta lifetime, in that order. The delta revision takes no part in these comparisons.
    /// The result retains the sealed filter and offset.
    ///
    /// The returned [`ScopeLease`] performs the expiry check separately. Successful decryption does
    /// not resolve visibility or record token use.
    ///
    /// # Errors
    ///
    /// Returns [`AuthorityError`] for an invalid envelope, failed authentication or a
    /// request-binding mismatch. Representation checks and authentication precede the actor,
    /// generation and delta comparisons.
    pub(crate) fn decrypt(
        &self,
        actor: ActorId,
        epoch: &Epoch,
        blob: &EncryptedToken,
    ) -> Result<ScopeLease, Report<AuthorityError>> {
        let token = Token::try_ref_from_bytes(blob.as_bytes())
            .map_err(|_err| Report::new(AuthorityError::Envelope))?;

        let mut plaintext = token.ciphertext;
        XChaCha20Poly1305::new(self.key.as_bytes().into())
            .decrypt_in_place_detached(
                &XNonce::from(token.header.nonce),
                token.header.as_bytes(),
                &mut plaintext,
                &Tag::from(token.trailer.tag),
            )
            .map_err(|_error| Report::new(AuthorityError::Decryption))?;

        let scope = Scope::try_read_from_bytes(&plaintext)
            .map_err(|_err| Report::new(AuthorityError::Envelope))?;

        let issued_at = token
            .header
            .issued_at
            .to_system_time()
            .ok_or_else(|| Report::new(AuthorityError::Envelope))?;

        if scope.actor != actor.into() {
            return Err(Report::new(AuthorityError::Actor));
        }
        if scope.generation != epoch.generation() {
            return Err(Report::new(AuthorityError::Generation));
        }
        if scope.delta.id != epoch.reference().id {
            return Err(Report::new(AuthorityError::Delta));
        }

        Ok(ScopeLease::new(scope, issued_at, self.expiration))
    }
}
