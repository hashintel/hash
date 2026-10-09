//! API tokens a user authenticates with on the public Graph API.
//!
//! A store records a token's SHA-256 secret hash only in encrypted form, never its secret.

#[cfg(feature = "postgres")]
use core::error::Error;
use core::time::Duration;

#[cfg(feature = "postgres")]
use bytes::BytesMut;
use error_stack::Report;
#[cfg(feature = "postgres")]
use postgres_types::{FromSql, IsNull, ToSql, Type};
use time::OffsetDateTime;
use type_system::principal::{actor::UserId, actor_group::WebId};
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

/// What an API token acts as.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ApiTokenType {
    /// A token that acts as the user it belongs to.
    User,
}

impl ApiTokenType {
    /// The three-letter code of the type.
    #[must_use]
    pub const fn code(self) -> &'static [u8; 3] {
        match self {
            Self::User => b"pat",
        }
    }

    /// The type with the code `code`, or `None` for an unknown code.
    #[must_use]
    pub const fn from_code(code: [u8; 3]) -> Option<Self> {
        match &code {
            b"pat" => Some(Self::User),
            _ => None,
        }
    }
}

#[cfg(feature = "postgres")]
impl ToSql for ApiTokenType {
    postgres_types::accepts!(TEXT);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        str::from_utf8(self.code())?.to_sql(ty, out)
    }
}

#[cfg(feature = "postgres")]
impl FromSql<'_> for ApiTokenType {
    postgres_types::accepts!(TEXT);

    fn from_sql(ty: &Type, raw: &[u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let code = <&str>::from_sql(ty, raw)?;
        <[u8; 3]>::try_from(code.as_bytes())
            .ok()
            .and_then(Self::from_code)
            .ok_or_else(|| format!("unknown API token type `{code}`").into())
    }
}

/// The version of the format an API token is written in.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum ApiTokenVersion {
    /// The initial version.
    V0,
}

impl ApiTokenVersion {
    /// The number of the version.
    #[must_use]
    pub const fn number(self) -> u8 {
        match self {
            Self::V0 => 0,
        }
    }

    /// The version with the number `number`, or `None` for an unknown one.
    #[must_use]
    pub const fn from_number(number: u8) -> Option<Self> {
        match number {
            0 => Some(Self::V0),
            _ => None,
        }
    }
}

#[cfg(feature = "postgres")]
impl ToSql for ApiTokenVersion {
    postgres_types::accepts!(INT2);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        i16::from(self.number()).to_sql(ty, out)
    }
}

#[cfg(feature = "postgres")]
impl FromSql<'_> for ApiTokenVersion {
    postgres_types::accepts!(INT2);

    fn from_sql(ty: &Type, raw: &[u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let number = i16::from_sql(ty, raw)?;
        u8::try_from(number)
            .ok()
            .and_then(Self::from_number)
            .ok_or_else(|| format!("unknown API token version `{number}`").into())
    }
}

/// The SHA-256 hash of an API token's secret.
///
/// `Debug` leaves out the hash.
#[derive(Copy, Clone, PartialEq, Eq, derive_more::Debug)]
#[debug("ApiTokenSecretHash(..)")]
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

/// The SHA-256 hash of an API token's secret, encrypted with AES-256-GCM.
///
/// The first 12 bytes are the nonce, followed by the 32 bytes of ciphertext and the 16-byte tag.
///
/// `Debug` leaves out the bytes.
#[derive(Copy, Clone, PartialEq, Eq, derive_more::Debug)]
#[debug("ApiTokenEncryptedSecretHash(..)")]
pub struct ApiTokenEncryptedSecretHash([u8; 60]);

impl ApiTokenEncryptedSecretHash {
    #[must_use]
    pub const fn new(encrypted_hash: [u8; 60]) -> Self {
        Self(encrypted_hash)
    }

    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 60] {
        &self.0
    }
}

#[cfg(feature = "postgres")]
impl ToSql for ApiTokenEncryptedSecretHash {
    postgres_types::accepts!(BYTEA);

    postgres_types::to_sql_checked!();

    fn to_sql(&self, ty: &Type, out: &mut BytesMut) -> Result<IsNull, Box<dyn Error + Sync + Send>>
    where
        Self: Sized,
    {
        self.0.as_slice().to_sql(ty, out)
    }
}

