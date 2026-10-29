//! Sealing and verification of the [delivery context](super) retained by a token.
//!
//! [`Authority`] derives a sealing key at construction and issues an [`EncryptedToken`] over a
//! [`Scope`]. Verification authenticates the envelope before comparing its actor, generation and
//! delta lifetime with the request. [`ScopeLease::current`] checks expiry.

use core::{pin::pin, time::Duration};
use std::time::SystemTime;

use error_stack::{Report, ResultExt as _};
use hash_secret::{
    Secret, SecretBuffer,
    aes_gcm::{AeadPurpose, Aes256GcmKey, SealError, Sealed},
    hkdf::HkdfSha256Key,
    random::random_bytes,
};
use type_system::principal::actor::ActorId;
use zerocopy::{IntoBytes as _, TryFromBytes as _};

use super::{
    error::{AuthorityError, AuthorityKeyError},
    scope::{Scope, ScopeLease},
    token::{EncryptedToken, MessageVersion, SCOPE_BYTES, Token, TokenHeader, UnixEpochSeconds},
};
use crate::{
    morton::Zoom,
    serve::{delta::epoch::Epoch, visibility::cache::FilterDigest},
};

/// The HKDF info string for authorization key derivation.
///
/// This label must change when the envelope's interpretation changes. Distinct labels separate
/// layout versions in key derivation.
const LABEL: &[u8] = b"atlas.authorization.v3";

/// The purpose of the key that seals a [`Scope`] into a token, bound to the token's clear header.
pub(super) struct Scopes;

impl AeadPurpose for Scopes {
    type AssociatedData = TokenHeader;

    fn associated_data(data: &TokenHeader) -> impl AsRef<[u8]> {
        data.as_bytes()
    }
}

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
/// [`Self::new`] derives an AES-256-GCM key with HKDF-SHA-256 from a deployment secret and a random
/// 64-bit salt. Each token gets a random 96-bit nonce, so one authority may issue at most `2^32`
/// tokens (SP 800-38D, section 8.3). The authority does not count them.
///
/// The derived key is not persisted. A new authority draws another salt, including after restart.
/// Equal secret, salt and label derive equal keys, and a repeated salt can therefore reproduce an
/// earlier key. Authorities constructed independently from the same deployment secret are not
/// configured to share tokens.
pub(crate) struct Authority {
    key: Aes256GcmKey<Scopes>,
    expiration: Duration,
}

impl Authority {
    /// Derives a sealing key from `secret` and sets the issue-time window for its tokens.
    ///
    /// Each construction salts `secret` with newly drawn random bytes. The timestamp recorded in
    /// each token starts its `expiration` window. A zero duration admits no lease as current.
    ///
    /// # Errors
    ///
    /// Returns [`AuthorityKeyError`] if drawing the salt or deriving the key fails.
    pub(crate) fn new<T>(
        secret: &Secret<T>,
        expiration: Duration,
    ) -> Result<Self, Report<AuthorityKeyError>>
    where
        T: ?Sized + SecretBuffer<View = [u8]>,
    {
        let salt = random_bytes::<8>().change_context(AuthorityKeyError)?;
        let mut key = pin!(Secret::<[u8; 32]>::zeroed());
        HkdfSha256Key::extract(&salt, secret)
            .expand(LABEL, key.as_mut())
            .change_context(AuthorityKeyError)?;

        Ok(Self {
            key: Aes256GcmKey::from_secret(&key),
            expiration,
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
    /// Returns [`SealError`] if sealing the scope fails.
    #[expect(
        clippy::min_ident_chars,
        reason = "`k` is the delivery-cut offset's name throughout the density contract"
    )]
    pub(crate) fn issue(
        &self,
        epoch: &Epoch,
        now: SystemTime,
        Issue { actor, filter, k }: Issue,
    ) -> Result<EncryptedToken, Report<SealError>> {
        let scope = Scope {
            generation: epoch.generation(),
            delta: epoch.reference(),
            actor: actor.into(),
            filter: filter.into(),
            k,
        };
        let header = TokenHeader {
            version: MessageVersion::V2,
            issued_at: UnixEpochSeconds::new(now),
        };

        let mut plaintext = pin!(Secret::<[u8; SCOPE_BYTES]>::zeroed());
        plaintext
            .as_mut()
            .expose_mut()
            .copy_from_slice(scope.as_bytes());
        let sealed = self.key.seal(&plaintext, &header)?;

        let token = Token {
            header,
            sealed: zerocopy::transmute!(sealed),
        };
        Ok(EncryptedToken::new_unchecked(zerocopy::transmute!(token)))
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

        let sealed: Sealed<Scopes, SCOPE_BYTES> = zerocopy::transmute!(token.sealed);
        let mut plaintext = pin!(Secret::<[u8; SCOPE_BYTES]>::zeroed());
        self.key
            .open(&sealed, &token.header, plaintext.as_mut())
            .change_context(AuthorityError::Decryption)?;

        let scope = Scope::try_read_from_bytes(plaintext.expose())
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
