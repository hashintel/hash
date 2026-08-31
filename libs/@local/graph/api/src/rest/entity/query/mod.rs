pub(crate) mod request;

use alloc::sync::Arc;
use std::collections::HashMap;

use axum::Extension;
use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    entity::{
        ClosedMultiEntityTypeMap, EntityPermissions, EntityQueryCursor, EntityStore as _,
        QueryEntitiesResponse, QueryEntitiesTableParams, QueryEntitiesTableResponse,
        SummarizeEntitiesParams, SummarizeEntitiesResponse,
    },
    entity_type::EntityTypeResolveDefinitions,
    pool::StorePool,
};
use hash_status::StatusCode;
use hash_temporal_client::TemporalClient;
use serde::Deserialize as _;
use serde_json::value::RawValue as RawJsonValue;
use type_system::{knowledge::entity::id::EntityId, ontology::VersionedUrl};

pub use self::request::{
    QueryEntitiesRequest, QueryEntitySubgraphError, QueryEntitySubgraphRequest,
};
use crate::rest::{
    ApiConfig, AuthenticatedActorId, OpenApiQuery, QueryLogger,
    json::Json,
    resolve_limit,
    status::{BoxedResponse, report_to_response},
    utoipa_typedef::subgraph::Subgraph,
};

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = QueryEntitiesRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = QueryEntitiesResponse,
            description = "A list of entities that satisfy the given query.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
pub(super) async fn query_entities<S>(
    actor_id: Option<AuthenticatedActorId>,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Extension(api_config): Extension<ApiConfig>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<Box<RawJsonValue>>,
) -> Result<Json<QueryEntitiesResponse<'static>>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    let actor_id = actor_id.map(|AuthenticatedActorId(actor_id)| actor_id);
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntities(&request));
    }

    let request = QueryEntitiesRequest::deserialize(&*request)
        .map_err(Report::from)
        .attach(StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let params = request
        .into_params(api_config)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .query_entities(actor_id, params)
        .await
        .map(Json)
        .map_err(report_to_response);

    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[derive(serde::Serialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase")]
pub(super) struct QueryEntitySubgraphResponse<'r> {
    subgraph: Subgraph,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'r>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    closed_multi_entity_types: Option<HashMap<VersionedUrl, ClosedMultiEntityTypeMap>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    definitions: Option<EntityTypeResolveDefinitions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    entity_permissions: Option<HashMap<EntityId, EntityPermissions>>,
}

#[utoipa::path(
    post,
    path = "/entities/query/subgraph",
    request_body = QueryEntitySubgraphRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = QueryEntitySubgraphResponse,
            description = "A subgraph rooted at entities that satisfy the given query, each resolved to the requested depth.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
pub(super) async fn query_entity_subgraph<S>(
    actor_id: Option<AuthenticatedActorId>,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Extension(api_config): Extension<ApiConfig>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<QueryEntitySubgraphResponse<'static>>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    let actor_id = actor_id.map(|AuthenticatedActorId(actor_id)| actor_id);
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntitySubgraph(&request));
    }

    let request = QueryEntitySubgraphRequest::deserialize(&request)
        .map_err(Report::from)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let params = request
        .into_traversal_params(api_config)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .query_entity_subgraph(actor_id, params)
        .await
        .map(|response| {
            Json(QueryEntitySubgraphResponse {
                subgraph: response.subgraph.into(),
                cursor: response.cursor.map(EntityQueryCursor::into_owned),
                closed_multi_entity_types: response.closed_multi_entity_types,
                definitions: response.definitions,
                entity_permissions: response.entity_permissions,
            })
        })
        .map_err(report_to_response);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    post,
    path = "/entities/query/summarize",
    request_body = SummarizeEntitiesParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = SummarizeEntitiesResponse,
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
pub(super) async fn summarize_entities<S>(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<SummarizeEntitiesResponse>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(Some(actor_id), OpenApiQuery::SummarizeEntities(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .summarize_entities(
            actor_id,
            SummarizeEntitiesParams::deserialize(&request)
                .map_err(Report::from)
                .attach(hash_status::StatusCode::InvalidArgument)
                .map_err(report_to_response)?,
        )
        .await
        .map(Json)
        .map_err(report_to_response);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    post,
    path = "/entities/query/table",
    request_body = QueryEntitiesTableParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = QueryEntitiesTableResponse,
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
pub(super) async fn query_entities_table<S>(
    AuthenticatedActorId(actor_id): AuthenticatedActorId,
    store_pool: Extension<Arc<S>>,
    Extension(api_config): Extension<ApiConfig>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<QueryEntitiesTableResponse>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    let mut params = QueryEntitiesTableParams::deserialize(&request)
        .map_err(Report::from)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;
    params.limit = resolve_limit(Some(params.limit), api_config.query_entity_limit)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .query_entities_table(actor_id, params)
        .await
        .map(Json)
        .map_err(report_to_response)
}
