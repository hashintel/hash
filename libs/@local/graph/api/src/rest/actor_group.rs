//! Web routes for CRU operations on webs.

use alloc::sync::Arc;

use axum::{
    Extension, Json, Router,
    extract::Path,
    http::StatusCode,
    response::Response,
    routing::{get, post},
};
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{
    AuthorizationApi as _, AuthorizationApiPool,
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    policies::store::{
        CreateWebResponse, PrincipalStore, RoleAssignmentStatus, RoleUnassignmentStatus,
    },
    schema::{
        AccountGroupAdministratorSubject, AccountGroupMemberSubject, AccountGroupPermission,
        AccountGroupRelationAndSubject, WebDataTypeViewerSubject, WebEntityCreatorSubject,
        WebEntityEditorSubject, WebEntityTypeViewerSubject, WebEntityViewerSubject,
        WebOwnerSubject, WebPermission, WebPropertyTypeViewerSubject, WebRelationAndSubject,
    },
    zanzibar::Consistency,
};
use hash_graph_store::{
    account::{AccountStore as _, CreateOrgWebParams, GetTeamResponse, GetWebResponse},
    pool::StorePool,
};
use hash_temporal_client::TemporalClient;
use serde::Deserialize;
use type_system::principal::{
    actor::ActorEntityUuid,
    actor_group::{ActorGroupEntityUuid, ActorGroupId, TeamId, WebId},
    role::RoleName,
};
use utoipa::{OpenApi, ToSchema};

use super::{OpenApiQuery, QueryLogger};
use crate::rest::{AuthenticatedUserHeader, PermissionResponse, status::report_to_response};

#[derive(OpenApi)]
#[openapi(
    paths(
        check_web_permission,
        modify_web_authorization_relationships,
        get_web_authorization_relationships,
        check_account_group_permission,
        get_actor_group_relations,
    ),
    components(
        schemas(
            AccountGroupPermission,
            AccountGroupRelationAndSubject,
            AccountGroupMemberSubject,
            AccountGroupAdministratorSubject,

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
        (name = "ActorGroup", description = "ActorGroup management API"),
    )
)]
pub(crate) struct ActorGroupResource;

impl ActorGroupResource {
    /// Create routes for interacting with accounts.
    pub(crate) fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
    {
        Router::new().nest(
            "/actor-groups",
            Router::new()
                .nest(
                    "/:actor_group_id/",
                    Router::new()
                        .route(
                            "/permissions/:permission",
                            get(check_account_group_permission::<A>),
                        )
                        .route("/relations", get(get_actor_group_relations::<A>)),
                )
                .nest(
                    "/webs",
                    Router::new()
                        .nest(
                            "/:web_id",
                            Router::new()
                                .route("/permissions/:permission", get(check_web_permission::<A>))
                                .route(
                                    "/relationships",
                                    get(get_web_authorization_relationships::<A>),
                                ),
                        )
                        .route(
                            "/relationships",
                            post(modify_web_authorization_relationships::<A>),
                        ),
                ),
        )
    }
}

#[utoipa::path(
    get,
    path = "/actor-groups/webs/{web_id}/permissions/{permission}",
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
    path = "/actor-groups/webs/{web_id}/relationships",
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
    path = "/actor-groups/webs/relationships",
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

#[utoipa::path(
    get,
    path = "/actor_groups/{actor_group_id}/permissions/{permission}",
    tag = "Actor Group",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to check if the actor has the permission"),
        ("permission" = AccountGroupPermission, Path, description = "The permission to check for"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor can add an owner"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn check_account_group_permission<A>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    Path((actor_group_id, permission)): Path<(ActorGroupEntityUuid, AccountGroupPermission)>,
    authorization_api_pool: Extension<Arc<A>>,
    mut query_logger: Option<Extension<QueryLogger>>,
) -> Result<Json<PermissionResponse>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(
            actor,
            OpenApiQuery::CheckAccountGroupPermission {
                actor_group_id,
                permission,
            },
        );
    }

    let response = Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(report_to_response)?
            .check_account_group_permission(
                actor,
                permission,
                actor_group_id,
                Consistency::FullyConsistent,
            )
            .await
            .attach_printable(
                "Could not check if permission on the actor group is granted to the specified \
                 actor",
            )
            .map_err(report_to_response)?
            .has_permission,
    }));
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    get,
    path = "/actor_groups/{actor_group_id}/relations",
    tag = "Actor Group",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to get relations from"),
    ),
    responses(
        (status = 200, body = Vec<AccountGroupRelationAndSubject>, description = "List of members and administrators of the actor group"),
        (status = 403, description = "Permission denied"),
        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_actor_group_relations<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(actor_group_id): Path<ActorGroupEntityUuid>,
    authorization_api_pool: Extension<Arc<A>>,
    mut query_logger: Option<Extension<QueryLogger>>,
) -> Result<Json<Vec<AccountGroupRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(
            actor_id,
            OpenApiQuery::GetActorGroupRelations { actor_group_id },
        );
    }

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    // Get relations of the actor group
    let result = authorization_api
        .get_account_group_relations(actor_group_id, Consistency::FullyConsistent)
        .await
        .attach_printable("Could not get actor group relations")
        .map_err(report_to_response)
        .map(Json);

    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }

    result
}
