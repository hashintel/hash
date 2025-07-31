//! Web routes for CRU operations on entities.

use alloc::sync::Arc;
use std::collections::HashMap;

use axum::{Extension, Router, response::Response, routing::post};
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::store::error::{EntityDoesNotExist, RaceConditionOnUpdate};
use hash_graph_store::{
    entity::{
        ClosedMultiEntityTypeMap, CountEntitiesParams, CreateEntityParams, DiffEntityParams,
        DiffEntityResult, EntityQueryCursor, EntityQueryPath, EntityQuerySorting,
        EntityQuerySortingRecord, EntityQuerySortingToken, EntityQueryToken, EntityStore,
        EntityTypesError, EntityValidationReport, EntityValidationType, GetEntitiesParams,
        GetEntitiesResponse, GetEntitySubgraphParams, HasPermissionForEntitiesParams,
        LinkDataStateError, LinkDataValidationReport, LinkError, LinkTargetError,
        LinkValidationReport, LinkedEntityError, MetadataValidationReport, PatchEntityParams,
        PropertyMetadataValidationReport, QueryConversion, UnexpectedEntityType,
        UpdateEntityEmbeddingsParams, ValidateEntityComponents, ValidateEntityParams,
    },
    entity_type::{EntityTypeResolveDefinitions, IncludeEntityTypeOption},
    filter::Filter,
    pool::StorePool,
    query::{NullOrdering, Ordering},
    subgraph::{edges::GraphResolveDepths, temporal_axes::QueryTemporalAxesUnresolved},
};
use hash_graph_types::{
    Embedding,
    knowledge::{
        entity::EntityEmbedding,
        property::visitor::{
            ArrayItemNumberMismatch, ArrayValidationReport, DataTypeCanonicalCalculation,
            DataTypeConversionError, DataTypeInferenceError, JsonSchemaValueTypeMismatch,
            ObjectPropertyValidationReport, ObjectValidationReport, OneOfArrayValidationReports,
            OneOfObjectValidationReports, OneOfPropertyValidationReports,
            PropertyArrayValidationReport, PropertyObjectValidationReport,
            PropertyValidationReport, PropertyValueTypeMismatch, PropertyValueValidationReport,
            ValueValidationError, ValueValidationReport,
        },
    },
};
use hash_temporal_client::TemporalClient;
use serde::{Deserialize, Serialize};
use type_system::{
    knowledge::{
        Confidence, Entity, Property,
        entity::{
            EntityMetadata, LinkData,
            id::{EntityEditionId, EntityId, EntityRecordId, EntityUuid},
            metadata::{EntityTemporalMetadata, EntityTypeIdDiff},
            provenance::{
                EntityEditionProvenance, EntityProvenance, InferredEntityProvenance,
                ProvidedEntityEditionProvenance,
            },
        },
        property::{
            PropertyArrayWithMetadata, PropertyDiff, PropertyObject, PropertyObjectWithMetadata,
            PropertyPatchOperation, PropertyPath, PropertyPathElement, PropertyValueWithMetadata,
            PropertyWithMetadata,
            metadata::{
                ArrayMetadata, ObjectMetadata, PropertyArrayMetadata, PropertyMetadata,
                PropertyObjectMetadata, PropertyProvenance, PropertyValueMetadata,
            },
        },
        value::{ValueMetadata, metadata::ValueProvenance},
    },
    ontology::VersionedUrl,
    principal::{
        actor::{ActorEntityUuid, ActorType},
        actor_group::WebId,
    },
    provenance::{Location, OriginProvenance, SourceProvenance, SourceType},
};
use utoipa::{OpenApi, ToSchema};

