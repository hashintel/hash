#![expect(
    unreachable_pub,
    reason = "the shared harness is public for the test binaries that re-export it, which this \
              one does not"
)]
#![expect(
    clippy::panic_in_result_fn,
    reason = "the tests assert on values the store returns as results"
)]

extern crate alloc;

#[path = "../common/mod.rs"]
mod common;

use alloc::sync::Arc;
use core::{assert_matches, error::Error, ops::ControlFlow, time::Duration};

use error_stack::Report;
use futures::lock::Mutex;
use hash_graph_authentication::api_token::{
    ApiTokenEncryptionKey, ApiTokenIssuer, ApiTokenProvider, AuthenticateApiToken, Environment,
    HashedApiToken,
};
use hash_graph_authorization::policies::store::{
    CreateWebParameter, PolicyStore as _, PrincipalStore as _,
};
use hash_graph_postgres_store::store::{AsClient as _, InTransaction, PostgresStore};
use hash_graph_store::{
    api_token::{
        ApiTokenAuthenticationError, ApiTokenCredential, ApiTokenEncryptedSecretHash,
        ApiTokenEncryptionKeyId, ApiTokenId, ApiTokenMetadata, ApiTokenName,
        ApiTokenRevocationError, ApiTokenSecretHash, ApiTokenStore as _, ApiTokenType,
        ApiTokenVerificationError, ApiTokenVersion, CreateApiTokenParams,
    },
    email_subscription::{EmailSubscriptionError, EmailSubscriptionProvider},
    identity_provider::{IdentityDeletion, IdentityProvider, IdentityProviderError},
    oauth_provider::{OAuthProvider, OAuthProviderError},
    user_deletion,
};
use hash_middleware::authentication::{
    provider::AuthenticationProvider,
    request::{AuthenticationError, AuthenticationErrorKind},
};
use http::{HeaderMap, HeaderValue, header::AUTHORIZATION};
use pretty_assertions::assert_eq;
use time::OffsetDateTime;
use tokio_postgres::Transaction;
use type_system::principal::{
    actor::{ActorEntityUuid, ActorId, UserId},
    actor_group::WebId,
};
use uuid::Uuid;

use crate::common::DatabaseTestWrapper;

type Store<'t> = PostgresStore<Transaction<'t>, InTransaction>;

const LIFETIME: Duration = Duration::from_hours(30 * 24);

/// A user with its own web, created inside the test transaction.
async fn user_with_web(store: &mut Store<'_>) -> Result<(UserId, WebId), Box<dyn Error>> {
    store.seed_system_policies().await?;
    let machine = ActorId::Machine(store.get_or_create_system_machine("h").await?);

    let user_id = store.create_user(None).await?;
    let web_id = store
        .create_web(
            machine,
            CreateWebParameter {
                id: Some(user_id.into()),
                administrator: Some(ActorId::User(user_id)),
                shortname: None,
                is_actor_web: true,
            },
        )
        .await?
        .web_id;

    Ok((user_id, web_id))
}

fn token_params(
    user_id: UserId,
    lifetime: Option<Duration>,
) -> Result<CreateApiTokenParams, Box<dyn Error>> {
    Ok(CreateApiTokenParams {
        token_id: ApiTokenId::new(Uuid::new_v4()),
        token_type: ApiTokenType::User,
        version: ApiTokenVersion::V0,
        user_id,
        name: ApiTokenName::new("ci".to_owned())?,
        lifetime,
        encryption_key_id: ApiTokenEncryptionKeyId::new(Uuid::new_v4()),
        encrypted_secret_hash: ApiTokenEncryptedSecretHash::new([7; 60]),
    })
}

async fn create_token(
    store: &mut Store<'_>,
    user_id: UserId,
    lifetime: Option<Duration>,
) -> Result<ApiTokenMetadata, Box<dyn Error>> {
    let params = token_params(user_id, lifetime)?;
    Ok(store.create_api_token(params).await?)
}

