//! Web routes for CRU operations on webs.

#![expect(clippy::str_to_string)]

use std::sync::Arc;

use authorization::{
    schema::WebPermission, zanzibar::Consistency, AuthorizationApi, AuthorizationApiPool,
};
use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use graph_types::{provenance::OwnedById, web::WebId};
use utoipa::OpenApi;

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{AuthenticatedUserHeader, PermissionResponse},
    store::{AccountStore, StorePool},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_web,
        check_web_permission,
    ),
    components(
        schemas(
            WebPermission,
        ),
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
        Router::new().nest(
            "/webs/:web_id",
            Router::new()
                .route("/", post(create_web::<S, A>))
                .route("/permissions/:permission", get(check_web_permission::<A>)),
        )
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
        (status = 204, content_type = "application/json", description = "The web was created successfully"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn create_web<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    store_pool: Extension<Arc<S>>,
    Path(owned_by_id): Path<OwnedById>,
) -> Result<StatusCode, StatusCode>
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

    store
        .insert_web_id(actor_id, &mut authorization_api, owned_by_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create web id");

            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/webs/{web_id}/permissions/{permission}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("web_id" = EntityId, Path, description = "The web ID to check if the actor has the permission"),
        ("permission" = WebPermission, Path, description = "The permission to check for"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor has the permission for the web"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn check_web_permission<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((web_id, permission)): Path<(WebId, WebPermission)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, StatusCode>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(|error| {
                tracing::error!(?error, "Could not acquire access to the authorization API");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .check_web_permission(actor_id, permission, web_id, Consistency::FullyConsistent)
            .await
            .map_err(|error| {
                tracing::error!(
                    ?error,
                    "Could not check if permission on web is granted to the specified actor"
                );
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .has_permission,
    }))
}
