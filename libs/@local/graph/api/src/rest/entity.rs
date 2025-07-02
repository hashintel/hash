//! Web routes for CRU operations on entities.

use alloc::sync::Arc;
use std::collections::HashMap;

use axum::{
    Extension, Router,
    extract::Path,
    http::StatusCode,
    response::Response,
    routing::{get, post},
};
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{
    AuthorizationApi as _, AuthorizationApiPool,
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    policies::principal::actor::AuthenticatedActor,
    schema::{
        EntityAdministratorSubject, EntityEditorSubject, EntityOwnerSubject, EntityPermission,
        EntityRelationAndSubject, EntitySetting, EntitySettingSubject, EntitySubjectSet,
        EntityViewerSubject, WebOwnerSubject,
    },
    zanzibar::Consistency,
};
use hash_graph_postgres_store::store::error::{EntityDoesNotExist, RaceConditionOnUpdate};
use hash_graph_store::{
    account::AccountStore as _,
    entity::{
        ClosedMultiEntityTypeMap, CountEntitiesParams, CreateEntityRequest, DiffEntityParams,
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

        get_entity_authorization_relationships,
        modify_entity_authorization_relationships,

        add_entity_administrator,
        remove_entity_administrator,
        add_entity_editor,
        remove_entity_editor,
    ),
    components(
        schemas(
            CreateEntityRequest,
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

            EntityRelationAndSubject,
            EntityPermission,
            EntitySubjectSet,
            EntitySettingSubject,
            EntityOwnerSubject,
            EntityAdministratorSubject,
            EntityEditorSubject,
            EntityViewerSubject,
            ModifyEntityAuthorizationRelationship,
            ModifyRelationshipOperation,
            EntitySetting,
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
    pub(crate) fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entities",
            Router::new()
                .route("/", post(create_entity::<S, A>).patch(patch_entity::<S, A>))
                .route("/bulk", post(create_entities::<S, A>))
                .route(
                    "/relationships",
                    post(modify_entity_authorization_relationships::<A>),
                )
                .route("/diff", post(diff_entity::<S, A>))
                .route("/validate", post(validate_entity::<S, A>))
                .route("/embeddings", post(update_entity_embeddings::<S, A>))
                .nest(
                    "/:entity_id",
                    Router::new()
                        .route(
                            "/relationships",
                            get(get_entity_authorization_relationships::<A>),
                        )
                        .route(
                            "/administrators/:subject_id",
                            post(add_entity_administrator::<A, S>)
                                .delete(remove_entity_administrator::<A, S>),
                        )
                        .route(
                            "/editors/:subject_id",
                            post(add_entity_editor::<A, S>).delete(remove_entity_editor::<A, S>),
                        ),
                )
                .route("/permissions", post(has_permission_for_entities::<S, A>))
                .nest(
                    "/query",
                    Router::new()
                        .route("/", post(get_entities::<S, A>))
                        .route("/subgraph", post(get_entity_subgraph::<S, A>))
                        .route("/count", post(count_entities::<S, A>)),
                ),
        )
    }
}

#[utoipa::path(
    post,
    path = "/entities",
    request_body = CreateEntityRequest,
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn create_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Entity>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let params = CreateEntityRequest::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
    request_body = [CreateEntityRequest],
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
async fn create_entities<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<Vec<Entity>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let params = Vec::<CreateEntityRequest>::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn validate_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<HashMap<usize, EntityValidationReport>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::ValidateEntity(&body));
    }

    let params = ValidateEntityParams::deserialize(&body)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .validate_entity(actor_id, Consistency::FullyConsistent, params)
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn has_permission_for_entities<S, A>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Json(params): Json<HasPermissionForEntitiesParams<'static>>,
) -> Result<Json<HashMap<EntityId, Vec<EntityEditionId>>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
    for<'p, 'a> S::Store<'p, A::Api<'a>>: EntityStore,
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
async fn get_entities<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntitiesResponse<'static>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntities(&request));
    }

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
async fn get_entity_subgraph<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetEntitySubgraphResponse<'static>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntitySubgraph(&request));
    }

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn count_entities<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<usize>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::CountEntities(&request));
    }

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn patch_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(params): Json<PatchEntityParams>,
) -> Result<Json<Entity>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, body)
)]
async fn update_entity_embeddings<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<(), Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = UpdateEntityEmbeddingsParams::deserialize(body)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn diff_entity<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(params): Json<DiffEntityParams>,
) -> Result<Json<DiffEntityResult<'static>>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::DiffEntity(&params));
    }

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
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

#[utoipa::path(
    get,
    path = "/entities/{entity_id}/relationships",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to read the relations for"),
    ),
    responses(
        (status = 200, description = "The relations of the entity", body = [EntityRelationAndSubject]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_entity_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(entity_id): Path<EntityId>,
    authorization_api_pool: Extension<Arc<A>>,
    mut query_logger: Option<Extension<QueryLogger>>,
) -> Result<Json<Vec<EntityRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(
            actor_id,
            OpenApiQuery::GetEntityAuthorizationRelationships { entity_id },
        );
    }

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let response = Ok(Json(
        authorization_api
            .get_entity_relations(entity_id, Consistency::FullyConsistent)
            .await
            .map_err(report_to_response)?,
    ));
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ModifyEntityAuthorizationRelationship {
    operation: ModifyRelationshipOperation,
    resource: EntityId,
    relation_subject: EntityRelationAndSubject,
}

