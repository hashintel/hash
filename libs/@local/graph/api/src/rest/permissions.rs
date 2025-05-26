//! Web routes for CRUD operations on permissions.

use alloc::sync::Arc;

use axum::{
    Extension, Router,
    extract::Path,
    response::Response,
    routing::{get, post},
};
use hash_graph_authorization::{
    AuthorizationApiPool,
    policies::{
        Policy, PolicyId,
        store::{PolicyCreationParams, PolicyFilter, PolicyStore, PolicyUpdateOperation},
    },
};
use hash_graph_store::pool::StorePool;
use hash_temporal_client::TemporalClient;
use http::StatusCode;
use type_system::principal::actor::ActorId;
use utoipa::OpenApi;

use crate::rest::{AuthenticatedUserHeader, json::Json, status::report_to_response};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_policy,
        get_policy_by_id,
        query_policies,
        resolve_policies_for_actor,
        update_policy_by_id,
        delete_policy_by_id,

        seed_system_policies,
    ),
    tags(
        (name = "Permission", description = "Permission management API")
    )
)]
pub(crate) struct PermissionResource;

impl PermissionResource {
    /// Create routes for interacting with actors.
    pub(crate) fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'p, 'a> S::Store<'p, A::Api<'a>>: PolicyStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/policies",
            Router::new()
                .route("/", post(create_policy::<S, A>))
                .route(
                    "/:policy_id",
                    get(get_policy_by_id::<S, A>)
                        .put(update_policy_by_id::<S, A>)
                        .delete(delete_policy_by_id::<S, A>),
                )
                .route("/query", post(query_policies::<S, A>))
                .route("/resolve/actor", post(resolve_policies_for_actor::<S, A>))
                .route("/seed", get(seed_system_policies::<S, A>)),
        )
    }
}

#[utoipa::path(
    post,
    path = "/policies",
    request_body = Value,
    tag = "Permission",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The policy ID of the created policy", body = Value),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_policy<S, A>(
    AuthenticatedUserHeader(authenticated_actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(policy): Json<PolicyCreationParams>,
) -> Result<Json<PolicyId>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PolicyStore,
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
        .create_policy(authenticated_actor_id, policy)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/policies/{policy_id}",
    tag = "Permission",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("policy_id" = Uuid, Path, description = "The ID of the policy to find"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The policy with the specified id or `null`", body = Option<Value>),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn get_policy_by_id<S, A>(
    AuthenticatedUserHeader(authenticated_actor_id): AuthenticatedUserHeader,
    Path(policy_id): Path<PolicyId>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<Json<Option<Policy>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PolicyStore,
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
        .get_policy_by_id(authenticated_actor_id, policy_id)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/policies/query",
    request_body = Value,
    tag = "Permission",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "List of policies matching the filter", body = Vec<Value>),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn query_policies<S, A>(
    AuthenticatedUserHeader(authenticated_actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(filter): Json<PolicyFilter>,
) -> Result<Json<Vec<Policy>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PolicyStore,
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
        .query_policies(authenticated_actor_id, &filter)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/policies/resolve/actor",
    request_body = Value,
    tag = "Permission",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "List of policies found for the actor", body = Vec<Value>),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn resolve_policies_for_actor<S, A>(
    AuthenticatedUserHeader(authenticated_actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(actor_id): Json<ActorId>,
) -> Result<Json<Vec<Policy>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PolicyStore,
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
        .resolve_policies_for_actor(authenticated_actor_id, Some(actor_id))
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    put,
    path = "/policies/{policy_id}",
    request_body = Vec<Value>,
    tag = "Permission",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("policy_id" = Uuid, Path, description = "The ID of the policy to update"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The updated policy", body = Value),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn update_policy_by_id<S, A>(
    AuthenticatedUserHeader(authenticated_actor_id): AuthenticatedUserHeader,
    Path(policy_id): Path<PolicyId>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(operations): Json<Vec<PolicyUpdateOperation>>,
) -> Result<Json<Policy>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PolicyStore,
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
        .update_policy_by_id(authenticated_actor_id, policy_id, &operations)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    delete,
    path = "/policies/{policy_id}",
    tag = "Permission",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("policy_id" = Uuid, Path, description = "The ID of the policy to delete"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The policy was removed successfully"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn delete_policy_by_id<S, A>(
    AuthenticatedUserHeader(authenticated_actor_id): AuthenticatedUserHeader,
    Path(policy_id): Path<PolicyId>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PolicyStore,
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
        .delete_policy_by_id(authenticated_actor_id, policy_id)
        .await
        .map_err(report_to_response)
        .map(|()| StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/policies/seed",
    tag = "Permission",
    responses(
        (status = 204, content_type = "application/json", description = "The system policies were created successfully"),

        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn seed_system_policies<S, A>(
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
) -> Result<StatusCode, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: PolicyStore,
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
        .seed_system_policies()
        .await
        .map_err(report_to_response)?;
    Ok(StatusCode::NO_CONTENT)
}