/// The only token of `web_id`, as the store lists it.
async fn listed_token(
    store: &Store<'_>,
    web_id: WebId,
) -> Result<ApiTokenMetadata, Box<dyn Error>> {
    let [token] = <[ApiTokenMetadata; 1]>::try_from(store.list_api_tokens(web_id).await?)
        .expect("the web should have exactly one token");
    Ok(token)
}

#[tokio::test]
async fn create_listed() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;

    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    assert_eq!(
        listed_token(&store, web_id).await?,
        token,
        "the web should list the token as it was created"
    );

    Ok(())
}

#[tokio::test]
async fn create_stored_secret() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;
    let params = token_params(user_id, Some(LIFETIME))?;
    let encryption_key_id = params.encryption_key_id;
    let encrypted_secret_hash = params.encrypted_secret_hash;

    let token = store.create_api_token(params).await?;

    let row = store
        .as_client()
        .query_one(
            "SELECT encryption_key_id, encrypted_secret_hash FROM api_token WHERE token_id = $1",
            &[&token.token_id],
        )
        .await?;
    assert_eq!(
        (
            row.get::<_, ApiTokenEncryptionKeyId>(0),
            row.get::<_, ApiTokenEncryptedSecretHash>(1)
        ),
        (encryption_key_id, encrypted_secret_hash),
        "the store should record the key ID and the encrypted secret hash"
    );

    Ok(())
}

#[tokio::test]
async fn create_lifetime() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;

    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    assert_eq!(
        token.expires_at,
        Some(token.created_at + LIFETIME),
        "the token should expire its lifetime after its creation"
    );

    Ok(())
}

#[tokio::test]
async fn create_no_lifetime() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;

    let token = create_token(&mut store, user_id, None).await?;

    assert_eq!(
        token.expires_at, None,
        "a token without a lifetime should not expire"
    );

    Ok(())
}

#[tokio::test]
async fn list_other_web() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;

    create_token(&mut store, user_id, Some(LIFETIME)).await?;

    assert!(
        store
            .list_api_tokens(WebId::new(Uuid::new_v4()))
            .await?
            .is_empty(),
        "another web should not list the token"
    );

    Ok(())
}

#[tokio::test]
async fn list_newest_first() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let older = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    let newer = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    // `now()` is fixed for the whole transaction, so both tokens share a creation time until one is
    // moved back.
    store
        .as_client()
        .execute(
            "UPDATE api_token SET created_at = created_at - INTERVAL '1 day' WHERE token_id = $1",
            &[&older.token_id],
        )
        .await?;

    let listed: Vec<ApiTokenId> = store
        .list_api_tokens(web_id)
        .await?
        .into_iter()
        .map(|token| token.token_id)
        .collect();

    assert_eq!(
        listed,
        [newer.token_id, older.token_id],
        "the web should list the newest token first"
    );

    Ok(())
}

#[tokio::test]
async fn list_expired() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    expire(&store, token.token_id).await?;

    assert_eq!(
        listed_token(&store, web_id).await?.token_id,
        token.token_id,
        "the web should list an expired token"
    );

    Ok(())
}

#[tokio::test]
async fn revoke_active() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    store.revoke_api_token(web_id, token.token_id).await?;

    assert!(
        listed_token(&store, web_id).await?.revoked_at.is_some(),
        "the token should be revoked"
    );

    Ok(())
}

#[tokio::test]
async fn revoke_revoked() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    store.revoke_api_token(web_id, token.token_id).await?;
    let first_revoked_at = move_revocation_back(&store, token.token_id).await?;

    store.revoke_api_token(web_id, token.token_id).await?;

    assert_eq!(
        listed_token(&store, web_id).await?.revoked_at,
        Some(first_revoked_at),
        "revoking a revoked token should keep the first revocation time"
    );

    Ok(())
}

