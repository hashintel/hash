//! Web routes for CRU operations on Entity types.

use alloc::sync::Arc;
use std::collections::{HashSet, hash_map};

use axum::{
    Extension, Router,
    routing::{post, put},
};
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use hash_graph_postgres_store::{
    ontology::patch_id_and_parse,
    store::error::{BaseUrlAlreadyExists, OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
};
use hash_graph_store::{
    account::AccountStore as _,
    entity_type::{
        ArchiveEntityTypeParams, CommonQueryEntityTypesParams, CreateEntityTypeParams,
        EntityTypeQueryToken, EntityTypeResolveDefinitions, EntityTypeStore,
        GetClosedMultiEntityTypesParams, GetClosedMultiEntityTypesResponse,
        HasPermissionForEntityTypesParams, IncludeEntityTypeOption,
        IncludeResolvedEntityTypeOption, QueryEntityTypeSubgraphParams, QueryEntityTypesParams,
        QueryEntityTypesResponse, UnarchiveEntityTypeParams, UpdateEntityTypeEmbeddingParams,
        UpdateEntityTypesParams,
    },
    pool::StorePool,
    query::ConflictBehavior,
};
use hash_graph_type_defs::error::{ErrorInfo, Status, StatusPayloadInfo};
use hash_graph_types::ontology::EntityTypeEmbedding;
use hash_map::HashMap;
use hash_temporal_client::TemporalClient;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::{
    ontology::{
        OntologyTemporalMetadata, OntologyTypeMetadata, OntologyTypeReference,
        entity_type::{EntityType, EntityTypeMetadata, EntityTypeWithMetadata},
        id::{BaseUrl, VersionedUrl},
        json_schema::{DomainValidator, ValidateOntologyType as _},
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
use utoipa::{OpenApi, ToSchema};

use super::status::BoxedResponse;
use crate::rest::{
    AuthenticatedUserHeader, OpenApiQuery, QueryLogger, RestApiStore,
    json::Json,
    status::{report_to_response, status_to_response},
    utoipa_typedef::{ListOrValue, MaybeListOfEntityType, subgraph::Subgraph},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        has_permission_for_entity_types,

        create_entity_type,
        load_external_entity_type,
        query_entity_types,
        query_entity_type_subgraph,
        get_closed_multi_entity_types,
        update_entity_type,
        update_entity_types,
        update_entity_type_embeddings,
        archive_entity_type,
        unarchive_entity_type,
    ),
    components(
        schemas(
            EntityTypeWithMetadata,
            EntityTypeEmbedding,
            HasPermissionForEntityTypesParams,

            CreateEntityTypeRequest,
            LoadExternalEntityTypeRequest,
            UpdateEntityTypeRequest,
            UpdateEntityTypeEmbeddingParams,
            EntityTypeQueryToken,
            QueryEntityTypesParams,
            CommonQueryEntityTypesParams,
            QueryEntityTypesResponse,
            GetClosedMultiEntityTypesParams,
            IncludeEntityTypeOption,
            GetClosedMultiEntityTypesResponse,
            EntityTypeResolveDefinitions,
            QueryEntityTypeSubgraphParams,
            QueryEntityTypeSubgraphResponse,
            ArchiveEntityTypeParams,
            UnarchiveEntityTypeParams,
            IncludeResolvedEntityTypeOption,
        )
    ),
    tags(
        (name = "EntityType", description = "Entity type management API")
    )
)]
pub(crate) struct EntityTypeResource;

impl EntityTypeResource {
    /// Create routes for interacting with entity types.
    pub(crate) fn routes<S>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        for<'pool> S::Store<'pool>: RestApiStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entity-types",
            Router::new()
                .route(
                    "/",
                    post(create_entity_type::<S>).put(update_entity_type::<S>),
                )
                .route("/bulk", put(update_entity_types::<S>))
                .route("/permissions", post(has_permission_for_entity_types::<S>))
                .nest(
                    "/query",
                    Router::new()
                        .route("/", post(query_entity_types::<S>))
                        .route("/multi", post(get_closed_multi_entity_types::<S>))
                        .route("/subgraph", post(query_entity_type_subgraph::<S>)),
                )
                .route("/load", post(load_external_entity_type::<S>))
                .route("/archive", put(archive_entity_type::<S>))
                .route("/unarchive", put(unarchive_entity_type::<S>))
                .route("/embeddings", post(update_entity_type_embeddings::<S>)),
        )
    }
}

