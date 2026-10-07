#![expect(
    unreachable_pub,
    reason = "the shared harness is public for the test binaries that re-export it, which this \
              one does not"
)]
#![expect(
    clippy::panic_in_result_fn,
    reason = "the tests assert on values the store returns as results"
)]

#[path = "../common/mod.rs"]
mod common;

use core::{assert_matches, error::Error, time::Duration};

use hash_graph_authorization::policies::store::{
    CreateWebParameter, PolicyStore as _, PrincipalStore as _,
};
use hash_graph_postgres_store::store::{AsClient as _, InTransaction, PostgresStore};
use hash_graph_store::api_token::{
    ApiTokenEncryptedSecretHash, ApiTokenEncryptionKeyId, ApiTokenId, ApiTokenMetadata,
    ApiTokenRevocationError, ApiTokenStore as _, ApiTokenType, ApiTokenVersion,
    CreateApiTokenParams,
};
use pretty_assertions::assert_eq;
use time::OffsetDateTime;
use tokio_postgres::Transaction;
use type_system::principal::{
    actor::{ActorId, UserId},
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

async fn create_token(
    store: &mut Store<'_>,
    user_id: UserId,
    lifetime: Option<Duration>,
) -> Result<ApiTokenMetadata, Box<dyn Error>> {
    Ok(store
        .create_api_token(CreateApiTokenParams {
            token_id: ApiTokenId::new(Uuid::new_v4()),
            token_type: ApiTokenType::User,
            version: ApiTokenVersion::V0,
            user_id,
            name: "ci".to_owned(),
            lifetime,
            encryption_key_id: ApiTokenEncryptionKeyId::new(Uuid::new_v4()),
            encrypted_secret_hash: ApiTokenEncryptedSecretHash::new([7; 60]),
        })
        .await?)
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
    // `now()` is fixed for the whole transaction, so a second revocation would set the same time.
    // Moving the first one back tells the two apart.
    let first_revoked_at: OffsetDateTime = store
        .as_client()
        .query_one(
            "UPDATE api_token SET revoked_at = revoked_at - INTERVAL '1 day' WHERE token_id = $1 \
             RETURNING revoked_at",
            &[&token.token_id],
        )
        .await?
        .get(0);

    store.revoke_api_token(web_id, token.token_id).await?;

    assert_eq!(
        listed_token(&store, web_id).await?.revoked_at,
        Some(first_revoked_at),
        "revoking a revoked token should keep the first revocation time"
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
        ApiTokenRevocationError::NotFound
    );
    assert_eq!(
        listed_token(&store, web_id).await?.revoked_at,
        None,
        "the token should stay active"
    );

    Ok(())
}
