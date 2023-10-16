//! Web routes for CRU operations on webs.

#![expect(clippy::str_to_string)]

use std::sync::Arc;

use authorization::{
    schema::OwnerId, zanzibar::Consistency, AuthorizationApi, AuthorizationApiPool,
};
use axum::{extract::Path, http::StatusCode, routing::post, Extension, Router};
use graph_types::{provenance::OwnedById, web::WebId};
use utoipa::OpenApi;

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{json::Json, AuthenticatedUserHeader},
    store::{AccountStore, StorePool},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_web,
    ),
    tags(
        (name = "Web", description = "Web management API")
    )
)]
pub struct WebResource;

impl RoutedResource for WebResource {
    /// Create routes for interacting with accounts.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
    {
        Router::new().route("/webs/:web_id", post(create_web::<S, A>))
    }
}

#[utoipa::path(
    post,
    path = "/webs/{web_id}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("web_id" = OwnedById, Path, description = "The ID of the account group to add the owner to"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The web id of the created web", body = OwnedById),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn create_web<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    store_pool: Extension<Arc<S>>,
    Path(web_id): Path<OwnedById>,
) -> Result<Json<OwnedById>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let owner_id = store.identify_owned_by_id(web_id).await.map_err(|report| {
        tracing::error!(error=?report, "Could not find web id `{web_id}`");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    match owner_id {
        OwnerId::Account(account_id) => {
            if account_id != actor_id {
                return Err(StatusCode::FORBIDDEN);
            }
        }
        OwnerId::AccountGroupMembers(account_group_id) => {
            let permission_response = authorization_api
                .can_add_group_owner(actor_id, account_group_id, Consistency::FullyConsistent)
                .await
                .map_err(|error| {
                    tracing::error!(?error, "Could not check permissions");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

            if !permission_response.has_permission {
                return Err(StatusCode::FORBIDDEN);
            }
        }
    }

    authorization_api
        .add_web_owner(owner_id, WebId::from(web_id))
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add web owner");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(OwnedById::new(actor_id.into_uuid())))
}
