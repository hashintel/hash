use core::time::Duration;

use error_stack::Report;
use hash_graph_store::api_token::{ApiTokenName, ApiTokenType, CreateApiTokenParams};
use type_system::principal::{
    actor::{ActorEntityUuid, UserId},
    actor_group::WebId,
};

use super::{
    ApiToken, ApiTokenEncryptionKey, ApiTokenGenerationError, Environment, HashedApiToken,
};

/// Generates API tokens for an environment and encrypts their secret hashes with a key.
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
}

/// A token an [`ApiTokenIssuer`] generated, and the parameters a store records it with.
#[derive(Debug)]
pub struct IssuedApiToken {
    pub token: ApiToken,
    pub params: CreateApiTokenParams,
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use hash_graph_store::api_token::{ApiTokenEncryptionKeyId, ApiTokenName};
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
}
