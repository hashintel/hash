//! Web routes for CRU operations on accounts.

use std::sync::Arc;

use authorization::AuthorizationApiPool;
use axum::{http::StatusCode, routing::post, Extension, Router};
use graph_types::account::{AccountGroupId, AccountId};
use utoipa::OpenApi;
use uuid::Uuid;

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{json::Json, AuthenticatedUserHeader},
    store::{AccountStore, StorePool},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_account,
        create_account_group,
    ),
    components(
        schemas(AccountId, AccountGroupId),
    ),
    tags(
        (name = "Account", description = "Account management API")
    )
)]
pub struct AccountResource;

impl RoutedResource for AccountResource {
    /// Create routes for interacting with accounts.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new()
            .route("/accounts", post(create_account::<S, A>))
            .route("/account_groups", post(create_account_group::<S, A>))
    }
}

#[utoipa::path(
    post,
    path = "/accounts",
    tag = "Account",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created account", body = AccountId),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn create_account<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<AccountId>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let account_id = AccountId::new(Uuid::new_v4());
    store
        .insert_account_id(actor_id, &mut authorization_api, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create account id");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(account_id))
}

#[utoipa::path(
    post,
    path = "/account_groups",
    tag = "Account Group",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created account", body = AccountGroupId),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn create_account_group<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<AccountGroupId>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let account_group_id = AccountGroupId::new(Uuid::new_v4());
    store
        .insert_account_group_id(actor_id, &mut authorization_api, account_group_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create account id");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(account_group_id))
}