#[utoipa::path(
    post,
    path = "/entity-types/permissions",
    tag = "EntityType",
    request_body = HasPermissionForEntityTypesParams,
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, body = Vec<VersionedUrl>, description = "Information if the actor has the permission for the entity types"),

        (status = 500, description = "Internal error occurred"),
    )
)]
async fn has_permission_for_entity_types<S>(
    AuthenticatedUserHeader(actor): AuthenticatedUserHeader,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    store_pool: Extension<Arc<S>>,
    Json(params): Json<HasPermissionForEntityTypesParams<'static>>,
) -> Result<Json<HashSet<VersionedUrl>>, BoxedResponse>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: EntityTypeStore,
{
    store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?
        .has_permission_for_entity_types(AuthenticatedActor::from(actor), params)
        .await
        .map(Json)
        .map_err(report_to_response)
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateEntityTypeRequest {
    #[schema(inline)]
    schema: MaybeListOfEntityType,
    provenance: ProvidedOntologyEditionProvenance,
}

#[utoipa::path(
    post,
    path = "/entity-types",
    request_body = CreateEntityTypeRequest,
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the created entity type", body = MaybeListOfEntityTypeMetadata),
        (status = 400, content_type = "application/json", description = "Provided request body is invalid", body = Status),

        (status = 409, content_type = "application/json", description = "Unable to create entity type in the datastore as the base entity type ID already exists", body = Status),
        (status = 500, content_type = "application/json", description = "Store error occurred", body = Status),
    ),
)]
#[expect(clippy::too_many_lines)]
async fn create_entity_type<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreateEntityTypeRequest>,
    // TODO: We want to be able to return `Status` here we should try and create a general way to
    //       call `status_to_response` for our routes that return Status
) -> Result<Json<ListOrValue<EntityTypeMetadata>>, BoxedResponse>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool>: RestApiStore,
{
    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            status_to_response(Status::new(
                hash_status::StatusCode::Internal,
                Some(
                    "Could not acquire store. This is an internal error, please report to the \
                     developers of the HASH Graph with whatever information you can provide \
                     including request details and logs."
                        .to_owned(),
                ),
                vec![StatusPayloadInfo::Error(ErrorInfo::new(
                    // TODO: add information from the report here
                    //   see https://linear.app/hash/issue/H-3009
                    HashMap::new(),
                    // TODO: We should encapsulate these Reasons within the type system, perhaps
                    //       requiring top level contexts to implement a trait
                    //       `ErrorReason::to_reason` or perhaps as a big enum, or
                    //       as an attachment
                    "STORE_ACQUISITION_FAILURE".to_owned(),
                ))],
            ))
        })?;

    let Json(CreateEntityTypeRequest { schema, provenance }) = body;

    let is_list = matches!(&schema, ListOrValue::List(_));

    let mut web_cache = HashMap::<String, WebId>::new();
    let mut params = Vec::new();
    for schema in schema {
        domain_validator.validate(&schema).map_err(|report| {
            tracing::error!(error=?report, id=%schema.id, "Entity Type ID failed to validate");
            status_to_response(Status::new(
                hash_status::StatusCode::InvalidArgument,
                Some(
                    "Entity Type ID failed to validate against the given domain regex. Are you \
                     sure the service is able to host a type under the domain you supplied?"
                        .to_owned(),
                ),
                vec![StatusPayloadInfo::Error(ErrorInfo::new(
                    HashMap::from([(
                        "entityTypeId".to_owned(),
                        serde_json::to_value(&schema.id)
                            .expect("Could not serialize entity type id"),
                    )]),
                    // TODO: We should encapsulate these Reasons within the type system, perhaps
                    //       requiring top level contexts to implement a trait
                    // `ErrorReason::to_reason`       or perhaps as a big enum
                    "INVALID_TYPE_ID".to_owned(),
                ))],
            ))
        })?;

        let shortname = domain_validator
            .extract_shortname(schema.id.base_url.as_str())
            .map_err(report_to_response)?;

        let web_id = match web_cache.entry(shortname.to_owned()) {
            hash_map::Entry::Occupied(entry) => *entry.get(),
            hash_map::Entry::Vacant(entry) => {
                let web_id = store
                    .get_web_by_shortname(actor_id, shortname)
                    .await
                    .map_err(report_to_response)?
                    .ok_or_else(|| {
                        status_to_response(Status::new(
                            hash_status::StatusCode::NotFound,
                            Some(format!("No web found for shortname `{shortname}`")),
                            vec![],
                        ))
                    })?
                    .id;
                *entry.insert(web_id)
            }
        };

        params.push(CreateEntityTypeParams {
            schema,
            ownership: OntologyOwnership::Local { web_id },
            conflict_behavior: ConflictBehavior::Fail,
            provenance: provenance.clone(),
        });
    }

    let mut metadata = store
        .create_entity_types(actor_id, params)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create entity types");

            if report.contains::<BaseUrlAlreadyExists>() {
                let metadata =
                    report
                        .request_ref::<BaseUrl>()
                        .next()
                        .map_or_else(HashMap::new, |base_url| {
                            let base_url = base_url.to_string();
                            HashMap::from([(
                                "baseUrl".to_owned(),
                                serde_json::to_value(base_url)
                                    .expect("Could not serialize base url"),
                            )])
                        });

                return status_to_response(Status::new(
                    hash_status::StatusCode::AlreadyExists,
                    Some(
                        "Could not create entity type as the base URI already existed, perhaps \
                         you intended to call `updateEntityType` instead?"
                            .to_owned(),
                    ),
                    vec![StatusPayloadInfo::Error(ErrorInfo::new(
                        metadata,
                        // TODO: We should encapsulate these Reasons within the type system,
                        //       perhaps requiring top level contexts to implement a trait
                        //       `ErrorReason::to_reason` or perhaps as a big enum, or as an
                        // attachment
                        "BASE_URI_ALREADY_EXISTS".to_owned(),
                    ))],
                ));
            }

            // Insertion/update errors are considered internal server errors.
            status_to_response(Status::new(
                hash_status::StatusCode::Internal,
                Some(
                    "Internal error, please report to the developers of the HASH Graph with \
                     whatever information you can provide including request details and logs."
                        .to_owned(),
                ),
                vec![StatusPayloadInfo::Error(ErrorInfo::new(
                    HashMap::new(),
                    // TODO: We should encapsulate these Reasons within the type system, perhaps
                    //       requiring top level contexts to implement a trait
                    //       `ErrorReason::to_reason` or perhaps as a big enum, or as an attachment
                    "INTERNAL".to_owned(),
                ))],
            ))
        })?;

    if is_list {
        Ok(Json(ListOrValue::List(metadata)))
    } else {
        Ok(Json(ListOrValue::Value(
            metadata.pop().expect("metadata does not contain a value"),
        )))
    }
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, untagged)]
enum LoadExternalEntityTypeRequest {
    #[serde(rename_all = "camelCase")]
    Fetch { entity_type_id: VersionedUrl },
    #[serde(rename_all = "camelCase")]
    Create {
        schema: Box<EntityType>,
        provenance: Box<ProvidedOntologyEditionProvenance>,
    },
}

