//! Web routes for CRU operations on entities.

use alloc::sync::Arc;
use std::collections::HashMap;

use axum::{Extension, Router, response::Response, routing::post};
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::store::error::{EntityDoesNotExist, RaceConditionOnUpdate};
use hash_graph_store::{
    self,
    entity::{
        ClosedMultiEntityTypeMap, CountEntitiesParams, CreateEntityParams, DiffEntityParams,
        DiffEntityResult, EntityPermissions, EntityQueryCursor, EntityQuerySortingRecord,
        EntityQuerySortingToken, EntityQueryToken, EntityStore, EntityTypesError,
        EntityValidationReport, EntityValidationType, HasPermissionForEntitiesParams,
        LinkDataStateError, LinkDataValidationReport, LinkError, LinkTargetError,
        LinkValidationReport, LinkedEntityError, MetadataValidationReport, PatchEntityParams,
        PropertyMetadataValidationReport, QueryConversion, QueryEntitiesResponse,
        UnexpectedEntityType, UpdateEntityEmbeddingsParams, ValidateEntityComponents,
        ValidateEntityParams,
    },
    entity_type::EntityTypeResolveDefinitions,
    pool::StorePool,
    query::{NullOrdering, Ordering},
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
use hashql_core::heap::Heap;
use serde::{Deserialize as _, Serialize};
use serde_json::value::RawValue as RawJsonvalue;
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

use super::InteractiveHeader;
pub use crate::rest::entity_query_request::{
    EntityQuery, EntityQueryOptions, QueryEntitiesRequest, QueryEntitySubgraphRequest,
};
use crate::rest::{
    AuthenticatedUserHeader, OpenApiQuery, QueryLogger, entity_query_request::CompilationOptions,
    json::Json, status::report_to_response, utoipa_typedef::subgraph::Subgraph,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity,
        create_entities,
        validate_entity,
        has_permission_for_entities,
        query_entities,
        query_entity_subgraph,
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

            EntityQueryOptions,
            QueryEntitiesRequest,
            QueryEntitySubgraphRequest,
            EntityQueryCursor,
            Ordering,
            NullOrdering,
            EntityQuerySortingRecord,
            EntityQuerySortingToken,
            QueryEntitiesResponse,
            QueryEntitySubgraphResponse,
            EntityPermissions,
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
                        .route("/", post(query_entities::<S>))
                        .route("/subgraph", post(query_entity_subgraph::<S>))
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

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = QueryEntitiesRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("Interactive" = Option<bool>, Header, description = "Whether the request is used interactively"),
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
async fn query_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    InteractiveHeader(interactive): InteractiveHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<Box<RawJsonvalue>>,
) -> Result<Json<QueryEntitiesResponse<'static>>, Response>
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

    let (query, options) = request.into_parts();

    if options.limit == Some(0) {
        tracing::warn!(
            %actor_id,
            "The limit is set to zero, so no entities will be returned."
        );
    }

    // TODO: https://linear.app/hash/issue/H-5351/reuse-parts-between-compilation-units
    let mut heap = Heap::uninitialized();

    if matches!(query, EntityQuery::Query { .. }) {
        // The heap is going to be used in the compilation of the query and therefore needs to be
        // primed.
        // Doing this in a separate step allows us to be allocation free when not using HashQL
        // queries.
        heap.prime();
    }

    let filter = query.compile(&heap, CompilationOptions { interactive })?;

    let params = options.into_params(filter);

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

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct QueryEntitySubgraphResponse<'r> {
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
        ("Interactive" = Option<bool>, Header, description = "Whether the query is interactive"),
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
async fn query_entity_subgraph<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    InteractiveHeader(interactive): InteractiveHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<QueryEntitySubgraphResponse<'static>>, Response>
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
    let (query, options, traversal) = request.into_parts();

    // TODO: https://linear.app/hash/issue/H-5351/reuse-parts-between-compilation-units
    let mut heap = Heap::uninitialized();

    if matches!(query, EntityQuery::Query { .. }) {
        // The heap is going to be used in the compilation of the query and therefore needs to be
        // primed.
        // Doing this in a separate step allows us to be allocation free when not using HashQL
        // queries.
        heap.prime();
    }

    let filter = query.compile(&heap, CompilationOptions { interactive })?;

    let params = options.into_traversal_params(filter, traversal);

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
                report.attach_opaque(hash_status::StatusCode::NotFound)
            } else if report.contains::<RaceConditionOnUpdate>() {
                report.attach_opaque(hash_status::StatusCode::Cancelled)
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
        .attach_opaque(hash_status::StatusCode::InvalidArgument)
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
                report.attach_opaque(hash_status::StatusCode::NotFound)
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
