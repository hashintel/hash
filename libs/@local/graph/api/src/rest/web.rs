//! Web routes for CRU operations on webs.

use alloc::sync::Arc;

use axum::{
    Extension, Json, Router,
    extract::Path,
    http::StatusCode,
    response::Response,
    routing::{get, post},
};
use error_stack::Report;
use hash_graph_authorization::{
    AuthorizationApi as _, AuthorizationApiPool,
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    policies::store::{CreateWebResponse, PrincipalStore},
    schema::{
        WebDataTypeViewerSubject, WebEntityCreatorSubject, WebEntityEditorSubject,
        WebEntityTypeViewerSubject, WebEntityViewerSubject, WebOwnerSubject, WebPermission,
        WebPropertyTypeViewerSubject, WebRelationAndSubject,
    },
    zanzibar::Consistency,
};
use hash_graph_store::{
    account::{AccountStore as _, CreateOrgWebParams, GetWebResponse},
    pool::StorePool,
};
use hash_status::Status;
use hash_temporal_client::TemporalClient;
use serde::Deserialize;
use type_system::principal::actor_group::WebId;
use utoipa::{OpenApi, ToSchema};

use super::status::status_to_response;
use crate::rest::{AuthenticatedUserHeader, PermissionResponse, status::report_to_response};

#[derive(OpenApi)]
#[openapi(
    paths(
        get_web,
        get_web_by_shortname,
        create_org_web,
        check_web_permission,
        modify_web_authorization_relationships,
        get_web_authorization_relationships,
    ),
    components(
        schemas(
            GetWebResponse,
            CreateOrgWebParams,
            CreateWebResponse,

            WebRelationAndSubject,
            WebPermission,
            WebOwnerSubject,
            WebEntityCreatorSubject,
            WebEntityEditorSubject,
            WebEntityViewerSubject,
            WebEntityTypeViewerSubject,
            WebPropertyTypeViewerSubject,
            WebDataTypeViewerSubject,
            ModifyWebAuthorizationRelationship,
        ),
    ),
    tags(
        (name = "Web", description = "Web management API")
    )
)]
pub(crate) struct WebResource;

impl WebResource {
    /// Create routes for interacting with accounts.
    pub(crate) fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
    {
        Router::new().nest(
            "/webs",
            Router::new()
                .route(
                    "/relationships",
                    post(modify_web_authorization_relationships::<A>),
                )
                .route("/", post(create_org_web::<S, A>))
                .route("/:web_id", get(get_web::<S, A>))
                .route("/shortname/:shortname", get(get_web_by_shortname::<S, A>))
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

#[utoipa::path(
    get,
    path = "/webs/{web_id}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("web_id" = WebId, Path, description = "The ID of the web to retrieve"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The web was retrieved successfully", body = GetWebResponse),
        (status = 404, content_type = "application/json", description = "The web was not found"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_web<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(web_id): Path<WebId>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<GetWebResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .find_web(actor_id, web_id)
        .await
        .map_err(report_to_response)?
        .ok_or_else(|| {
            status_to_response(Status::new(
                hash_status::StatusCode::NotFound,
                None,
                Vec::<()>::new(),
            ))
        })
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/webs/shortname/{shortname}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("shortname" = String, Path, description = "The shortname of the web to retrieve"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The web was retrieved successfully", body = GetWebResponse),
        (status = 404, content_type = "application/json", description = "The web was not found"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_web_by_shortname<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(shortname): Path<String>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<GetWebResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .find_web_by_shortname(actor_id, &shortname)
        .await
        .map_err(report_to_response)?
        .ok_or_else(|| {
            status_to_response(Status::new(
                hash_status::StatusCode::NotFound,
                None,
                Vec::<()>::new(),
            ))
        })
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/webs",
    request_body = CreateOrgWebParams,
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The web was created successfully", body = CreateWebResponse),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_org_web<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    Json(params): Json<CreateOrgWebParams>,
) -> Result<Json<CreateWebResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .create_org_web(actor_id, params)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[utoipa::path(
    get,
    path = "/webs/{web_id}/permissions/{permission}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("web_id" = WebId, Path, description = "The web to read the relations for"),
    ),
    responses(
        (status = 200, description = "The relations of the web", body = [WebRelationAndSubject]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_web_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(web_id): Path<WebId>,
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
            .get_web_relations(web_id, Consistency::FullyConsistent)
            .await
            .map_err(report_to_response)?,
    ))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ModifyWebAuthorizationRelationship {
    operation: ModifyRelationshipOperation,
    resource: WebId,
    relation_and_subject: WebRelationAndSubject,
}

#[utoipa::path(
    post,
    path = "/webs/relationships",
    tag = "Web",
    request_body = [ModifyWebAuthorizationRelationship],
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
            (
                request.resource,
                (
                    request.operation,
                    request.resource,
                    request.relation_and_subject,
                ),
            )
        })
        .unzip();

    let (permissions, _zookie) = authorization_api
        .check_webs_permission(
            actor_id,
            WebPermission::ChangePermission,
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