#[tokio::test]
async fn revoke_sibling() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let revoked = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    let sibling = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    store.revoke_api_token(web_id, revoked.token_id).await?;

    let tokens = store.list_api_tokens(web_id).await?;
    let listed_sibling = tokens
        .iter()
        .find(|token| token.token_id == sibling.token_id)
        .expect("the web should list the other token");
    assert_eq!(
        listed_sibling.revoked_at, None,
        "revoking one token should leave the other active"
    );

    Ok(())
}

#[tokio::test]
async fn revoke_other_web() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    let result = store
        .revoke_api_token(WebId::new(Uuid::new_v4()), token.token_id)
        .await;

    assert_matches!(
        result
            .expect_err("another web should not revoke the token")
            .current_context(),
        ApiTokenRevocationError::NotFound,
        "the failure should be reported as not found"
    );
    assert_eq!(
        listed_token(&store, web_id).await?.revoked_at,
        None,
        "the token should stay active"
    );

    Ok(())
}

#[expect(
    clippy::unnecessary_wraps,
    reason = "the signature is the one `authenticate_api_token` takes"
)]
const fn accept(_credential: &ApiTokenCredential) -> Result<(), Report<ApiTokenVerificationError>> {
    Ok(())
}

fn reject(_credential: &ApiTokenCredential) -> Result<(), Report<ApiTokenVerificationError>> {
    Err(Report::new(ApiTokenVerificationError::SecretMismatch))
}

/// Sets the recorded use of `token_id` to `interval` before the transaction time and returns it.
async fn record_use_ago(
    store: &Store<'_>,
    token_id: ApiTokenId,
    interval: &str,
) -> Result<OffsetDateTime, Box<dyn Error>> {
    Ok(store
        .as_client()
        .query_one(
            "UPDATE api_token SET last_used_at = now() - $2::TEXT::INTERVAL WHERE token_id = $1 \
             RETURNING last_used_at",
            &[&token_id, &interval],
        )
        .await?
        .get(0))
}

/// Moves the creation and expiry of `token_id` 60 days back, so a token with a lifetime of 30 days
/// is expired.
async fn expire(store: &Store<'_>, token_id: ApiTokenId) -> Result<(), Box<dyn Error>> {
    store
        .as_client()
        .execute(
            "UPDATE api_token SET created_at = created_at - INTERVAL '60 days', expires_at = \
             expires_at - INTERVAL '60 days' WHERE token_id = $1",
            &[&token_id],
        )
        .await?;
    Ok(())
}

/// Moves the revocation of `token_id` one day back and returns it.
///
/// `now()` is fixed for the whole transaction, so a second revocation would set the same time.
/// Moving the first one back tells the two apart.
async fn move_revocation_back(
    store: &Store<'_>,
    token_id: ApiTokenId,
) -> Result<OffsetDateTime, Box<dyn Error>> {
    Ok(store
        .as_client()
        .query_one(
            "UPDATE api_token SET revoked_at = revoked_at - INTERVAL '1 day' WHERE token_id = $1 \
             RETURNING revoked_at",
            &[&token_id],
        )
        .await?
        .get(0))
}

/// Moves `token_id` to the web `web_id`.
async fn move_to_web(
    store: &Store<'_>,
    token_id: ApiTokenId,
    web_id: WebId,
) -> Result<(), Box<dyn Error>> {
    store
        .as_client()
        .execute(
            "UPDATE api_token SET web_id = $2 WHERE token_id = $1",
            &[&token_id, &web_id],
        )
        .await?;
    Ok(())
}

/// Lets `token_id` act as `actor_id`.
async fn move_to_actor(
    store: &Store<'_>,
    token_id: ApiTokenId,
    actor_id: ActorEntityUuid,
) -> Result<(), Box<dyn Error>> {
    store
        .as_client()
        .execute(
            "UPDATE api_token SET actor_id = $2 WHERE token_id = $1",
            &[&token_id, &actor_id],
        )
        .await?;
    Ok(())
}

