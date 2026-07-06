//! Web routes for CRU operations on entities.

pub mod query;

use alloc::sync::Arc;
use std::collections::HashMap;

use axum::{Extension, Router, routing::post};
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::store::error::{EntityDoesNotExist, RaceConditionOnUpdate};
use hash_graph_store::{
    self,
    entity::{
        ClosedMultiEntityTypeMap, CreateEntityParams, DiffEntityParams, DiffEntityResult,
        EntityPermissions, EntityQueryCursor, EntityQuerySortingRecord, EntityQuerySortingToken,
        EntityQueryToken, EntityStore, EntityTypesError, EntityValidationReport,
        EntityValidationType, HasPermissionForEntitiesParams, LinkDataStateError,
        LinkDataValidationReport, LinkError, LinkTargetError, LinkValidationReport,
        LinkedEntityError, MetadataValidationReport, PatchEntityParams,
        PropertyMetadataValidationReport, QueryConversion, QueryEntitiesResponse,
        SearchEntitiesFilter, SearchEntitiesParams, SearchEntitiesResponse,
        SummarizeEntitiesParams, SummarizeEntitiesResponse, UnexpectedEntityType,
        UpdateEntityEmbeddingsParams, ValidateEntityComponents, ValidateEntityParams,
    },
    filter::SemanticDistance,
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
use serde::Deserialize as _;
use type_system::{
    knowledge::{
        Confidence, Entity, Property,
        entity::{
            EntityMetadata, LinkData,
            id::{EntityEditionId, EntityId, EntityRecordId, EntityUuid},
            metadata::{EntityTemporalMetadata, EntityTypeIdDiff},
            provenance::{
                EntityDeletionProvenance, EntityEditionProvenance, EntityProvenance,
                InferredEntityProvenance, ProvidedEntityEditionProvenance,
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
    principal::actor::ActorType,
    provenance::{Location, OriginProvenance, SourceProvenance, SourceType},
};

use self::query::{
    QueryEntitySubgraphResponse, query_entities, query_entity_subgraph,
    request::{QueryEntitiesRequest, QueryEntitySubgraphRequest},
    summarize_entities,
};
use crate::rest::{
    ApiConfig, AuthenticatedUserHeader, OpenApiQuery, QueryLogger, SearchRequestError,
    json::Json,
    resolve_limit,
    status::{BoxedResponse, report_to_response},
};

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        create_entity,
        create_entities,
        validate_entity,
        has_permission_for_entities,
        self::query::query_entities,
        self::query::query_entity_subgraph,
        self::query::summarize_entities,
        search_entities,
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
            SummarizeEntitiesParams,
            SummarizeEntitiesResponse,
            EntityValidationType,
            ValidateEntityComponents,
            Embedding,
            UpdateEntityEmbeddingsParams,
            EntityEmbedding,
            EntityQueryToken,

            PatchEntityParams,
            PropertyPatchOperation,

            HasPermissionForEntitiesParams,

            QueryEntitiesRequest,
            QueryEntitySubgraphRequest,
            SearchEntitiesRequest,
            SearchEntitiesFilter,
            SearchEntitiesResponse,
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
            EntityDeletionProvenance,
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
                .route("/search", post(search_entities::<S>))
                .nest(
                    "/query",
                    Router::new()
                        .route("/", post(query_entities::<S>))
                        .route("/subgraph", post(query_entity_subgraph::<S>))
                        .route("/summarize", post(summarize_entities::<S>)),
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
) -> Result<Json<Entity>, BoxedResponse>
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
) -> Result<Json<Vec<Entity>>, BoxedResponse>
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
) -> Result<Json<HashMap<usize, EntityValidationReport>>, BoxedResponse>
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
) -> Result<Json<HashMap<EntityId, Vec<EntityEditionId>>>, BoxedResponse>
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

/// Request body for the entity embedding search endpoint.
#[derive(Debug, serde::Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SearchEntitiesRequest {
    pub embedding: Embedding<'static>,
    pub maximum_semantic_distance: f64,
    pub limit: Option<usize>,
    #[serde(default)]
    pub include_entity_types: bool,
    #[serde(default)]
    pub filter: SearchEntitiesFilter,
}

impl SearchEntitiesRequest {
    /// Convert this request into [`SearchEntitiesParams`] with the given [`ApiConfig`].
    ///
    /// # Errors
    ///
    /// - [`InvalidSemanticDistance`] if the maximum semantic distance is invalid.
    /// - [`LimitExceeded`] if the requested limit exceeds the configured maximum.
    ///
    /// [`InvalidSemanticDistance`]: SearchRequestError::InvalidSemanticDistance
    /// [`LimitExceeded`]: SearchRequestError::LimitExceeded
    pub(crate) fn into_params(
        self,
        config: ApiConfig,
    ) -> Result<SearchEntitiesParams, Report<SearchRequestError>> {
        Ok(SearchEntitiesParams {
            embedding: self.embedding,
            maximum_semantic_distance: SemanticDistance::try_from(self.maximum_semantic_distance)
                .change_context(
                SearchRequestError::InvalidSemanticDistance,
            )?,
            limit: resolve_limit(self.limit, config.query_entity_limit)
                .change_context(SearchRequestError::LimitExceeded)?,
            include_entity_types: self.include_entity_types,
            filter: self.filter,
        })
    }
}

#[utoipa::path(
    post,
    path = "/entities/search",
    request_body = SearchEntitiesRequest,
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = SearchEntitiesResponse,
            description = "Entities ordered by ascending cosine distance to the query embedding.",
        ),
        (status = 400, content_type = "text/plain", description = "Provided request body is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn search_entities<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Extension(api_config): Extension<ApiConfig>,
    Json(request): Json<SearchEntitiesRequest>,
) -> Result<Json<SearchEntitiesResponse>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let params = request
        .into_params(api_config)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    store
        .search_entities(actor_id, params)
        .await
        .map(Json)
        .map_err(report_to_response)
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
) -> Result<Json<Entity>, BoxedResponse>
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
) -> Result<(), BoxedResponse>
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
) -> Result<Json<DiffEntityResult<'static>>, BoxedResponse>
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
