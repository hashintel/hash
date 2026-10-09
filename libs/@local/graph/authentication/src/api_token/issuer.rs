use core::time::Duration;

use hash_graph_store::api_token::{
    ApiTokenCredential, ApiTokenName, ApiTokenType, ApiTokenVerificationError, CreateApiTokenParams,
};
use type_system::principal::{
    actor::{ActorEntityUuid, UserId},
    actor_group::WebId,
};

use super::{
    ApiToken, ApiTokenEncryptionKey, ApiTokenGenerationError, Environment, HashedApiToken,
};

/// Generates API tokens for an environment, encrypts their secret hashes with a key, and verifies
/// presented tokens against what a store recorded for them.
#[derive(Debug)]
pub struct ApiTokenIssuer {
    key: ApiTokenEncryptionKey,
    environment: Environment,
}

impl ApiTokenIssuer {
    #[must_use]
    pub const fn new(key: ApiTokenEncryptionKey, environment: Environment) -> Self {
        Self { key, environment }
    }

    /// The environment of the tokens this issuer generates.
    #[must_use]
    pub const fn environment(&self) -> Environment {
        self.environment
    }

    /// Generates a token that acts as `user_id`, and the parameters a store records it with.
    ///
    /// The secret hash is encrypted for the row of `user_id` in the user's web.
    ///
    /// # Errors
    ///
    /// Returns [`ApiTokenGenerationError`] if the random number generator fails.
    pub fn issue(
        &self,
        user_id: UserId,
        name: ApiTokenName,
        lifetime: Option<Duration>,
    ) -> Result<IssuedApiToken, Report<ApiTokenGenerationError>> {
        let token = ApiToken::generate(ApiTokenType::User, self.environment)?;
        let hashed = HashedApiToken::from(&token);
        let associated_data =
            hashed.associated_data(ActorEntityUuid::from(user_id), WebId::from(user_id));

        Ok(IssuedApiToken {
            params: CreateApiTokenParams {
                token_id: hashed.token_id(),
                token_type: hashed.token_type(),
                version: hashed.version(),
                user_id,
                name,
                lifetime,
                encryption_key_id: self.key.id(),
                encrypted_secret_hash: self.key.encrypt(hashed.secret_hash(), &associated_data),
            },
            token,
        })
    }

    /// Checks that `token` is the one `credential` records.
    ///
    /// The secret hashes are compared in variable time.
    ///
    /// # Errors
    ///
    /// - [`TokenMismatch`] if the type or version of `token` differs from the recorded one
    /// - [`UnknownKey`] if `credential` names an encryption key other than the issuer's
    /// - [`Undecryptable`] if the encrypted secret hash does not decrypt for `token` and the row of
    ///   `credential`
    /// - [`SecretMismatch`] if the secret of `token` differs from the recorded one
    ///
    /// [`TokenMismatch`]: ApiTokenVerificationError::TokenMismatch
    /// [`UnknownKey`]: ApiTokenVerificationError::UnknownKey
    /// [`Undecryptable`]: ApiTokenVerificationError::Undecryptable
    /// [`SecretMismatch`]: ApiTokenVerificationError::SecretMismatch
    pub fn verify(
        &self,
        token: &HashedApiToken,
        credential: &ApiTokenCredential,
    ) -> Result<(), ApiTokenVerificationError> {
        if (credential.token_type, credential.version) != (token.token_type(), token.version()) {
            return Err(ApiTokenVerificationError::TokenMismatch);
        }
        if credential.encryption_key_id != self.key.id() {
            return Err(ApiTokenVerificationError::UnknownKey {
                key_id: credential.encryption_key_id,
            });
        }

        let associated_data =
            token.associated_data(ActorEntityUuid::from(credential.user_id), credential.web_id);
        let secret_hash = self
            .key
            .decrypt(credential.encrypted_secret_hash, &associated_data)
            .map_err(|_error| ApiTokenVerificationError::Undecryptable)?;

        if secret_hash == token.secret_hash() {
            Ok(())
        } else {
            Err(ApiTokenVerificationError::SecretMismatch)
        }
    }
}