#[utoipa::path(
    post,
    path = "/entity-types/load",
    request_body = LoadExternalEntityTypeRequest,
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the created entity type", body = EntityTypeMetadata),
        (status = 400, content_type = "application/json", description = "Provided request body is invalid", body = Status),

        (status = 409, content_type = "application/json", description = "Unable to load entity type in the datastore as the entity type ID already exists", body = Status),
        (status = 500, content_type = "application/json", description = "Store error occurred", body = Status),
    ),
)]
async fn load_external_entity_type<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    Json(request): Json<LoadExternalEntityTypeRequest>,
    // TODO: We want to be able to return `Status` here we should try and create a general way to
    //       call `status_to_response` for our routes that return Status
) -> Result<Json<EntityTypeMetadata>, BoxedResponse>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool>: RestApiStore,
{
    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            status_to_response(Status::new(
                hash_status::StatusCode::Internal,
                Some(
                    "Could not acquire store. This is an internal error, please report to the \
                     developers of the HASH Graph with whatever information you can provide \
                     including request details and logs."
                        .to_owned(),
                ),
                vec![StatusPayloadInfo::Error(ErrorInfo::new(
                    // TODO: add information from the report here
                    //   see https://linear.app/hash/issue/H-3009
                    HashMap::new(),
                    // TODO: We should encapsulate these Reasons within the type system, perhaps
                    //       requiring top level contexts to implement a trait
                    //       `ErrorReason::to_reason` or perhaps as a big enum,
                    //       or as an attachment
                    "STORE_ACQUISITION_FAILURE".to_owned(),
                ))],
            ))
        })?;

    match request {
        LoadExternalEntityTypeRequest::Fetch { entity_type_id } => {
            let OntologyTypeMetadata::EntityType(metadata) = store
                .load_external_type(
                    actor_id,
                    &domain_validator,
                    OntologyTypeReference::EntityTypeReference((&entity_type_id).into()),
                )
                .await?
            else {
                // TODO: Make the type fetcher typed
                panic!("`load_external_type` should have returned a `EntityTypeMetadata`");
            };
            Ok(Json(metadata))
        }
        LoadExternalEntityTypeRequest::Create { schema, provenance } => {
            if domain_validator.validate_url(schema.id.base_url.as_str()) {
                let error = "Ontology type is not external".to_owned();
                tracing::error!(id=%schema.id, error);
                return Err(status_to_response(Status::new(
                    hash_status::StatusCode::InvalidArgument,
                    Some(error),
                    vec![],
                )));
            }

            Ok(Json(
                store
                    .create_entity_type(
                        actor_id,
                        CreateEntityTypeParams {
                            schema: *schema,
                            ownership: OntologyOwnership::Remote {
                                fetched_at: OffsetDateTime::now_utc(),
                            },
                            conflict_behavior: ConflictBehavior::Fail,
                            provenance: *provenance,
                        },
                    )
                    .await
                    .map_err(report_to_response)?,
            ))
        }
    }
}

