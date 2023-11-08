//! Web routes for CRU operations on webs.

#![expect(clippy::str_to_string)]

use std::sync::Arc;

use authorization::{
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    schema::{WebOwnerSubject, WebPermission, WebRelationAndSubject},
    zanzibar::Consistency,
    AuthorizationApi, AuthorizationApiPool,
};
use axum::{
    extract::Path,
    http::StatusCode,
    response::Response,
    routing::{get, post},
    Extension, Json, Router,
};
use error_stack::Report;
use graph_types::{provenance::OwnedById, web::WebId};
use serde::Deserialize;
use utoipa::{OpenApi, ToSchema};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{status::report_to_response, AuthenticatedUserHeader, PermissionResponse},
    store::{AccountStore, StorePool},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_web,
        check_web_permission,
        modify_web_authorization_relationships,
        get_web_authorization_relationships,
    ),
    components(
        schemas(
            CreateWebRequest,

            WebRelationAndSubject,
            WebPermission,
            WebOwnerSubject,
            ModifyWebAuthorizationRelationship,
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
            "/webs",
            Router::new()
                .route(
                    "/relationships",
                    post(modify_web_authorization_relationships::<A>),
                )
                .route("/", post(create_web::<S, A>))
                .nest(
                    "/:web_id",
                    Router::new()
                        .route("/permissions/:permission", get(check_web_permission::<A>))
                        .route(
                            "/relationships",
                            get(get_web_authorization_relationships::<A>),
                        ),
                ),
        )
    }
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreateWebRequest {
    owned_by_id: OwnedById,
    owner: WebOwnerSubject,
}

#[utoipa::path(
    post,
    path = "/webs",
    request_body = CreateWebRequest,
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
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
    Json(body): Json<CreateWebRequest>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let CreateWebRequest { owned_by_id, owner } = body;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .insert_web_id(actor_id, &mut authorization_api, owned_by_id, owner)
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

#[utoipa::path(
    get,
    path = "/webs/{web_id}/relationships",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("web_id" = OwnedById, Path, description = "The web to read the relations for"),
    ),
    responses(
        (status = 200, description = "The relations of the web", body = [WebRelationAndSubject]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_web_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(web_id): Path<OwnedById>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<Vec<WebRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    Ok(Json(
        authorization_api
            .get_web_relations(WebId::new(web_id.into_uuid()), Consistency::FullyConsistent)
            .await
            .map_err(report_to_response)?,
    ))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ModifyWebAuthorizationRelationship {
    operation: ModifyRelationshipOperation,
    resource: OwnedById,
    relation_and_subject: WebRelationAndSubject,
}

#[utoipa::path(
    post,
    path = "/webs/relationships",
    tag = "Web",
    request_body = [ModifyWebAuthorizationRelationship],
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, description = "The relationship was modified for the web"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn modify_web_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    relationships: Json<Vec<ModifyWebAuthorizationRelationship>>,
) -> Result<StatusCode, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let (webs, operations): (Vec<_>, Vec<_>) = relationships
        .0
        .into_iter()
        .map(|request| {
            let web_id = WebId::new(request.resource.into_uuid());
            (
                web_id,
                (request.operation, web_id, request.relation_and_subject),
            )
        })
        .unzip();

    let (permissions, _zookie) = authorization_api
        .check_webs_permission(
            actor_id,
            WebPermission::Update,
            webs,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(report_to_response)?;

    let mut failed = false;
    // TODO: Change interface for `check_webs_permission` to avoid this loop
    for (web_id, has_permission) in permissions {
        if !has_permission {
            tracing::error!("Insufficient permissions to modify relationship for web `{web_id}`");
            failed = true;
        }
    }

    if failed {
        return Err(report_to_response(
            Report::new(PermissionAssertion).attach(hash_status::StatusCode::PermissionDenied),
        ));
    }

    // for request in relationships.0 {
    authorization_api
        .modify_web_relations(operations)
        .await
        .map_err(report_to_response)?;

    Ok(StatusCode::NO_CONTENT)
}
