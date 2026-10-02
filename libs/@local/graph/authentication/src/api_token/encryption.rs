use aes_siv::{KeyInit as _, Tag, siv::Aes256Siv};
use error_stack::{Report, ResultExt as _};
use hash_graph_store::api_token::{
    ApiTokenEncryptedSecretHash, ApiTokenEncryptionKeyId, ApiTokenId, ApiTokenSecretHash,
};
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

use super::{ApiTokenType, ApiTokenVersion, Environment};

const SYNTHETIC_IV_LENGTH: usize = 16;

/// An AES-256-SIV key for the secret hashes of API tokens, and its ID.
#[derive(derive_more::Debug)]
pub struct ApiTokenEncryptionKey {
    id: ApiTokenEncryptionKeyId,
    // TODO(BE-791): zeroize the key on drop
    #[debug(skip)]
    key: [u8; 64],
}

impl ApiTokenEncryptionKey {
    #[must_use]
    pub const fn new(id: ApiTokenEncryptionKeyId, key: [u8; 64]) -> Self {
        Self { id, key }
    }

    #[must_use]
    pub const fn id(&self) -> ApiTokenEncryptionKeyId {
        self.id
    }

    /// Encrypts `secret_hash` bound to `associated_data`.
    #[must_use]
    pub fn encrypt(
        &self,
        secret_hash: ApiTokenSecretHash,
        associated_data: &AssociatedData,
    ) -> ApiTokenEncryptedSecretHash {
        let mut ciphertext = *secret_hash.as_bytes();
        let synthetic_iv = associated_data
            .with_headers(|headers| {
                self.cipher()
                    .encrypt_inout_detached(headers, ciphertext.as_mut_slice().into())
            })
            .unwrap_or_else(|error| unreachable!("AES-SIV should accept six headers: {error}"));

        let mut encrypted_secret_hash = [0; 48];
        let (synthetic_iv_part, ciphertext_part) =
            encrypted_secret_hash.split_at_mut(SYNTHETIC_IV_LENGTH);
        synthetic_iv_part.copy_from_slice(&synthetic_iv);
        ciphertext_part.copy_from_slice(&ciphertext);
        ApiTokenEncryptedSecretHash::new(encrypted_secret_hash)
    }

    /// Decrypts `encrypted_secret_hash` with the associated data it was encrypted with.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenDecryptionError`] if `encrypted_secret_hash` was not encrypted with this
    /// key for `associated_data`.
    pub fn decrypt(
        &self,
        encrypted_secret_hash: ApiTokenEncryptedSecretHash,
        associated_data: &AssociatedData,
    ) -> Result<ApiTokenSecretHash, Report<ApiTokenDecryptionError>> {
        let (synthetic_iv_part, ciphertext_part) = encrypted_secret_hash
            .as_bytes()
            .split_at(SYNTHETIC_IV_LENGTH);
        let mut synthetic_iv = Tag::default();
        synthetic_iv.copy_from_slice(synthetic_iv_part);
        let mut secret_hash = [0; 32];
        secret_hash.copy_from_slice(ciphertext_part);

        associated_data
            .with_headers(|headers| {
                self.cipher().decrypt_inout_detached(
                    headers,
                    secret_hash.as_mut_slice().into(),
                    &synthetic_iv,
                )
            })
            .change_context(ApiTokenDecryptionError)?;
        Ok(ApiTokenSecretHash::new(secret_hash))
    }