#[utoipa::path(
    post,
    path = "/entity-types/query",
    request_body = QueryEntityTypesParams,
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = QueryEntityTypesResponse,
            description = "Gets a a list of entity types that satisfy the given query.",
        ),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn query_entity_types<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<QueryEntityTypesResponse>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntityTypes(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let response = store
        .query_entity_types(
            actor_id,
            // Manually deserialize the query from a JSON value to allow borrowed deserialization
            // and better error reporting.
            QueryEntityTypesParams::deserialize(&request)
                .map_err(Report::from)
                .map_err(report_to_response)?,
        )
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
    path = "/entity-types/query/multi",
    request_body = GetClosedMultiEntityTypesParams,
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetClosedMultiEntityTypesResponse,
            description = "Gets a list of multi-entity types that satisfy the given query. A multi-entity type is the combination of multiple entity types.",
        ),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_closed_multi_entity_types<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetClosedMultiEntityTypesResponse>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetClosedMultiEntityTypes(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    // Manually deserialize the query from a JSON value to allow borrowed deserialization
    // and better error reporting.
    let params = GetClosedMultiEntityTypesParams::deserialize(&request)
        .map_err(Report::from)
        .map_err(report_to_response)?;

    let response = store
        .get_closed_multi_entity_types(
            actor_id,
            params.entity_type_ids,
            params.temporal_axes,
            params.include_resolved,
        )
        .await
        .map_err(report_to_response)
        .map(Json);
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct QueryEntityTypeSubgraphResponse {
    subgraph: Subgraph,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    cursor: Option<VersionedUrl>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    web_ids: Option<HashMap<WebId, usize>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    edition_created_by_ids: Option<HashMap<ActorEntityUuid, usize>>,
}

#[utoipa::path(
    post,
    path = "/entity-types/query/subgraph",
    request_body = QueryEntityTypeSubgraphParams,
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = QueryEntityTypeSubgraphResponse,
            description = "A subgraph rooted at entity types that satisfy the given query, each resolved to the requested depth.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn query_entity_type_subgraph<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<QueryEntityTypeSubgraphResponse>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetEntityTypeSubgraph(&request));
    }

    let store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let params = QueryEntityTypeSubgraphParams::deserialize(&request)
        .map_err(Report::from)
        .map_err(report_to_response)?;
    params
        .validate()
        .map_err(Report::new)
        .map_err(report_to_response)?;

    let response = store
        .query_entity_type_subgraph(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(|response| {
            Json(QueryEntityTypeSubgraphResponse {
                subgraph: Subgraph::from(response.subgraph),
                cursor: response.cursor,
                count: response.count,
                web_ids: response.web_ids,
                edition_created_by_ids: response.edition_created_by_ids,
            })
        });
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateEntityTypeRequest {
    #[schema(value_type = UpdateEntityType)]
    schema: serde_json::Value,
    type_to_update: VersionedUrl,
    provenance: ProvidedOntologyEditionProvenance,
}

#[utoipa::path(
    put,
    path = "/entity-types",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity type", body = EntityTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base entity type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityTypeRequest,
)]
async fn update_entity_type<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    body: Json<UpdateEntityTypeRequest>,
) -> Result<Json<EntityTypeMetadata>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    let Json(UpdateEntityTypeRequest {
        schema,
        mut type_to_update,
        provenance,
    }) = body;

    type_to_update.version.major += 1;

    let entity_type = patch_id_and_parse(&type_to_update, schema).map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .update_entity_type(
            actor_id,
            UpdateEntityTypesParams {
                schema: entity_type,
                provenance,
            },
        )
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    put,
    path = "/entity-types/bulk",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity types", body = [EntityTypeMetadata]),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base entity types ID were not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = [UpdateEntityTypeRequest],
)]
async fn update_entity_types<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    bodies: Json<Vec<UpdateEntityTypeRequest>>,
) -> Result<Json<Vec<EntityTypeMetadata>>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let params = bodies
        .0
        .into_iter()
        .map(
            |UpdateEntityTypeRequest {
                 schema,
                 mut type_to_update,
                 provenance,
             }| {
                type_to_update.version.major += 1;

                Ok(UpdateEntityTypesParams {
                    schema: patch_id_and_parse(&type_to_update, schema)
                        .map_err(report_to_response)?,
                    provenance,
                })
            },
        )
        .collect::<Result<Vec<_>, BoxedResponse>>()?;
    store
        .update_entity_types(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entity-types/embeddings",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The embeddings were created"),

        (status = 403, description = "Insufficient permissions to update the entity type"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityTypeEmbeddingParams,
)]
async fn update_entity_type_embeddings<S>(
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
    let params = UpdateEntityTypeEmbeddingParams::deserialize(body)
        .attach_opaque(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .update_entity_type_embeddings(actor_id, params)
        .await
        .map_err(report_to_response)
}

#[utoipa::path(
    put,
    path = "/entity-types/archive",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity type ID was not found"),
        (status = 409, description = "Entity type ID is already archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = ArchiveEntityTypeParams,
)]
async fn archive_entity_type<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<OntologyTemporalMetadata>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = ArchiveEntityTypeParams::deserialize(body)
        .attach_opaque(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .archive_entity_type(actor_id, params)
        .await
        .map_err(|mut report| {
            if report.contains::<OntologyVersionDoesNotExist>() {
                report = report.attach_opaque(hash_status::StatusCode::NotFound);
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                report = report.attach_opaque(hash_status::StatusCode::AlreadyExists);
            }
            report_to_response(report)
        })
        .map(Json)
}

#[utoipa::path(
    put,
    path = "/entity-types/unarchive",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The temporal metadata of the updated entity type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity type ID was not found"),
        (status = 409, description = "Entity type ID already exists and is not archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UnarchiveEntityTypeParams,
)]
async fn unarchive_entity_type<S>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<OntologyTemporalMetadata>, BoxedResponse>
where
    S: StorePool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = UnarchiveEntityTypeParams::deserialize(body)
        .attach_opaque(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .unarchive_entity_type(actor_id, params)
        .await
        .map_err(|mut report| {
            if report.contains::<OntologyVersionDoesNotExist>() {
                report = report.attach_opaque(hash_status::StatusCode::NotFound);
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                report = report.attach_opaque(hash_status::StatusCode::AlreadyExists);
            }
            report_to_response(report)
        })
        .map(Json)
}