#[utoipa::path(
    post,
    path = "/entities/relationships",
    tag = "Entity",
    request_body = [ModifyEntityAuthorizationRelationship],
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, description = "The relationship was modified for the entity"),

        (status = 403, description = "Permission denied"),
)
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn modify_entity_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    relationships: Json<Vec<ModifyEntityAuthorizationRelationship>>,
) -> Result<StatusCode, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let (entities, operations): (Vec<_>, Vec<_>) = relationships
        .0
        .into_iter()
        .map(|request| {
            (
                request.resource,
                (
                    request.operation,
                    request.resource,
                    request.relation_subject,
                ),
            )
        })
        .unzip();

    let (permissions, _zookie) = authorization_api
        .check_entities_permission(
            actor_id,
            EntityPermission::Update,
            entities,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(report_to_response)?;

    let mut failed = false;
    // TODO: Change interface for `check_entities_permission` to avoid this loop
    for (entity_id, has_permission) in permissions {
        if !has_permission {
            tracing::error!(
                "Insufficient permissions to modify relationship for entity `{entity_id}`"
            );
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
        .modify_entity_relations(operations)
        .await
        .map_err(report_to_response)?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/entities/{entity_id}/administrators/{subject_id}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to add the administrator to"),
        ("subject_id" = EntityUuid, Path, description = "The administrator to add to the entity"),
    ),
    responses(
        (status = 204, description = "The administrator was added to the entity"),

        (status = 403, description = "Permission denied"),
)
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn add_entity_administrator<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    Path((entity_id, subject_id)): Path<(EntityId, EntityUuid)>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .check_entity_permission(
            actor_id,
            EntityPermission::Update,
            entity_id,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if administrator can be added to entity"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let administrator_id = store_pool
        .acquire(&mut authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .identify_subject_id(subject_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account or account group");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let administrator = match administrator_id {
        WebOwnerSubject::Account { id } => EntityAdministratorSubject::Account { id },
        WebOwnerSubject::AccountGroup { id } => EntityAdministratorSubject::AccountGroup {
            id,
            set: EntitySubjectSet::Member,
        },
    };

    authorization_api
        .modify_entity_relations([(
            ModifyRelationshipOperation::Create,
            entity_id,
            EntityRelationAndSubject::Administrator {
                subject: administrator,
                level: 0,
            },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add entity administrator");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/entities/{entity_id}/administrators/{subject_id}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to remove the administrator from"),
        ("subject_id" = EntityUuid, Path, description = "The administrator to remove from the entity"),
    ),
    responses(
        (status = 204, description = "The administrator was removed from the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn remove_entity_administrator<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, subject_id)): Path<(EntityId, EntityUuid)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .check_entity_permission(
            actor_id,
            EntityPermission::FullAccess,
            entity_id,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if administrator can be removed from entity"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let administrator_id = store_pool
        .acquire(&mut authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .identify_subject_id(subject_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account or account group");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let administrator = match administrator_id {
        WebOwnerSubject::Account { id } => EntityAdministratorSubject::Account { id },
        WebOwnerSubject::AccountGroup { id } => EntityAdministratorSubject::AccountGroup {
            id,
            set: EntitySubjectSet::Member,
        },
    };

    authorization_api
        .modify_entity_relations([(
            ModifyRelationshipOperation::Delete,
            entity_id,
            EntityRelationAndSubject::Administrator {
                subject: administrator,
                level: 0,
            },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove entity administrator");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/entities/{entity_id}/editors/{subject_id}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to add the editor to"),
        ("subject_id" = EntityUuid, Path, description = "The editor to add to the entity"),
    ),
    responses(
        (status = 204, description = "The editor was added to the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn add_entity_editor<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, subject_id)): Path<(EntityId, EntityUuid)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .check_entity_permission(
            actor_id,
            EntityPermission::FullAccess,
            entity_id,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not check if editor can be added to entity");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let editor_id = store_pool
        .acquire(&mut authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .identify_subject_id(subject_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account or account group");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let subject = match editor_id {
        WebOwnerSubject::Account { id } => EntityEditorSubject::Account { id },
        WebOwnerSubject::AccountGroup { id } => EntityEditorSubject::AccountGroup {
            id,
            set: EntitySubjectSet::Member,
        },
    };

    authorization_api
        .modify_entity_relations([(
            ModifyRelationshipOperation::Create,
            entity_id,
            EntityRelationAndSubject::Editor { subject, level: 0 },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not add entity editor");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    delete,
    path = "/entities/{entity_id}/editors/{subject_id}",
    tag = "Entity",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_id" = EntityId, Path, description = "The Entity to remove the editor from"),
        ("subject_id" = EntityUuid, Path, description = "The editor to remove from the entity"),
    ),
    responses(
        (status = 204, description = "The editor was removed from the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn remove_entity_editor<A, S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_id, subject_id)): Path<(EntityId, EntityUuid)>,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
) -> Result<StatusCode, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let has_permission = authorization_api
        .check_entity_permission(
            actor_id,
            EntityPermission::Update,
            entity_id,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(|error| {
            tracing::error!(
                ?error,
                "Could not check if editor can be removed from entity"
            );
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .has_permission;

    if !has_permission {
        return Err(StatusCode::FORBIDDEN);
    }

    let editor_id = store_pool
        .acquire(&mut authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?
        .identify_subject_id(subject_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not identify account or account group");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let subject = match editor_id {
        WebOwnerSubject::Account { id } => EntityEditorSubject::Account { id },
        WebOwnerSubject::AccountGroup { id } => EntityEditorSubject::AccountGroup {
            id,
            set: EntitySubjectSet::Member,
        },
    };

    authorization_api
        .modify_entity_relations([(
            ModifyRelationshipOperation::Delete,
            entity_id,
            EntityRelationAndSubject::Editor { subject, level: 0 },
        )])
        .await
        .map_err(|error| {
            tracing::error!(?error, "Could not remove entity editor");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}