use crate::rest::{
    AuthenticatedUserHeader, OpenApiQuery, QueryLogger, json::Json, status::report_to_response,
    utoipa_typedef::subgraph::Subgraph,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity,
        create_entities,
        validate_entity,
        has_permission_for_entities,
        get_entities,
        get_entity_subgraph,
        count_entities,
        patch_entity,
        update_entity_embeddings,
        diff_entity,
    ),
    components(
        schemas(
            CreateEntityParams,
            PropertyWithMetadata,
            PropertyValueWithMetadata,
            PropertyArrayWithMetadata,
            PropertyObjectWithMetadata,
            ValidateEntityParams,
            CountEntitiesParams,
            EntityValidationType,
            ValidateEntityComponents,
            Embedding,
            UpdateEntityEmbeddingsParams,
            EntityEmbedding,
            EntityQueryToken,

            PatchEntityParams,
            PropertyPatchOperation,

            HasPermissionForEntitiesParams,

            GetEntitiesRequest,
            GetEntitySubgraphRequest,
            EntityQueryCursor,
            Ordering,
            NullOrdering,
            EntityQuerySortingRecord,
            EntityQuerySortingToken,
            GetEntitiesResponse,
            GetEntitySubgraphResponse,
            ClosedMultiEntityTypeMap,
            QueryConversion,

            Entity,
            Property,
            PropertyProvenance,
            PropertyObject,
            ArrayMetadata,
            ObjectMetadata,
            ValueMetadata,
            ValueProvenance,
            PropertyObjectMetadata,
            PropertyArrayMetadata,
            PropertyValueMetadata,
            PropertyMetadata,
            EntityUuid,
            EntityId,
            EntityEditionId,
            EntityMetadata,
            EntityProvenance,
            EntityEditionProvenance,
            InferredEntityProvenance,
            ProvidedEntityEditionProvenance,
            ActorType,
            OriginProvenance,
            SourceType,
            SourceProvenance,
            Location,
            EntityRecordId,
            EntityTemporalMetadata,
            EntityQueryToken,
            LinkData,
            EntityValidationReport,
            LinkedEntityError,
            LinkDataValidationReport,
            LinkDataStateError,
            LinkValidationReport,
            LinkError,
            LinkTargetError,
            UnexpectedEntityType,
            MetadataValidationReport,
            EntityTypesError,
            PropertyMetadataValidationReport,
            ObjectPropertyValidationReport,
            JsonSchemaValueTypeMismatch,
            ArrayValidationReport,
            ArrayItemNumberMismatch,
            PropertyValidationReport,
            OneOfPropertyValidationReports,
            PropertyValueValidationReport,
            ObjectValidationReport,
            DataTypeConversionError,
            DataTypeCanonicalCalculation,
            DataTypeInferenceError,
            PropertyValueTypeMismatch,
            OneOfArrayValidationReports,
            PropertyArrayValidationReport,
            OneOfObjectValidationReports,
            PropertyObjectValidationReport,
            ValueValidationReport,
            ValueValidationError,

            DiffEntityParams,
            DiffEntityResult,
            EntityTypeIdDiff,
            PropertyDiff,
            PropertyPath,
            PropertyPathElement,
            Confidence,
        )
    ),
    tags(
        (name = "Entity", description = "entity management API")
    )
)]
pub(crate) struct EntityResource;

impl EntityResource {
    /// Create routes for interacting with entities.
    pub(crate) fn routes<S>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entities",
            Router::new()
                .route("/", post(create_entity::<S>).patch(patch_entity::<S>))
                .route("/bulk", post(create_entities::<S>))
                .route("/diff", post(diff_entity::<S>))
                .route("/validate", post(validate_entity::<S>))
                .route("/embeddings", post(update_entity_embeddings::<S>))
                .route("/permissions", post(has_permission_for_entities::<S>))
                .nest(
                    "/query",
                    Router::new()
                        .route("/", post(get_entities::<S>))
                        .route("/subgraph", post(get_entity_subgraph::<S>))
                        .route("/count", post(count_entities::<S>)),
                ),
        )
    }
}

#[utoipa::path(
    post,
    path = "/entities",
    request_body = CreateEntityParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The created entity", body = Entity),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(level = "info", skip_all)]