#[cfg(feature = "postgres")]
impl FromSql<'_> for ApiTokenEncryptedSecretHash {
    postgres_types::accepts!(BYTEA);

    fn from_sql(ty: &Type, raw: &[u8]) -> Result<Self, Box<dyn Error + Sync + Send>> {
        let bytes = <&[u8]>::from_sql(ty, raw)?;
        <[u8; 60]>::try_from(bytes).map(Self).map_err(|_error| {
            format!("an encrypted secret hash has 60 bytes, not {}", bytes.len()).into()
        })
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

/// The name a user gives an API token: between 1 and [`ApiTokenName::MAX_LENGTH`] characters,
/// without NUL characters.
#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg_attr(
    feature = "postgres",
    derive(postgres_types::ToSql, postgres_types::FromSql),
    postgres(transparent)
)]
pub struct ApiTokenName(String);

impl ApiTokenName {
    /// The maximum number of characters in a name.
    pub const MAX_LENGTH: usize = 128;

    /// The name `name`.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenNameError`] if `name` is empty, has more than [`Self::MAX_LENGTH`]
    /// characters or contains a NUL character.
    pub fn new(name: String) -> Result<Self, ApiTokenNameError> {
        if (1..=Self::MAX_LENGTH).contains(&name.chars().count()) && !name.contains('\0') {
            Ok(Self(name))
        } else {
            Err(ApiTokenNameError)
        }
    }

    #[must_use]
    pub const fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl From<ApiTokenName> for String {
    fn from(name: ApiTokenName) -> Self {
        name.0
    }
}

/// Why a name is not an [`ApiTokenName`].
#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display(
    "the name must be between 1 and {} characters long and must not contain NUL characters",
    ApiTokenName::MAX_LENGTH
)]
pub struct ApiTokenNameError;

/// An API token to record.
#[derive(Debug)]
pub struct CreateApiTokenParams {
    pub token_id: ApiTokenId,
    pub token_type: ApiTokenType,
    pub version: ApiTokenVersion,
    /// The user the token acts as. The token belongs to the user's web.
    pub user_id: UserId,
    pub name: ApiTokenName,
    /// How long the token stays valid after its creation, or `None` for a token without expiry.
    pub lifetime: Option<Duration>,
    pub encryption_key_id: ApiTokenEncryptionKeyId,
    pub encrypted_secret_hash: ApiTokenEncryptedSecretHash,
}

/// What a store records about an API token, without its encrypted secret hash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiTokenMetadata {
    pub token_id: ApiTokenId,
    pub token_type: ApiTokenType,
    pub version: ApiTokenVersion,
    /// The web that owns the token.
    pub web_id: WebId,
    pub name: ApiTokenName,
    pub created_at: OffsetDateTime,
    pub expires_at: Option<OffsetDateTime>,
    pub last_used_at: Option<OffsetDateTime>,
    pub revoked_at: Option<OffsetDateTime>,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the API token could not be recorded")]
pub struct ApiTokenInsertionError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the API tokens could not be read")]
pub struct ApiTokenRetrievalError;

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum ApiTokenRevocationError {
    /// The web has no API token with the requested ID.
    #[display("the API token does not exist")]
    NotFound,
    #[display("the API token could not be revoked")]
    Store,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("the API tokens of the web could not be revoked")]
pub struct WebApiTokenRevocationError;

/// What a store records about an API token, which a presented token is verified against.
#[derive(Debug)]
pub struct ApiTokenCredential {
    pub token_type: ApiTokenType,
    pub version: ApiTokenVersion,
    /// The user the token acts as.
    pub user_id: UserId,
    /// The web that owns the token.
    pub web_id: WebId,
    pub encryption_key_id: ApiTokenEncryptionKeyId,
    pub encrypted_secret_hash: ApiTokenEncryptedSecretHash,
}

/// Why a presented secret does not verify against an [`ApiTokenCredential`].
#[derive(Debug, Copy, Clone, derive_more::Display, derive_more::Error)]
pub enum ApiTokenVerificationError {
    /// The type or version of the presented token differs from the recorded one.
    #[display("the type or version of the API token does not match its record")]
    TokenMismatch,
    /// The hash of the presented secret differs from the recorded one.
    #[display("the secret does not match the API token")]
    SecretMismatch,
    /// No configured key has the ID the credential names.
    #[display("the key `{key_id}` that encrypted the API token is not configured")]
    UnknownKey { key_id: ApiTokenEncryptionKeyId },
    /// The encrypted secret hash does not decrypt with the configured key for the token and its
    /// row.
    #[display("the encrypted secret hash does not decrypt for its token")]
    Undecryptable,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum ApiTokenAuthenticationError {
    /// No user has an API token with the requested ID.
    #[display("the API token does not exist")]
    NotFound,
    /// The presented token does not verify, for `reason`.
    #[display("the API token could not be verified")]
    Verification { reason: ApiTokenVerificationError },
    #[display("the API token is revoked")]
    Revoked,
    #[display("the API token is expired")]
    Expired,
    #[display("the API token could not be read or its use could not be recorded")]
    Store,
}

/// Records, lists, authenticates and revokes API tokens.
pub trait ApiTokenStore {
    /// Records the API token `params` describes.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenInsertionError`] if the token cannot be recorded, for example because the
    /// user does not exist or the token ID is taken.
    fn create_api_token(
        &mut self,
        params: CreateApiTokenParams,
    ) -> impl Future<Output = Result<ApiTokenMetadata, Report<ApiTokenInsertionError>>> + Send;

