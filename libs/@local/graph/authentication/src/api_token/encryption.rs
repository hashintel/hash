use core::pin::pin;

use error_stack::{Report, ResultExt as _};
use hash_crypto::{
    Secret,
    aes_gcm::{AeadPurpose, Aes256GcmKey, Sealed},
    digest::SHA256_OUTPUT_LEN,
};
use hash_graph_store::api_token::{
    ApiTokenEncryptedSecretHash, ApiTokenEncryptionKeyId, ApiTokenId,
};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;
use zerocopy::{Immutable, IntoBytes};

use super::{
    ApiTokenSecretHash, ApiTokenType, ApiTokenVersion, ENVIRONMENT_LENGTH, Environment, TYPE_LENGTH,
};

/// The purpose of the keys that encrypt the secret hashes of API tokens.
struct SecretHashes;

impl AeadPurpose for SecretHashes {
    type AssociatedData = AssociatedData;

    fn associated_data(data: &AssociatedData) -> impl AsRef<[u8]> {
        data.layout()
    }
}

/// An AES-256-GCM key for the secret hashes of API tokens, and its ID.
#[derive(Debug)]
pub struct ApiTokenEncryptionKey {
    id: ApiTokenEncryptionKeyId,
    key: Aes256GcmKey<SecretHashes>,
}

impl ApiTokenEncryptionKey {
    #[must_use]
    pub fn new(id: ApiTokenEncryptionKeyId, key: &Secret<[u8; 32]>) -> Self {
        Self {
            id,
            key: Aes256GcmKey::from_secret(key),
        }
    }

    #[must_use]
    pub const fn id(&self) -> ApiTokenEncryptionKeyId {
        self.id
    }

    /// Encrypts `secret_hash` bound to `associated_data`, under a random nonce.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenEncryptionError`] if the cipher fails, such as when the random number
    /// generator fails.
    pub fn encrypt(
        &self,
        secret_hash: ApiTokenSecretHash,
        associated_data: &AssociatedData,
    ) -> Result<ApiTokenEncryptedSecretHash, Report<ApiTokenEncryptionError>> {
        let mut plaintext = pin!(Secret::<[u8; SHA256_OUTPUT_LEN]>::zeroed());
        plaintext
            .as_mut()
            .expose_mut()
            .copy_from_slice(&secret_hash.0.to_bytes());

        let sealed = self
            .key
            .seal(&plaintext, associated_data)
            .change_context(ApiTokenEncryptionError)?;
        Ok(ApiTokenEncryptedSecretHash::new(zerocopy::transmute!(
            sealed
        )))
    }

    /// Whether `encrypted_secret_hash` decrypts to `secret_hash` with the associated data it was
    /// encrypted with.
    ///
    /// The secret hashes are compared in constant time.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenDecryptionError`] if `encrypted_secret_hash` was not encrypted with this
    /// key for `associated_data`.
    pub fn matches(
        &self,
        encrypted_secret_hash: ApiTokenEncryptedSecretHash,
        associated_data: &AssociatedData,
        secret_hash: ApiTokenSecretHash,
    ) -> Result<bool, Report<ApiTokenDecryptionError>> {
        let sealed: Sealed<SecretHashes, SHA256_OUTPUT_LEN> =
            zerocopy::transmute!(*encrypted_secret_hash.as_bytes());
        let mut plaintext = pin!(Secret::<[u8; SHA256_OUTPUT_LEN]>::zeroed());
        self.key
            .open(&sealed, associated_data, plaintext.as_mut())
            .change_context(ApiTokenDecryptionError)?;

        Ok(*plaintext == secret_hash.0.to_bytes()[..])
    }
}

/// The parts of a token and its row that an encrypted secret hash is bound to.
#[derive(Debug, Copy, Clone)]
pub struct AssociatedData {
    pub token_type: ApiTokenType,
    pub environment: Environment,
    pub version: ApiTokenVersion,
    pub token_id: ApiTokenId,
    /// The actor the token acts as.
    pub actor_id: ActorEntityUuid,
    /// The web that owns the token.
    pub web_id: WebId,
}

/// The bytes of the associated data, part by part.
///
/// Every part has a fixed length, so the bytes identify the parts without separators.
#[derive(IntoBytes, Immutable)]
#[repr(C)]
struct AssociatedDataLayout {
    token_type: [u8; TYPE_LENGTH],
    environment: [u8; ENVIRONMENT_LENGTH],
    version: u8,
    token_id: [u8; 16],
    actor_id: [u8; 16],
    web_id: [u8; 16],
}

impl AssociatedData {
    /// The associated data as AES-GCM authenticates it: the type and environment codes, the
    /// version number and the UUID bytes of the token ID, the actor ID and the web ID.
    ///
    /// Every stored secret hash depends on this encoding, so changing it makes all of them fail to
    /// decrypt.
    fn layout(&self) -> AssociatedDataLayout {
        AssociatedDataLayout {
            token_type: *self.token_type.code(),
            environment: *self.environment.code(),
            version: self.version.number(),
            token_id: Uuid::from(self.token_id).into_bytes(),
            actor_id: Uuid::from(self.actor_id).into_bytes(),
            web_id: Uuid::from(self.web_id).into_bytes(),
        }
    }
}

impl AsRef<[u8]> for AssociatedDataLayout {
    fn as_ref(&self) -> &[u8] {
        self.as_bytes()
    }
}

/// Why a secret hash could not be encrypted.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the secret hash could not be encrypted")]
pub struct ApiTokenEncryptionError;

/// Why an encrypted secret hash could not be decrypted.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the encrypted secret hash does not match the key and the associated data")]
pub struct ApiTokenDecryptionError;

#[cfg(test)]
mod tests {
    use core::{assert_matches, pin::pin};

