//! API tokens a user authenticates with on the public Graph API.
//!
//! A store records a token's SHA-256 secret hash only in encrypted form, never its secret.

use uuid::Uuid;

/// The identifier of an API token.
///
/// It is part of the token and not secret.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct ApiTokenId(Uuid);

impl ApiTokenId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl From<ApiTokenId> for Uuid {
    fn from(token_id: ApiTokenId) -> Self {
        token_id.0
    }
}

/// The SHA-256 hash of an API token's secret.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ApiTokenSecretHash([u8; 32]);

impl ApiTokenSecretHash {
    #[must_use]
    pub const fn new(hash: [u8; 32]) -> Self {
        Self(hash)
    }

    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

/// The SHA-256 hash of an API token's secret, encrypted with AES-256-SIV.
///
/// The first 16 bytes are the synthetic IV, the other 32 the ciphertext.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub struct ApiTokenEncryptedSecretHash([u8; 48]);

impl ApiTokenEncryptedSecretHash {
    #[must_use]
    pub const fn new(encrypted_hash: [u8; 48]) -> Self {
        Self(encrypted_hash)
    }

    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 48] {
        &self.0
    }
}

/// The identifier of the key that encrypts an API token's secret hash.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash, derive_more::Display)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
#[repr(transparent)]
pub struct ApiTokenEncryptionKeyId(Uuid);

impl ApiTokenEncryptionKeyId {
    #[must_use]
    pub const fn new(uuid: Uuid) -> Self {
        Self(uuid)
    }
}

impl From<ApiTokenEncryptionKeyId> for Uuid {
    fn from(key_id: ApiTokenEncryptionKeyId) -> Self {
        key_id.0
    }
}