#[tokio::test]
async fn authenticate_credential() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;
    let (_, other_web_id) = user_with_web(&mut store).await?;
    let params = token_params(user_id, Some(LIFETIME))?;
    let encryption_key_id = params.encryption_key_id;
    let encrypted_secret_hash = params.encrypted_secret_hash;
    let token = store.create_api_token(params).await?;
    move_to_web(&store, token.token_id, other_web_id).await?;

    let mut verified = None;
    let authenticated = store
        .authenticate_api_token(token.token_id, |credential| {
            verified = Some((
                credential.token_type,
                credential.version,
                credential.user_id,
                credential.web_id,
                credential.encryption_key_id,
                credential.encrypted_secret_hash,
            ));
            Ok(())
        })
        .await?;

    assert_eq!(
        verified,
        Some((
            ApiTokenType::User,
            ApiTokenVersion::V0,
            user_id,
            other_web_id,
            encryption_key_id,
            encrypted_secret_hash
        )),
        "the token should be verified against its recorded type, version, actor, web and secret \
         hash"
    );
    assert_eq!(
        authenticated, user_id,
        "the token should authenticate as its user"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_use_first() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    store.authenticate_api_token(token.token_id, accept).await?;

    assert_eq!(
        listed_token(&store, web_id).await?.last_used_at,
        Some(token.created_at),
        "the first use should be recorded at the transaction time"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_use_recent() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    let last_used_at = record_use_ago(&store, token.token_id, "30 seconds").await?;

    store.authenticate_api_token(token.token_id, accept).await?;

    assert_eq!(
        listed_token(&store, web_id).await?.last_used_at,
        Some(last_used_at),
        "a use within a minute of the last one should not be recorded"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_use_due() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    record_use_ago(&store, token.token_id, "2 minutes").await?;

    store.authenticate_api_token(token.token_id, accept).await?;

    assert_eq!(
        listed_token(&store, web_id).await?.last_used_at,
        Some(token.created_at),
        "a use more than a minute after the last one should be recorded"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_use_sibling() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let used = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    let sibling = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    store.authenticate_api_token(used.token_id, accept).await?;

    let tokens = store.list_api_tokens(web_id).await?;
    let listed_sibling = tokens
        .iter()
        .find(|token| token.token_id == sibling.token_id)
        .expect("the web should list the other token");
    assert_eq!(
        listed_sibling.last_used_at, None,
        "using one token should not record a use of the other"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_unknown() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;
    create_token(&mut store, user_id, Some(LIFETIME)).await?;

    let result = store
        .authenticate_api_token(ApiTokenId::new(Uuid::new_v4()), accept)
        .await;

    assert_matches!(
        result
            .expect_err("an unknown token should not authenticate")
            .current_context(),
        ApiTokenAuthenticationError::NotFound,
        "the failure should be reported as not found"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_non_user() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    let machine = store.get_or_create_system_machine("h").await?;
    move_to_actor(&store, token.token_id, ActorEntityUuid::from(machine)).await?;

    let result = store.authenticate_api_token(token.token_id, accept).await;

    assert_matches!(
        result
            .expect_err("a token of a machine should not authenticate")
            .current_context(),
        ApiTokenAuthenticationError::NotFound,
        "the failure should be reported as not found"
    );
    assert_eq!(
        listed_token(&store, web_id).await?.last_used_at,
        None,
        "the use should not be recorded"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_wrong_secret() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    let result = store.authenticate_api_token(token.token_id, reject).await;

    assert_matches!(
        result
            .expect_err("a rejected secret should not authenticate")
            .current_context(),
        ApiTokenAuthenticationError::Verification {
            reason: ApiTokenVerificationError::SecretMismatch
        },
        "the failure should be reported as a failed verification with its reason"
    );
    assert_eq!(
        listed_token(&store, web_id).await?.last_used_at,
        None,
        "the use should not be recorded"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_revoked() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    store.revoke_api_token(web_id, token.token_id).await?;

    let result = store.authenticate_api_token(token.token_id, accept).await;

    assert_matches!(
        result
            .expect_err("a revoked token should not authenticate")
            .current_context(),
        ApiTokenAuthenticationError::Revoked,
        "the failure should be reported as revoked"
    );
    assert_eq!(
        listed_token(&store, web_id).await?.last_used_at,
        None,
        "the use should not be recorded"
    );

    Ok(())
}

/// A revoked token with the wrong secret fails the verification, so the revocation of a token is
/// only learned with its secret.
#[tokio::test]
async fn authenticate_revoked_wrong_secret() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    store.revoke_api_token(web_id, token.token_id).await?;

    let result = store.authenticate_api_token(token.token_id, reject).await;

    assert_matches!(
        result
            .expect_err("a revoked token should not authenticate")
            .current_context(),
        ApiTokenAuthenticationError::Verification { .. },
        "a revoked token with a rejected secret should fail the verification, not report the \
         revocation"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_expired_wrong_secret() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    expire(&store, token.token_id).await?;

    let result = store.authenticate_api_token(token.token_id, reject).await;

    assert_matches!(
        result
            .expect_err("an expired token should not authenticate")
            .current_context(),
        ApiTokenAuthenticationError::Verification { .. },
        "an expired token with a rejected secret should fail the verification, not report the \
         expiry"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_expired() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    expire(&store, token.token_id).await?;

    let result = store.authenticate_api_token(token.token_id, accept).await;

    assert_matches!(
        result
            .expect_err("an expired token should not authenticate")
            .current_context(),
        ApiTokenAuthenticationError::Expired,
        "the failure should be reported as expired"
    );
    assert_eq!(
        listed_token(&store, web_id).await?.last_used_at,
        None,
        "the use should not be recorded"
    );

    Ok(())
}

#[tokio::test]
async fn authenticate_no_lifetime() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, None).await?;

    let authenticated = store.authenticate_api_token(token.token_id, accept).await?;

    assert_eq!(
        authenticated, user_id,
        "a token without a lifetime should authenticate"
    );

    Ok(())
}

#[tokio::test]
async fn revoke_web_revoked() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let revoked = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    let active = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    store.revoke_api_token(web_id, revoked.token_id).await?;
    let first_revoked_at = move_revocation_back(&store, revoked.token_id).await?;

    let count = store.revoke_web_api_tokens(web_id).await?;

    let tokens = store.list_api_tokens(web_id).await?;
    let revoked_at = |token_id| {
        tokens
            .iter()
            .find(|token| token.token_id == token_id)
            .expect("the web should list the token")
            .revoked_at
    };
    assert_eq!(count, 1, "only the token not yet revoked should be counted");
    assert_eq!(
        revoked_at(active.token_id),
        Some(active.created_at),
        "the active token should be revoked"
    );
    assert_eq!(
        revoked_at(revoked.token_id),
        Some(first_revoked_at),
        "the revoked token should keep its revocation time"
    );

    Ok(())
}

#[tokio::test]
async fn revoke_web_other_web() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let (_, other_web_id) = user_with_web(&mut store).await?;
    create_token(&mut store, user_id, Some(LIFETIME)).await?;

    let count = store.revoke_web_api_tokens(other_web_id).await?;

    assert_eq!(count, 0, "another web should revoke no tokens");
    assert_eq!(
        listed_token(&store, web_id).await?.revoked_at,
        None,
        "the token should stay active"
    );

    Ok(())
}

#[tokio::test]
async fn revoke_web_token_in_other_web() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let (_, other_web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;
    move_to_web(&store, token.token_id, other_web_id).await?;

    let count = store.revoke_web_api_tokens(web_id).await?;

    assert_eq!(
        count, 0,
        "a token acting as the user in another web should not be revoked"
    );
    assert_eq!(
        listed_token(&store, other_web_id).await?.revoked_at,
        None,
        "the token should stay active"
    );

    Ok(())
}

#[tokio::test]
async fn revoke_web_other_actor() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (_, web_id) = user_with_web(&mut store).await?;
    let (other_user_id, _) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, other_user_id, Some(LIFETIME)).await?;
    move_to_web(&store, token.token_id, web_id).await?;

    let count = store.revoke_web_api_tokens(web_id).await?;

    assert_eq!(
        count, 1,
        "a token of another actor in the web should be revoked"
    );
    assert!(
        listed_token(&store, web_id).await?.revoked_at.is_some(),
        "the token should be revoked"
    );

    Ok(())
}

/// External services that hold nothing for the user.
struct NoExternalAccounts;

impl IdentityProvider for NoExternalAccounts {
    fn delete_identity(
        &self,
        _identity_id: &str,
    ) -> impl Future<Output = Result<IdentityDeletion, Report<IdentityProviderError>>> + Send {
        core::future::ready(Ok(IdentityDeletion::Deleted))
    }

    fn get_identity_emails(
        &self,
        _identity_id: &str,
    ) -> impl Future<Output = Result<Option<Vec<String>>, Report<IdentityProviderError>>> + Send
    {
        core::future::ready(Ok(Some(Vec::new())))
    }
}

impl OAuthProvider for NoExternalAccounts {
    fn revoke_consent_sessions(
        &self,
        _subject: &str,
    ) -> impl Future<Output = Result<(), Report<OAuthProviderError>>> + Send {
        core::future::ready(Ok(()))
    }

    fn revoke_login_sessions(
        &self,
        _subject: &str,
    ) -> impl Future<Output = Result<(), Report<OAuthProviderError>>> + Send {
        core::future::ready(Ok(()))
    }
}

impl EmailSubscriptionProvider for NoExternalAccounts {
    fn delete_subscriber(
        &self,
        _email: &str,
    ) -> impl Future<Output = Result<(), Report<EmailSubscriptionError>>> + Send {
        core::future::ready(Ok(()))
    }
}

#[tokio::test]
async fn delete_user_revokes_tokens() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = create_token(&mut store, user_id, Some(LIFETIME)).await?;

    let outcome = user_deletion::delete_user(
        &mut store,
        &NoExternalAccounts,
        &NoExternalAccounts,
        None::<&NoExternalAccounts>,
        ActorId::User(user_id),
        user_id,
        Some("identity".to_owned()),
    )
    .await?;

    assert_eq!(
        outcome.report.api_tokens_revoked, 1,
        "the deletion should report the revoked token"
    );
    assert_eq!(
        listed_token(&store, web_id).await?.revoked_at,
        Some(token.created_at),
        "the deletion should revoke the token"
    );

    Ok(())
}

fn key() -> ApiTokenEncryptionKey {
    ApiTokenEncryptionKey::new(ApiTokenEncryptionKeyId::new(Uuid::nil()), &[7; 32])
}

fn issuer() -> ApiTokenIssuer {
    ApiTokenIssuer::new(key(), Environment::Local)
}

/// Authenticates API tokens with the store of the test transaction.
struct TransactionTokens<'s, 't>(Mutex<&'s mut Store<'t>>);

impl AuthenticateApiToken for TransactionTokens<'_, '_> {
    async fn authenticate_api_token<F>(
        &self,
        token_id: ApiTokenId,
        verify: F,
    ) -> Result<UserId, Report<ApiTokenAuthenticationError>>
    where
        F: FnOnce(&ApiTokenCredential) -> Result<(), Report<ApiTokenVerificationError>> + Send,
    {
        self.0
            .lock()
            .await
            .authenticate_api_token(token_id, verify)
            .await
    }
}

/// Issues a token for `user_id`, records it, and returns its string.
async fn record_issued(store: &mut Store<'_>, user_id: UserId) -> Result<String, Box<dyn Error>> {
    let generated = issuer().issue(user_id, ApiTokenName::new("ci".to_owned())?, Some(LIFETIME));
    store.create_api_token(generated.params).await?;
    Ok(generated.token.expose())
}

/// Authenticates `token` as a bearer token with an [`ApiTokenProvider`] reading the test
/// transaction.
async fn authenticate_bearer(
    store: &mut Store<'_>,
    token: &str,
) -> Result<ActorId, Arc<Report<AuthenticationError>>> {
    let provider = ApiTokenProvider::new(
        TransactionTokens(Mutex::new(store)),
        Some(Arc::new(issuer())),
    );
    let headers = HeaderMap::from_iter([(
        AUTHORIZATION,
        HeaderValue::from_str(&format!("Bearer {token}"))
            .expect("the header value should be valid"),
    )]);
    match AuthenticationProvider::<ActorId>::authenticate(&provider, &headers).await {
        ControlFlow::Break(result) => result,
        ControlFlow::Continue(()) => panic!("the provider should recognize the API token"),
    }
}

#[tokio::test]
async fn provider_issued() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;
    let token = record_issued(&mut store, user_id).await?;

    let actor = authenticate_bearer(&mut store, &token)
        .await
        .expect("an issued token should authenticate");

    assert_eq!(
        actor,
        ActorId::User(user_id),
        "an issued token should authenticate as its user"
    );

    Ok(())
}