    fn cipher(&self) -> Aes256Siv {
        Aes256Siv::new((&self.key).into())
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

impl AssociatedData {
    /// Calls `operation` with the parts as separate AES-SIV headers, in the order of the fields.
    ///
    /// - The type and the environment are their codes.
    /// - The version is its number.
    /// - The token ID, the actor ID and the web ID are the bytes of their UUIDs.
    ///
    /// Every stored secret hash depends on this encoding, so changing it makes all of them fail to
    /// decrypt.
    fn with_headers<T>(&self, operation: impl FnOnce([&[u8]; 6]) -> T) -> T {
        let version = [self.version.number()];
        let token_id = Uuid::from(self.token_id).into_bytes();
        let actor_id = Uuid::from(self.actor_id).into_bytes();
        let web_id = Uuid::from(self.web_id).into_bytes();
        operation([
            self.token_type.code(),
            self.environment.code(),
            &version,
            &token_id,
            &actor_id,
            &web_id,
        ])
    }
}

/// Why an encrypted secret hash could not be decrypted.
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the encrypted secret hash does not match the key and the associated data")]
pub struct ApiTokenDecryptionError;

#[cfg(test)]
mod tests {
    use core::assert_matches;

    use hash_graph_store::api_token::{
        ApiTokenEncryptedSecretHash, ApiTokenEncryptionKeyId, ApiTokenId,
    };
    use rstest::rstest;
    use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
    use uuid::Uuid;

    use super::{ApiTokenDecryptionError, ApiTokenEncryptionKey, AssociatedData};
    use crate::api_token::{Environment, HashedApiToken};

    /// The token the format tests pin.
    const FIXED_TOKEN: &str =
        "hsh_pat_pd_0296tiiBb3U904RIpygpjj_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg39B9Yp";

    /// The secret hash of [`FIXED_TOKEN`] encrypted with [`fixed_key`] for
    /// [`fixed_associated_data`], computed independently with OpenSSL's AES-256-SIV.
    const FIXED_ENCRYPTED_SECRET_HASH: [u8; 48] = [
        0xEF, 0x17, 0xDA, 0x58, 0x70, 0x92, 0x88, 0x76, 0xCE, 0xC0, 0x8C, 0x2B, 0x8A, 0x08, 0x0E,
        0xB2, 0x5B, 0x11, 0xA8, 0x16, 0x56, 0x8E, 0xDF, 0xDA, 0x8C, 0x44, 0x08, 0xE5, 0xDB, 0xAB,
        0x91, 0xA8, 0x3F, 0x3C, 0x7E, 0xA6, 0x18, 0xC0, 0x29, 0xDD, 0xF0, 0x68, 0x74, 0x36, 0x77,
        0x84, 0x4A, 0x34,
    ];

    /// The key with the bytes 0 to 63.
    fn fixed_key() -> ApiTokenEncryptionKey {
        ApiTokenEncryptionKey::new(
            ApiTokenEncryptionKeyId::new(Uuid::from_u128(
                0x3333_3333_3333_3333_3333_3333_3333_3333,
            )),
            core::array::from_fn(|index| u8::try_from(index).expect("the index should fit a byte")),
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
    fn encrypt_fixed_token() {
        let token = fixed_token();

        assert_eq!(
            fixed_key().encrypt(token.secret_hash(), &fixed_associated_data(&token)),
            ApiTokenEncryptedSecretHash::new(FIXED_ENCRYPTED_SECRET_HASH),
            "the encrypted secret hash should match the value computed with OpenSSL"
        );
    }

    #[test]
    fn decrypt_fixed_token() {
        let token = fixed_token();

        assert_eq!(
            fixed_key()
                .decrypt(
                    ApiTokenEncryptedSecretHash::new(FIXED_ENCRYPTED_SECRET_HASH),
                    &fixed_associated_data(&token)
                )
                .expect("the pinned value should decrypt"),
            token.secret_hash(),
            "decrypting should yield the SHA-256 of the secret"
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
    fn decrypt_other_associated_data(#[case] change: fn(AssociatedData) -> AssociatedData) {
        let token = fixed_token();

        let report = fixed_key()
            .decrypt(
                ApiTokenEncryptedSecretHash::new(FIXED_ENCRYPTED_SECRET_HASH),
                &change(fixed_associated_data(&token)),
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
            format!("ApiTokenEncryptionKey {{ id: {:?}, .. }}", key.id()),
            "the debug output should leave out the key"
        );
    }
}