    /// Returns the API tokens of `web_id`, newest first, expired and revoked ones included.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenRetrievalError`] if the tokens cannot be read.
    fn list_api_tokens(
        &self,
        web_id: WebId,
    ) -> impl Future<Output = Result<Vec<ApiTokenMetadata>, Report<ApiTokenRetrievalError>>> + Send;

    /// Revokes the API token `token_id` of `web_id`.
    ///
    /// A revoked token keeps the time it was first revoked at.
    ///
    /// # Errors
    ///
    /// - [`NotFound`] if `web_id` has no token `token_id`
    /// - [`Store`] if the token cannot be revoked
    ///
    /// [`NotFound`]: ApiTokenRevocationError::NotFound
    /// [`Store`]: ApiTokenRevocationError::Store
    fn revoke_api_token(
        &mut self,
        web_id: WebId,
        token_id: ApiTokenId,
    ) -> impl Future<Output = Result<(), Report<ApiTokenRevocationError>>> + Send;

    /// Revokes the API tokens of `web_id` that are not revoked yet, and returns how many it
    /// revoked.
    ///
    /// A revoked token keeps the time it was first revoked at.
    ///
    /// # Errors
    ///
    /// Returns [`WebApiTokenRevocationError`] if the tokens cannot be revoked.
    fn revoke_web_api_tokens(
        &mut self,
        web_id: WebId,
    ) -> impl Future<Output = Result<u64, Report<WebApiTokenRevocationError>>> + Send;

    /// Authenticates the API token `token_id` and returns the user it acts as.
    ///
    /// Reads the [`ApiTokenCredential`] of `token_id` and passes it to `verify`. Only a verified
    /// token is checked for revocation and expiry, and only a token that authenticates has its use
    /// recorded, at most once a minute.
    ///
    /// # Errors
    ///
    /// - [`NotFound`] if no user has a token `token_id`
    /// - [`Verification`] if `verify` fails
    /// - [`Revoked`] if the token is revoked
    /// - [`Expired`] if the token is expired
    /// - [`Store`] if the token cannot be read or its use cannot be recorded
    ///
    /// [`NotFound`]: ApiTokenAuthenticationError::NotFound
    /// [`Verification`]: ApiTokenAuthenticationError::Verification
    /// [`Revoked`]: ApiTokenAuthenticationError::Revoked
    /// [`Expired`]: ApiTokenAuthenticationError::Expired
    /// [`Store`]: ApiTokenAuthenticationError::Store
    fn authenticate_api_token<F>(
        &mut self,
        token_id: ApiTokenId,
        verify: F,
    ) -> impl Future<Output = Result<UserId, Report<ApiTokenAuthenticationError>>> + Send
    where
        F: FnOnce(&ApiTokenCredential) -> Result<(), Report<ApiTokenVerificationError>> + Send;
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::{ApiTokenEncryptedSecretHash, ApiTokenName, ApiTokenSecretHash};

    #[test]
    fn secret_hash_debug() {
        assert!(
            !format!("{:?}", ApiTokenSecretHash::new([0xAB; 32])).contains("171"),
            "the debug output should leave out the hash"
        );
    }

    #[test]
    fn encrypted_secret_hash_debug() {
        assert!(
            !format!("{:?}", ApiTokenEncryptedSecretHash::new([0xAB; 60])).contains("171"),
            "the debug output should leave out the bytes"
        );
    }

    #[rstest]
    #[case::one_character("a".to_owned())]
    #[case::multibyte_maximum("\u{e4}".repeat(128))]
    fn name_accepted(#[case] name: String) {
        assert_eq!(
            ApiTokenName::new(name.clone())
                .expect("the name should be accepted")
                .as_str(),
            name,
            "the name should keep its text"
        );
    }

    #[rstest]
    #[case::empty(String::new())]
    #[case::too_long("a".repeat(129))]
    #[case::nul("a\0b".to_owned())]
    fn name_rejected(#[case] name: String) {
        assert!(
            ApiTokenName::new(name).is_err(),
            "the name should be rejected"
        );
    }
}