/// A token an [`ApiTokenIssuer`] generated, and the parameters a store records it with.
#[derive(Debug)]
pub struct IssuedApiToken {
    pub token: ApiToken,
    pub params: CreateApiTokenParams,
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, time::Duration};

    use hash_graph_store::api_token::{
        ApiTokenCredential, ApiTokenEncryptionKeyId, ApiTokenName, ApiTokenSecretHash,
        ApiTokenVerificationError,
    };
    use rstest::rstest;
    use type_system::principal::{
        actor::{ActorEntityUuid, UserId},
        actor_group::WebId,
    };
    use uuid::Uuid;

    use super::{ApiTokenIssuer, IssuedApiToken};
    use crate::api_token::{ApiTokenEncryptionKey, Environment, HashedApiToken};

    const KEY: [u8; 32] = [7; 32];

    fn key_id() -> ApiTokenEncryptionKeyId {
        ApiTokenEncryptionKeyId::new(Uuid::from_u128(0x3333_3333_3333_3333_3333_3333_3333_3333))
    }

    #[test]
    fn issue_matches_token() {
        let issuer = ApiTokenIssuer::new(
            ApiTokenEncryptionKey::new(key_id(), &KEY),
            Environment::Staging,
        );
        let user_id = UserId::new(Uuid::from_u128(0x1111_1111_1111_1111_1111_1111_1111_1111));
        let lifetime = Duration::from_hours(24);

        let IssuedApiToken { token, params } = issuer
            .issue(
                user_id,
                ApiTokenName::new("ci".to_owned()).expect("the name should be valid"),
                Some(lifetime),
            )
            .expect("the random number generator should provide bytes");

        let hashed: HashedApiToken = token
            .expose()
            .parse()
            .expect("the issued token should parse");
        assert_eq!(
            hashed.environment(),
            Environment::Staging,
            "the token should belong to the issuer's environment"
        );
        assert_eq!(
            params.token_id,
            hashed.token_id(),
            "the parameters should record the token's ID"
        );
        assert_eq!(
            (params.user_id, params.name.as_str(), params.lifetime),
            (user_id, "ci", Some(lifetime)),
            "the parameters should carry the user, name and lifetime"
        );
        assert_eq!(
            params.encryption_key_id,
            key_id(),
            "the parameters should name the issuer's key"
        );
        assert_eq!(
            ApiTokenEncryptionKey::new(key_id(), &KEY)
                .decrypt(
                    params.encrypted_secret_hash,
                    &hashed.associated_data(ActorEntityUuid::from(user_id), WebId::from(user_id)),
                )
                .expect("the secret hash should decrypt for the user's row"),
            hashed.secret_hash(),
            "the parameters should record the hash of the token's secret"
        );
    }

    fn key() -> ApiTokenEncryptionKey {
        ApiTokenEncryptionKey::new(key_id(), &KEY)
    }

    fn issuer() -> ApiTokenIssuer {
        ApiTokenIssuer::new(key(), Environment::Local)
    }

    /// Issues a token and returns it as a [`HashedApiToken`], with the credential a store records
    /// for it.
    fn issued(issuer: &ApiTokenIssuer) -> (HashedApiToken, ApiTokenCredential) {
        let IssuedApiToken { token, params } = issuer.issue(
            UserId::new(Uuid::new_v4()),
            ApiTokenName::new("ci".to_owned()).expect("the name should be valid"),
            None,
        );
        let credential = ApiTokenCredential {
            token_type: params.token_type,
            version: params.version,
            user_id: params.user_id,
            web_id: WebId::from(params.user_id),
            encryption_key_id: params.encryption_key_id,
            encrypted_secret_hash: params.encrypted_secret_hash,
        };
        (HashedApiToken::from(token), credential)
    }

    #[test]
    fn verify_issued() {
        let issuer = issuer();
        let (token, credential) = issued(&issuer);

        issuer
            .verify(&token, &credential)
            .expect("an issued token should verify against its credential");
    }

    #[test]
    fn verify_wrong_secret() {
        let issuer = issuer();
        let (token, mut credential) = issued(&issuer);
        credential.encrypted_secret_hash = key().encrypt(
            ApiTokenSecretHash::new([1; 32]),
            &token.associated_data(ActorEntityUuid::from(credential.user_id), credential.web_id),
        );

        let error = issuer
            .verify(&token, &credential)
            .expect_err("a token with another secret should not verify");

        assert_matches!(
            error,
            ApiTokenVerificationError::SecretMismatch,
            "the failure should be a secret mismatch"
        );
    }

    #[test]
    fn verify_unknown_key() {
        let issuer = issuer();
        let (token, mut credential) = issued(&issuer);
        credential.encryption_key_id = ApiTokenEncryptionKeyId::new(Uuid::new_v4());

        let error = issuer
            .verify(&token, &credential)
            .expect_err("a credential naming another key should not verify");

        assert_matches!(
            error,
            ApiTokenVerificationError::UnknownKey { key_id }
                if key_id == credential.encryption_key_id,
            "the failure should name the unknown key"
        );
    }

    #[rstest]
    #[case::user(|credential: &mut ApiTokenCredential| {
        credential.user_id = UserId::new(Uuid::new_v4());
    })]
    #[case::web(|credential: &mut ApiTokenCredential| {
        credential.web_id = WebId::new(Uuid::new_v4());
    })]
    fn verify_moved_row(#[case] move_row: fn(&mut ApiTokenCredential)) {
        let issuer = issuer();
        let (token, mut credential) = issued(&issuer);
        move_row(&mut credential);

        let error = issuer
            .verify(&token, &credential)
            .expect_err("a token whose row was moved should not verify");

        assert_matches!(
            error,
            ApiTokenVerificationError::Undecryptable,
            "the failure should be an undecryptable secret hash"
        );
    }
}