async fn create_entity<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Entity>, Response>
where
    S: StorePool + Send + Sync,
{
    let params = CreateEntityParams::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .create_entity(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entities/bulk",
    request_body = [CreateEntityParams],
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The created entities", body = [Entity]),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(level = "info", skip_all)]
async fn create_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Vec<Entity>>, Response>
where
    S: StorePool + Send + Sync,
{
    let params = Vec::<CreateEntityParams>::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .create_entities(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entities/validate",
    request_body = ValidateEntityParams,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The validation report", body = HashMap<usize, EntityValidationReport>),
        (status = 400, content_type = "application/json", description = "The entity validation failed"),

        (status = 404, description = "Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(level = "info", skip_all)]
async fn validate_entity<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<HashMap<usize, EntityValidationReport>>, Response>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::ValidateEntity(&body));
    }

    let params = ValidateEntityParams::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .validate_entity(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    post,
    path = "/entities/permissions",
    tag = "Entity",
    request_body = HasPermissionForEntitiesParams,
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, body = HashMap<EntityUuid, Vec<EntityEditionId>>, description = "Information if the actor has the permission for the entities"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, temporal_client))]
async fn has_permission_for_entities<S>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    Json(params): Json<HasPermissionForEntitiesParams<'static>>,
) -> Result<Json<HashMap<EntityId, Vec<EntityEditionId>>>, Response>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: EntityStore,
{
    store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?
        .has_permission_for_entities(AuthenticatedActor::from(actor), params)
        .await
        .map(Json)
        .map_err(report_to_response)
}

fn generate_sorting_paths(
    paths: Option<Vec<EntityQuerySortingRecord<'_>>>,
    limit: Option<usize>,
    cursor: Option<EntityQueryCursor<'_>>,
    temporal_axes: &QueryTemporalAxesUnresolved,
) -> EntityQuerySorting<'static> {
    let temporal_axes_sorting_path = match temporal_axes {
        QueryTemporalAxesUnresolved::TransactionTime { .. } => &EntityQueryPath::TransactionTime,
        QueryTemporalAxesUnresolved::DecisionTime { .. } => &EntityQueryPath::DecisionTime,
    };

    let sorting = paths
        .map_or_else(
            || {
                if limit.is_some() || cursor.is_some() {
                    vec![
                        EntityQuerySortingRecord {
                            path: temporal_axes_sorting_path.clone(),
                            ordering: Ordering::Descending,
                            nulls: None,
                        },
                        EntityQuerySortingRecord {
                            path: EntityQueryPath::Uuid,
                            ordering: Ordering::Ascending,
                            nulls: None,
                        },
                        EntityQuerySortingRecord {
                            path: EntityQueryPath::WebId,
                            ordering: Ordering::Ascending,
                            nulls: None,
                        },
                    ]
                } else {
                    Vec::new()
                }
            },
            |mut paths| {
                let mut has_temporal_axis = false;
                let mut has_uuid = false;
                let mut has_web_id = false;

                for path in &paths {
                    if path.path == EntityQueryPath::TransactionTime
                        || path.path == EntityQueryPath::DecisionTime
                    {
                        has_temporal_axis = true;
                    }
                    if path.path == EntityQueryPath::Uuid {
                        has_uuid = true;
                    }
                    if path.path == EntityQueryPath::WebId {
                        has_web_id = true;
                    }
                }

                if !has_temporal_axis {
                    paths.push(EntityQuerySortingRecord {
                        path: temporal_axes_sorting_path.clone(),
                        ordering: Ordering::Descending,
                        nulls: None,
                    });
                }
                if !has_uuid {
                    paths.push(EntityQuerySortingRecord {
                        path: EntityQueryPath::Uuid,
                        ordering: Ordering::Ascending,
                        nulls: None,
                    });
                }
                if !has_web_id {
                    paths.push(EntityQuerySortingRecord {
                        path: EntityQueryPath::WebId,
                        ordering: Ordering::Ascending,
                        nulls: None,
                    });
                }

                paths
            },
        )
        .into_iter()
        .map(EntityQuerySortingRecord::into_owned)
        .collect();

    EntityQuerySorting {
        paths: sorting,
        cursor: cursor.map(EntityQueryCursor::into_owned),
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "Parameter struct deserialized from JSON"
)]
pub struct GetEntitiesRequest<'q, 's, 'p> {
    #[serde(borrow)]
    pub filter: Filter<'q, Entity>,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    pub limit: Option<usize>,
    #[serde(borrow, default)]
    pub conversions: Vec<QueryConversion<'p>>,
    #[serde(borrow)]
    pub sorting_paths: Option<Vec<EntityQuerySortingRecord<'p>>>,
    #[serde(borrow)]
    pub cursor: Option<EntityQueryCursor<'s>>,
    #[serde(default)]
    pub include_count: bool,
    #[serde(default)]
    pub include_entity_types: Option<IncludeEntityTypeOption>,
    #[serde(default)]
    pub include_web_ids: bool,
    #[serde(default)]
    pub include_created_by_ids: bool,
    #[serde(default)]
    pub include_edition_created_by_ids: bool,
    #[serde(default)]
    pub include_type_ids: bool,
    #[serde(default)]
    pub include_type_titles: bool,
}

