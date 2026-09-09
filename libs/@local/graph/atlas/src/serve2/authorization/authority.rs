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
    serve2::{delta::epoch::Epoch, visibility::cache::FilterDigest},
};

type Encryption = XChaCha20Poly1305;

const LABEL: &[u8] = b"atlas.authorization.v2";
pub(crate) const NONCE_BYTES: usize = <<Encryption as AeadCore>::NonceSize as Unsigned>::USIZE;
pub(crate) const KEY_BYTES: usize = <<Encryption as KeySizeUser>::KeySize as Unsigned>::USIZE;
pub(crate) const TAG_BYTES: usize = <<Encryption as AeadCore>::TagSize as Unsigned>::USIZE;

pub(crate) struct Issue {
    pub actor: ActorId,
    pub filter: Option<FilterDigest>,
    pub k: Zoom,
}

pub(crate) struct Authority<R> {
    key: SecretHexBytes<KEY_BYTES>,
    expiration: Duration,
    rng: Mutex<R>,
}

impl<R> Authority<R> {
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

        let issued_at: SystemTime = token.header.issued_at.into();

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
