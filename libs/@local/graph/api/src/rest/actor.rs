//! Web routes for CRU operations on actors.

use alloc::sync::Arc;

use axum::{
    Extension, Router,
    extract::Path,
    response::Response,
    routing::{get, post},
};
use error_stack::ResultExt as _;
use hash_graph_authorization::{
    AuthorizationApi as _, AuthorizationApiPool,
    policies::store::{PrincipalStore, RoleAssignmentStatus, RoleUnassignmentStatus},
    schema::{
        AccountGroupAdministratorSubject, AccountGroupMemberSubject, AccountGroupPermission,
        AccountGroupRelationAndSubject,
    },
    zanzibar::Consistency,
};
use hash_graph_store::{
    account::{
        AccountStore as _, CreateAiActorParams, CreateUserActorParams, CreateUserActorResponse,
        GetTeamResponse,
    },
    pool::StorePool,
};
use hash_status::Status;
use hash_temporal_client::TemporalClient;
use type_system::principal::{
    actor::{ActorEntityUuid, ActorId, ActorType, AiId, MachineId, UserId},
    actor_group::{ActorGroupEntityUuid, ActorGroupId, TeamId, WebId},
    role::RoleName,
};
use utoipa::OpenApi;

use super::status::status_to_response;
use crate::rest::{
    AuthenticatedUserHeader, OpenApiQuery, PermissionResponse, QueryLogger, json::Json,
    status::report_to_response,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_user_actor,
        create_ai_actor,
        get_or_create_system_actor,
        get_instance_admins_team,

        check_account_group_permission,
        assign_actor_group_role,
        unassign_actor_group_role,
        get_actor_group_relations,
    ),
    components(
        schemas(
            ActorId,
            ActorType,
            MachineId,
            UserId,
            AiId,
            ActorEntityUuid,
            ActorGroupEntityUuid,
            TeamId,
            GetTeamResponse,
            WebId,
            ActorGroupId,
            RoleName,
            RoleAssignmentStatus,
            RoleUnassignmentStatus,
            AccountGroupPermission,
            AccountGroupRelationAndSubject,
            AccountGroupMemberSubject,
            AccountGroupAdministratorSubject,
            CreateUserActorParams,
            CreateUserActorResponse,
            CreateAiActorParams,
        ),
    ),
    tags(
        (name = "Actor", description = "Actor management API")
    )
)]
pub(crate) struct ActorResource;

impl ActorResource {
    /// Create routes for interacting with actors.
    pub(crate) fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'p, 'a> S::Store<'p, A::Api<'a>>: PrincipalStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new()
            .nest(
                "/system",
                Router::new()
                    .route(
                        "/actor/:identifier",
                        get(get_or_create_system_actor::<S, A>),
                    )
                    .route("/instance-admins", get(get_instance_admins_team::<S, A>)),
            )
            .nest(
                "/actors",
                Router::new()
                    .route("/user", post(create_user_actor::<S, A>))
                    .route("/ai", post(create_ai_actor::<S, A>)),
            )
            .nest(
                "/actor_groups",
                Router::new().nest(
                    "/:actor_group_id",
                    Router::new()
                        .route(
                            "/permissions/:permission",
                            get(check_account_group_permission::<A>),
                        )
                        .route("/relations", get(get_actor_group_relations::<A>))
                        .route(
                            "/:role/:actor_id",
                            post(assign_actor_group_role::<S, A>)
                                .delete(unassign_actor_group_role::<S, A>),
                        ),
                ),
            )
    }
}

#[utoipa::path(
    get,
    path = "/system/actor/{identifier}",
    tag = "Actor",
    params(
        ("identifier" = String, Path, description = "The identifier of the actor to get"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created actor", body = MachineId),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_or_create_system_actor<S, A>(
    authorization_api_pool: Extension<Arc<A>>,
    Path(identifier): Path<String>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<MachineId>, Response>
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
        .get_or_create_system_actor(&identifier)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/actors/user",
    tag = "Actor",
    request_body = CreateUserActorParams,
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created actor", body = CreateUserActorResponse),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_user_actor<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    Json(params): Json<CreateUserActorParams>,
) -> Result<Json<CreateUserActorResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
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
        .create_user_actor(actor_id, params)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[utoipa::path(
    post,
    path = "/actors/ai",
    tag = "Actor",
    request_body = CreateAiActorParams,
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the created actor", body = AiId),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_ai_actor<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    Json(params): Json<CreateAiActorParams>,
) -> Result<Json<AiId>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
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
        .create_ai_actor(actor_id, params)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[utoipa::path(
    get,
    path = "/system/instance-admins",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The team was retrieved successfully", body = GetTeamResponse),
        (status = 404, content_type = "application/json", description = "The team was not found"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_instance_admins_team<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<GetTeamResponse>, Response>
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
        .find_team_by_name(actor_id, "instance-admins")
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
    post,
    path = "/actor_groups/{actor_group_id}/{role}/{actor_id}",
    tag = "Actor Group",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to add the member to"),
        ("role" = RoleName, Path, description = "The role to assign to the actor"),
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
    path = "/actor_groups/{actor_group_id}/{role}/{actor_id}",
    tag = "Actor Group",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to remove the member from"),
        ("role" = RoleName, Path, description = "The role to remove from the actor"),
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