impl<'q, 's, 'p: 'q> From<GetEntitiesRequest<'q, 's, 'p>> for GetEntitiesParams<'q> {
    fn from(request: GetEntitiesRequest<'q, 's, 'p>) -> Self {
        Self {
            filter: request.filter,
            sorting: generate_sorting_paths(
                request.sorting_paths,
                request.limit,
                request.cursor,
                &request.temporal_axes,
            ),
            limit: request.limit,
            conversions: request.conversions,
            include_drafts: request.include_drafts,
            include_count: request.include_count,
            include_entity_types: request.include_entity_types,
            temporal_axes: request.temporal_axes,
            include_web_ids: request.include_web_ids,
            include_created_by_ids: request.include_created_by_ids,
            include_edition_created_by_ids: request.include_edition_created_by_ids,
            include_type_ids: request.include_type_ids,
            include_type_titles: request.include_type_titles,
        }
    }
}

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = GetEntitiesRequest,
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
            body = GetEntitiesResponse,
            description = "A list of entities that satisfy the given query.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip_all,
    fields(actor=%actor_id)
)]
async fn get_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntitiesResponse<'static>>, Response>
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

    let request = GetEntitiesRequest::deserialize(&request)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    if request.limit == Some(0) {
        tracing::warn!(
            %actor_id,
            "The limit is set to zero, so no entities will be returned."
        );
    }

    let response = store
        .get_entities(actor_id, request.into())
        .await
        .map(|response| {
            Json(GetEntitiesResponse {
                entities: response.entities,
                cursor: response.cursor.map(EntityQueryCursor::into_owned),
                count: response.count,
                closed_multi_entity_types: response.closed_multi_entity_types,
                definitions: response.definitions,
                web_ids: response.web_ids,
                created_by_ids: response.created_by_ids,
                edition_created_by_ids: response.edition_created_by_ids,
                type_ids: response.type_ids,
                type_titles: response.type_titles,
            })
        })
        .map_err(report_to_response);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "Parameter struct deserialized from JSON"
)]
pub struct GetEntitySubgraphRequest<'q, 's, 'p> {
    #[serde(borrow)]
    pub filter: Filter<'q, Entity>,
    pub graph_resolve_depths: GraphResolveDepths,
    pub temporal_axes: QueryTemporalAxesUnresolved,
    pub include_drafts: bool,
    pub limit: Option<usize>,
    #[serde(borrow, default)]
    pub conversions: Vec<QueryConversion<'p>>,
    #[serde(borrow)]
    pub sorting_paths: Option<Vec<EntityQuerySortingRecord<'p>>>,
    #[serde(borrow)]
    pub cursor: Option<EntityQueryCursor<'s>>,
    #[serde(default)]
    pub include_count: bool,
    #[serde(default)]
    pub include_entity_types: Option<IncludeEntityTypeOption>,
    #[serde(default)]
    pub include_web_ids: bool,
    #[serde(default)]
    pub include_created_by_ids: bool,
    #[serde(default)]
    pub include_edition_created_by_ids: bool,
    #[serde(default)]
    pub include_type_ids: bool,
    #[serde(default)]
    pub include_type_titles: bool,
}