#[tokio::test]
async fn provider_wrong_secret() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = record_issued(&mut store, user_id).await?;
    let hashed: HashedApiToken = token.parse()?;
    let other_secret = key().encrypt(
        ApiTokenSecretHash::new([1; 32]),
        &hashed.associated_data(ActorEntityUuid::from(user_id), web_id),
    );
    store
        .as_client()
        .execute(
            "UPDATE api_token SET encrypted_secret_hash = $2 WHERE token_id = $1",
            &[&hashed.token_id(), &other_secret],
        )
        .await?;

    let report = authenticate_bearer(&mut store, &token)
        .await
        .expect_err("a token with another recorded secret should not authenticate");

    assert_eq!(
        report.current_context().kind(),
        &AuthenticationErrorKind::InvalidApiToken,
        "a token with another secret should be invalid"
    );

    Ok(())
}

#[tokio::test]
async fn provider_moved_row() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, _) = user_with_web(&mut store).await?;
    let (other_user_id, _) = user_with_web(&mut store).await?;
    let token = record_issued(&mut store, user_id).await?;
    let hashed: HashedApiToken = token.parse()?;
    move_to_actor(
        &store,
        hashed.token_id(),
        ActorEntityUuid::from(other_user_id),
    )
    .await?;

    let report = authenticate_bearer(&mut store, &token)
        .await
        .expect_err("a token moved to another user should not authenticate");

    assert_eq!(
        report.current_context().kind(),
        &AuthenticationErrorKind::UnverifiableApiToken,
        "a token moved to another user should be unverifiable"
    );

    Ok(())
}

#[tokio::test]
async fn provider_revoked() -> Result<(), Box<dyn Error>> {
    let mut db = DatabaseTestWrapper::new().await;
    let mut store = db.connection.transaction().await?;
    let (user_id, web_id) = user_with_web(&mut store).await?;
    let token = record_issued(&mut store, user_id).await?;
    let hashed: HashedApiToken = token.parse()?;
    store.revoke_api_token(web_id, hashed.token_id()).await?;

    let report = authenticate_bearer(&mut store, &token)
        .await
        .expect_err("a revoked token should not authenticate");

    assert_eq!(
        report.current_context().kind(),
        &AuthenticationErrorKind::InvalidApiToken,
        "a revoked token should be invalid"
    );

    Ok(())
}
