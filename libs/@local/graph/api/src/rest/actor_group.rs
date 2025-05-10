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

use crate::rest::{AuthenticatedUserHeader, PermissionResponse, status::report_to_response};

#[derive(OpenApi)]
#[openapi(
    paths(
        get_actor_group_role_assignments,
        has_actor_group_role,
        assign_actor_group_role,
        unassign_actor_group_role,

        get_web_by_id,
        get_web_by_shortname,
        create_org_web,
        check_web_permission,
        modify_web_authorization_relationships,
        get_web_authorization_relationships,

        get_team_by_name,
    ),
    components(
        schemas(
            GetWebResponse,
            CreateOrgWebParams,
            CreateWebResponse,

            ActorGroupEntityUuid,
            ActorGroupId,
            RoleName,
            RoleAssignmentStatus,
            RoleUnassignmentStatus,
            AccountGroupPermission,
            AccountGroupRelationAndSubject,
            AccountGroupMemberSubject,
            AccountGroupAdministratorSubject,

            WebId,
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

            GetTeamResponse,
            TeamId,
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
                    "/:actor_group_id",
                    Router::new()
                        .route(
                            "/roles/:role/actors",
                            get(get_actor_group_role_assignments::<S, A>),
                        )
                        .route(
                            "/roles/:role/actors/:actor_id",
                            get(has_actor_group_role::<S, A>)
                                .post(assign_actor_group_role::<S, A>)
                                .delete(unassign_actor_group_role::<S, A>),
                        ),
                )
                .nest(
                    "/webs",
                    Router::new()
                        .route("/", post(create_org_web::<S, A>))
                        .nest(
                            "/:web_id",
                            Router::new()
                                .route("/", get(get_web_by_id::<S, A>))
                                .route("/permissions/:permission", get(check_web_permission::<A>))
                                .route(
                                    "/relationships",
                                    get(get_web_authorization_relationships::<A>),
                                ),
                        )
                        .route("/shortname/:shortname", get(get_web_by_shortname::<S, A>))
                        .route(
                            "/relationships",
                            post(modify_web_authorization_relationships::<A>),
                        ),
                )
                .nest(
                    "/teams",
                    Router::new().route("/name/:name", get(get_team_by_name::<S, A>)),
                ),
        )
    }
}

#[utoipa::path(
    post,
    path = "/actor-groups/webs",
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
    path = "/actor-groups/webs/{web_id}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("web_id" = WebId, Path, description = "The ID of the web to retrieve"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The web was retrieved successfully", body = GetWebResponse),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_web_by_id<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(web_id): Path<WebId>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<Option<GetWebResponse>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
{
    store_pool
        .acquire(
            authorization_api_pool
                .acquire()
                .await
                .map_err(report_to_response)?,
            temporal_client.0,
        )
        .await
        .map_err(report_to_response)?
        .get_web_by_id(actor_id, web_id)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/actor-groups/webs/shortname/{shortname}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("shortname" = String, Path, description = "The shortname of the web to retrieve"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The web was retrieved successfully", body = GetWebResponse),

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
) -> Result<Json<Option<GetWebResponse>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
{
    store_pool
        .acquire(
            authorization_api_pool
                .acquire()
                .await
                .map_err(report_to_response)?,
            temporal_client.0,
        )
        .await
        .map_err(report_to_response)?
        .get_web_by_shortname(actor_id, &shortname)
        .await
        .map_err(report_to_response)
        .map(Json)
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
    path = "/actor-groups/{actor_group_id}/roles/{role_name}/actors",
    tag = "ActorGroup",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to get the assignments for"),
        ("role_name" = RoleName, Path, description = "The role to be checked"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "Whether the actor is assigned the role", body = Vec<ActorEntityUuid>),
        (status = 404, content_type = "application/json", description = "The team was not found"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_actor_group_role_assignments<S, A>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    Path((actor_group_id, role_name)): Path<(ActorGroupEntityUuid, RoleName)>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<Vec<ActorEntityUuid>>, Response>
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
        .get_role_assignments(actor_group_id, role_name)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/actor-groups/{actor_group_id}/roles/{role_name}/actors/{actor_id}",
    tag = "ActorGroup",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to check the role against"),
        ("role_name" = RoleName, Path, description = "The role to be checked"),
        ("actor_id" = ActorEntityUuid, Path, description = "The ID of the actor to be checked"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "Whether the actor is assigned the role", body = bool),
        (status = 404, content_type = "application/json", description = "The team was not found"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn has_actor_group_role<S, A>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    Path((actor_group_id, role_name, actor_id)): Path<(
        ActorGroupEntityUuid,
        RoleName,
        ActorEntityUuid,
    )>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<bool>, Response>
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

    Ok(Json(
        store
            .is_assigned(actor_id, actor_group_id)
            .await
            .map_err(report_to_response)?
            .is_some_and(|role| role == role_name),
    ))
}

#[utoipa::path(
    post,
    path = "/actor-groups/{actor_group_id}/roles/{role_name}/actors/{actor_id}",
    tag = "ActorGroup",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to add the member to"),
        ("role_name" = RoleName, Path, description = "The role to assign to the actor"),
        ("actor_id" = ActorEntityUuid, Path, description = "The ID of the actor to add to the group"),
    ),
    responses(
        (status = 200, body = RoleAssignmentStatus, description = "The actor group member was added"),

        (status = 403, description = "Permission denied"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn assign_actor_group_role<S, A>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    Path((actor_group_id, role_name, actor_id)): Path<(
        ActorGroupEntityUuid,
        RoleName,
        ActorEntityUuid,
    )>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<RoleAssignmentStatus>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
{
    store_pool
        .acquire(
            authorization_api_pool
                .acquire()
                .await
                .map_err(report_to_response)?,
            temporal_client.0,
        )
        .await
        .map_err(report_to_response)?
        .assign_role(actor, actor_id, actor_group_id, role_name)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[utoipa::path(
    delete,
    path = "/actor-groups/{actor_group_id}/roles/{role_name}/actors/{actor_id}",
    tag = "ActorGroup",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to remove the member from"),
        ("role_name" = RoleName, Path, description = "The role to remove from the actor"),
        ("actor_id" = ActorEntityUuid, Path, description = "The ID of the actor to remove from the group")
    ),
    responses(
        (status = 200, body = RoleUnassignmentStatus, description = "The actor group member was removed"),

        (status = 403, description = "Permission denied"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn unassign_actor_group_role<S, A>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    Path((actor_group_id, role_name, actor_id)): Path<(
        ActorGroupEntityUuid,
        RoleName,
        ActorEntityUuid,
    )>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<RoleUnassignmentStatus>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
{
    store_pool
        .acquire(
            authorization_api_pool
                .acquire()
                .await
                .map_err(report_to_response)?,
            temporal_client.0,
        )
        .await
        .map_err(report_to_response)?
        .unassign_role(actor, actor_id, actor_group_id, role_name)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[utoipa::path(
    get,
    path = "/actor-groups/teams/name/{name}",
    tag = "Team",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("name" = String, Path, description = "The ID of the team to retrieve"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The team was retrieved successfully", body = Option<GetTeamResponse>),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_team_by_name<S, A>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    Path(name): Path<String>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<Option<GetTeamResponse>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
{
    store_pool
        .acquire(
            authorization_api_pool
                .acquire()
                .await
                .map_err(report_to_response)?,
            temporal_client.0,
        )
        .await
        .map_err(report_to_response)?
        .get_team_by_name(actor, &name)
        .await
        .map_err(report_to_response)
        .map(Json)
}
