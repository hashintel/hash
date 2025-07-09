//! Web routes for CRUD operations on permissions.

use alloc::sync::Arc;
use std::collections::HashMap;

use axum::{
    Extension, Router,
    extract::Path,
    response::Response,
    routing::{get, post},
};
use hash_graph_authorization::{
    AuthorizationApiPool,
    policies::store::{
        CreateWebResponse, PrincipalStore, RoleAssignmentStatus, RoleUnassignmentStatus,
    },
};
use hash_graph_store::{
    account::{
        AccountStore as _, CreateAiActorParams, CreateOrgWebParams, CreateUserActorParams,
        CreateUserActorResponse,
    },
    pool::StorePool,
};
use hash_temporal_client::TemporalClient;
use type_system::principal::{
    actor::{ActorEntityUuid, ActorId, ActorType, Ai, AiId, Machine, MachineId, UserId},
    actor_group::{ActorGroupEntityUuid, ActorGroupId, Team, TeamId, Web, WebId},
    role::{RoleName, TeamRole, TeamRoleId, WebRole, WebRoleId},
};
use utoipa::OpenApi;

use crate::rest::{AuthenticatedUserHeader, json::Json, status::report_to_response};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_user_actor,
        create_ai_actor,
        get_or_create_system_machine,
        get_machine_by_identifier,
        get_ai_by_identifier,

        create_org_web,
        get_web_by_id,
        get_web_by_shortname,
        get_web_roles,
        get_team_by_name,
        get_team_roles,

        get_actor_group_role_assignments,
        get_actor_group_role,
        assign_actor_group_role,
        unassign_actor_group_role,

    ),
    components(
        schemas(
            ActorEntityUuid,
            ActorId,
            ActorType,
            MachineId,
            UserId,
            AiId,
            CreateUserActorParams,
            CreateUserActorResponse,
            CreateAiActorParams,

            ActorGroupEntityUuid,
            ActorGroupId,
            WebId,
            TeamId,
            CreateOrgWebParams,
            CreateWebResponse,

            RoleName,
            RoleAssignmentStatus,
            RoleUnassignmentStatus,
        ),
    ),
    tags(
        (name = "Principal", description = "Principal management API")
    )
)]
pub(crate) struct PrincipalResource;

impl PrincipalResource {
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
                "/actors",
                Router::new()
                    .nest(
                        "/user",
                        Router::new().route("/", post(create_user_actor::<S, A>)),
                    )
                    .nest(
                        "/machine",
                        Router::new().nest(
                            "/identifier",
                            Router::new()
                                .route("/:identifier", get(get_machine_by_identifier::<S, A>))
                                .route(
                                    "/system/:identifier",
                                    get(get_or_create_system_machine::<S, A>),
                                ),
                        ),
                    )
                    .nest(
                        "/ai",
                        Router::new()
                            .route("/", post(create_ai_actor::<S, A>))
                            .nest(
                                "/identifier",
                                Router::new()
                                    .route("/:identifier", get(get_ai_by_identifier::<S, A>)),
                            ),
                    ),
            )
            .nest(
                "/actor-groups",
                Router::new()
                    .nest(
                        "/webs",
                        Router::new()
                            .route("/", post(create_org_web::<S, A>))
                            .nest(
                                "/:web_id",
                                Router::new()
                                    .route("/", get(get_web_by_id::<S, A>))
                                    .route("/roles", get(get_web_roles::<S, A>)),
                            )
                            .route("/shortname/:shortname", get(get_web_by_shortname::<S, A>)),
                    )
                    .nest(
                        "/teams",
                        Router::new()
                            .nest(
                                "/:team_id",
                                Router::new().route("/roles", get(get_team_roles::<S, A>)),
                            )
                            .route("/name/:name", get(get_team_by_name::<S, A>)),
                    )
                    .nest(
                        "/:actor_group_id",
                        Router::new().nest(
                            "/roles",
                            Router::new()
                                .route("/actors/:actor_id", get(get_actor_group_role::<S, A>))
                                .nest(
                                    "/:role/actors",
                                    Router::new()
                                        .route("/", get(get_actor_group_role_assignments::<S, A>))
                                        .route(
                                            "/:actor_id",
                                            post(assign_actor_group_role::<S, A>)
                                                .delete(unassign_actor_group_role::<S, A>),
                                        ),
                                ),
                        ),
                    ),
            )
    }
}

