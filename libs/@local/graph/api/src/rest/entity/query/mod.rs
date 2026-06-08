pub(crate) mod request;

use alloc::sync::Arc;
use std::collections::HashMap;

use axum::Extension;
use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    entity::{
        ClosedMultiEntityTypeMap, CountEntitiesParams, EntityPermissions, EntityQueryCursor,
        EntityStore as _, QueryEntitiesResponse,
    },
    entity_type::EntityTypeResolveDefinitions,
    pool::StorePool,
};
use hash_temporal_client::TemporalClient;
use serde::Deserialize as _;
use serde_json::value::RawValue as RawJsonvalue;
use type_system::{
    knowledge::entity::id::EntityId,
    ontology::VersionedUrl,
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};

pub use self::request::{
    QueryEntitiesRequest, QueryEntitySubgraphError, QueryEntitySubgraphRequest,
};
use crate::rest::{
    ApiConfig, AuthenticatedUserHeader, OpenApiQuery, QueryLogger,
    json::Json,
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
        ("after" = Option<String>, Query, description = "The cursor to start reading from"),
        ("limit" = Option<usize>, Query, description = "The maximum number of entities to read"),
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
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Extension(api_config): Extension<ApiConfig>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<Box<RawJsonvalue>>,
) -> Result<Json<QueryEntitiesResponse<'static>>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntities(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let request = QueryEntitiesRequest::deserialize(&*request)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let params = request
        .into_params(api_config)
        .attach(hash_status::StatusCode::InvalidArgument)
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
    count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    closed_multi_entity_types: Option<HashMap<VersionedUrl, ClosedMultiEntityTypeMap>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    definitions: Option<EntityTypeResolveDefinitions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    web_ids: Option<HashMap<WebId, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    type_ids: Option<HashMap<VersionedUrl, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    type_titles: Option<HashMap<VersionedUrl, String>>,
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
        ("after" = Option<String>, Query, description = "The cursor to start reading from"),
        ("limit" = Option<usize>, Query, description = "The maximum number of entities to read"),
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
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Extension(api_config): Extension<ApiConfig>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<QueryEntitySubgraphResponse<'static>>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntitySubgraph(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let request = QueryEntitySubgraphRequest::deserialize(&request)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let params = request
        .into_traversal_params(api_config)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let response = store
        .query_entity_subgraph(actor_id, params)
        .await
        .map(|response| {
            Json(QueryEntitySubgraphResponse {
                subgraph: response.subgraph.into(),
                cursor: response.cursor.map(EntityQueryCursor::into_owned),
                count: response.count,
                closed_multi_entity_types: response.closed_multi_entity_types,
                definitions: response.definitions,
                web_ids: response.web_ids,
                created_by_ids: response.created_by_ids,
                edition_created_by_ids: response.edition_created_by_ids,
                type_ids: response.type_ids,
                type_titles: response.type_titles,
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
    path = "/entities/query/count",
    request_body = CountEntitiesParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),

    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = usize,
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
pub(super) async fn count_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<usize>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::CountEntities(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .count_entities(
            actor_id,
            CountEntitiesParams::deserialize(&request)
                .map_err(Report::from)
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