    use hash_crypto::Secret;
    use hash_graph_store::api_token::{
        ApiTokenEncryptedSecretHash, ApiTokenEncryptionKeyId, ApiTokenId,
    };
    use rstest::rstest;
    use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
    use uuid::Uuid;

    use super::{ApiTokenDecryptionError, ApiTokenEncryptionKey, AssociatedData};
    use crate::api_token::{Environment, HashedApiToken};

    /// A production token with a fixed token ID and secret.
    const FIXED_TOKEN: &str =
        "hsh_pat_pd_0296tiiBb3U904RIpygpjj_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg39B9Yp";

    /// The secret hash of [`FIXED_TOKEN`] encrypted with [`fixed_key`] for
    /// [`fixed_associated_data`] under the nonce `0x40` to `0x4B`, computed independently with
    /// OpenSSL's AES-256-GCM.
    const FIXED_ENCRYPTED_SECRET_HASH: [u8; 60] = [
        0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x4B, 0x93, 0x61, 0xE5,
        0x3B, 0x7F, 0x86, 0x56, 0x19, 0x71, 0x77, 0xC8, 0xEF, 0xAE, 0x58, 0x9E, 0x43, 0x0A, 0x6C,
        0xAF, 0xD4, 0x88, 0xCF, 0xF9, 0xD1, 0xBE, 0x98, 0x32, 0x59, 0x6B, 0x2D, 0xF5, 0x8B, 0x94,
        0x90, 0x61, 0x35, 0x40, 0xBD, 0x63, 0x03, 0x2F, 0x5B, 0x87, 0xC2, 0x05, 0xEF, 0x3B, 0x05,
    ];

    /// The key with the bytes 0 to 31.
    fn fixed_key() -> ApiTokenEncryptionKey {
        let mut key = pin!(Secret::<[u8; 32]>::zeroed());
        for (byte, value) in key.as_mut().expose_mut().iter_mut().zip(0..) {
            *byte = value;
        }
        ApiTokenEncryptionKey::new(
            ApiTokenEncryptionKeyId::new(Uuid::from_u128(
                0x3333_3333_3333_3333_3333_3333_3333_3333,
            )),
            &key,
        )
    }

    fn fixed_token() -> HashedApiToken {
        FIXED_TOKEN.parse().expect("the pinned token should parse")
    }

    fn fixed_associated_data(token: &HashedApiToken) -> AssociatedData {
        token.associated_data(
            ActorEntityUuid::new(Uuid::from_u128(0x1111_1111_1111_1111_1111_1111_1111_1111)),
            WebId::new(Uuid::from_u128(0x2222_2222_2222_2222_2222_2222_2222_2222)),
        )
    }

    #[test]
    fn matches_fixed_token() {
        let token = fixed_token();

        assert!(
            fixed_key()
                .matches(
                    ApiTokenEncryptedSecretHash::new(FIXED_ENCRYPTED_SECRET_HASH),
                    &fixed_associated_data(&token),
                    token.secret_hash(),
                )
                .expect("the pinned value should decrypt"),
            "the pinned value should decrypt to the SHA-256 of the secret"
        );
    }

    #[test]
    fn encrypt_round_trip() {
        let token = fixed_token();
        let key = fixed_key();

        let encrypted = key
            .encrypt(token.secret_hash(), &fixed_associated_data(&token))
            .expect("the secret hash should encrypt");

        assert!(
            key.matches(
                encrypted,
                &fixed_associated_data(&token),
                token.secret_hash()
            )
            .expect("the encrypted secret hash should decrypt"),
            "the encrypted secret hash should decrypt to the secret hash that was encrypted"
        );
    }

    #[test]
    fn encrypt_fresh_nonce() {
        let token = fixed_token();
        let key = fixed_key();

        let first = key
            .encrypt(token.secret_hash(), &fixed_associated_data(&token))
            .expect("the secret hash should encrypt");
        let second = key
            .encrypt(token.secret_hash(), &fixed_associated_data(&token))
            .expect("the secret hash should encrypt");

        assert_ne!(
            first, second,
            "encrypting the same secret hash twice should use two nonces"
        );
    }

    #[rstest]
    #[case::environment(|data| AssociatedData { environment: Environment::Staging, ..data })]
    #[case::token_id(|data| AssociatedData { token_id: ApiTokenId::new(Uuid::from_u128(1)), ..data })]
    #[case::actor_id(|data| AssociatedData { actor_id: ActorEntityUuid::new(Uuid::from_u128(1)), ..data })]
    #[case::web_id(|data| AssociatedData { web_id: WebId::new(Uuid::from_u128(1)), ..data })]
    #[case::actor_web_swapped(|data: AssociatedData| AssociatedData {
        actor_id: ActorEntityUuid::new(Uuid::from(data.web_id)),
        web_id: WebId::new(Uuid::from(data.actor_id)),
        ..data
    })]
    fn matches_other_associated_data(#[case] change: fn(AssociatedData) -> AssociatedData) {
        let token = fixed_token();

        let report = fixed_key()
            .matches(
                ApiTokenEncryptedSecretHash::new(FIXED_ENCRYPTED_SECRET_HASH),
                &change(fixed_associated_data(&token)),
                token.secret_hash(),
            )
            .expect_err("the pinned value should not decrypt with other associated data");
        assert_matches!(
            report.current_context(),
            ApiTokenDecryptionError,
            "the failure should be reported as a decryption error"
        );
    }

    #[test]
    fn debug_redacts_key() {
        let key = fixed_key();

        assert_eq!(
            format!("{key:?}"),
            format!(
                "ApiTokenEncryptionKey {{ id: {:?}, key: Aes256GcmKey {{ .. }} }}",
                key.id()
            ),
            "the debug output should leave out the key"
        );
    }
}