#[utoipa::path(
    get,
    path = "/actors/machine/identifier/system/{identifier}",
    tag = "Principal",
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
async fn get_or_create_system_machine<S, A>(
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
        .get_or_create_system_machine(&identifier)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/actors/machine/identifier/{identifier}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("identifier" = String, Path, description = "The identifier of the machine to get"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The machine was retrieved successfully", body = Option<Value>),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_machine_by_identifier<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(identifier): Path<String>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<Option<Machine>>, Response>
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
        .get_machine_by_identifier(actor_id, &identifier)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/actors/user",
    tag = "Principal",
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
    tag = "Principal",
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
    path = "/actors/ai/identifier/{identifier}",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("identifier" = String, Path, description = "The identifier of the AI to get"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The AI was retrieved successfully", body = Option<Value>),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_ai_by_identifier<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(identifier): Path<String>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<Option<Ai>>, Response>
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
        .get_ai_by_identifier(actor_id, &identifier)
        .await
        .map_err(report_to_response)
        .map(Json)
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
        (status = 200, content_type = "application/json", description = "The web was retrieved successfully", body = Option<Value>),

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
) -> Result<Json<Option<Web>>, Response>
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
        (status = 200, content_type = "application/json", description = "The web was retrieved successfully", body = Option<Value>),

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
) -> Result<Json<Option<Web>>, Response>
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
    path = "/actor-groups/webs/{web_id}/roles",
    tag = "Web",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("web_id" = WebId, Path, description = "The ID of the web to retrieve"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The web roles were retrieved successfully", body = HashMap<String, Value>),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_web_roles<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(web_id): Path<WebId>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<HashMap<WebRoleId, WebRole>>, Response>
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
        .get_web_roles(actor_id, web_id)
        .await
        .map_err(report_to_response)
        .map(Json)
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
        (status = 200, content_type = "application/json", description = "The team was retrieved successfully", body = Option<Value>),

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
) -> Result<Json<Option<Team>>, Response>
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

#[utoipa::path(
    get,
    path = "/actor-groups/teams/{team_id}/roles",
    tag = "Team",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("team_id" = TeamId, Path, description = "The ID of the team to retrieve"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The team roles were retrieved successfully", body = HashMap<String, Value>),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_team_roles<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(team_id): Path<TeamId>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<HashMap<TeamRoleId, TeamRole>>, Response>
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
        .get_team_roles(actor_id, team_id)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/actor-groups/{actor_group_id}/roles/{role_name}/actors",
    tag = "Principal",
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
    path = "/actor-groups/{actor_group_id}/roles/actors/{actor_id}",
    tag = "Principal",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("actor_group_id" = ActorGroupEntityUuid, Path, description = "The ID of the actor group to check the role against"),
        ("actor_id" = ActorEntityUuid, Path, description = "The ID of the actor to be checked"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "Whether the actor is assigned the role", body = RoleName),
        (status = 404, content_type = "application/json", description = "The team was not found"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_actor_group_role<S, A>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    Path((actor_group_id, actor_id)): Path<(ActorGroupEntityUuid, ActorEntityUuid)>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<Json<Option<RoleName>>, Response>
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
        .get_actor_group_role(actor_id, actor_group_id)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[utoipa::path(
    post,
    path = "/actor-groups/{actor_group_id}/roles/{role_name}/actors/{actor_id}",
    tag = "Principal",
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
    tag = "Principal",
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