impl<'q, 's, 'p: 'q> From<GetEntitySubgraphRequest<'q, 's, 'p>> for GetEntitySubgraphParams<'q> {
    fn from(request: GetEntitySubgraphRequest<'q, 's, 'p>) -> Self {
        Self {
            filter: request.filter,
            sorting: generate_sorting_paths(
                request.sorting_paths,
                request.limit,
                request.cursor,
                &request.temporal_axes,
            ),
            limit: request.limit,
            conversions: request.conversions,
            graph_resolve_depths: request.graph_resolve_depths,
            include_drafts: request.include_drafts,
            include_count: request.include_count,
            include_entity_types: request.include_entity_types,
            temporal_axes: request.temporal_axes,
            include_web_ids: request.include_web_ids,
            include_created_by_ids: request.include_created_by_ids,
            include_edition_created_by_ids: request.include_edition_created_by_ids,
            include_type_ids: request.include_type_ids,
            include_type_titles: request.include_type_titles,
        }
    }
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct GetEntitySubgraphResponse<'r> {
    subgraph: Subgraph,
    #[serde(borrow)]
    cursor: Option<EntityQueryCursor<'r>>,
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
}

#[utoipa::path(
    post,
    path = "/entities/query/subgraph",
    request_body = GetEntitySubgraphRequest,
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
            body = GetEntitySubgraphResponse,
            description = "A subgraph rooted at entities that satisfy the given query, each resolved to the requested depth.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip_all,
    fields(actor=%actor_id, %request)
)]
async fn get_entity_subgraph<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntitySubgraphResponse<'static>>, Response>
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

    let request = GetEntitySubgraphRequest::deserialize(&request)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    if request.limit == Some(0) {
        tracing::warn!(
            %actor_id,
            "The limit is set to zero, so no entities will be returned"
        );
    }

    let response = store
        .get_entity_subgraph(actor_id, request.into())
        .await
        .map(|response| {
            Json(GetEntitySubgraphResponse {
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
#[tracing::instrument(level = "info", skip(store_pool, temporal_client, request))]
async fn count_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<usize>, Response>
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

#[utoipa::path(
    patch,
    path = "/entities",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The updated entity", body = Entity),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),
        (status = 423, content_type = "text/plain", description = "The entity that should be updated was unexpectedly updated at the same time"),

        (status = 404, description = "Entity ID or Entity Type URL was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = PatchEntityParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, temporal_client, params))]
async fn patch_entity<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(params): Json<PatchEntityParams>,
) -> Result<Json<Entity>, Response>
where
    S: StorePool + Send + Sync,
{
    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .patch_entity(actor_id, params)
        .await
        .map_err(|report| {
            if report.contains::<EntityDoesNotExist>() {
                report.attach(hash_status::StatusCode::NotFound)
            } else if report.contains::<RaceConditionOnUpdate>() {
                report.attach(hash_status::StatusCode::Cancelled)
            } else {
                report
            }
        })
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entities/embeddings",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The embeddings were created"),

        (status = 403, description = "Insufficient permissions to update the entity"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityEmbeddingsParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, temporal_client, body))]
async fn update_entity_embeddings<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<(), Response>
where
    S: StorePool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = UpdateEntityEmbeddingsParams::deserialize(body)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .update_entity_embeddings(actor_id, params)
        .await
        .map_err(report_to_response)
}

#[utoipa::path(
    post,
    path = "/entities/diff",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The difference between the two entities", body = DiffEntityResult),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = DiffEntityParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, temporal_client, params))]
async fn diff_entity<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(params): Json<DiffEntityParams>,
) -> Result<Json<DiffEntityResult<'static>>, Response>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::DiffEntity(&params));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .diff_entity(actor_id, params)
        .await
        .map_err(|report| {
            if report.contains::<EntityDoesNotExist>() {
                report.attach(hash_status::StatusCode::NotFound)
            } else {
                report
            }
        })
        .map_err(report_to_response)
        .map(Json);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}
