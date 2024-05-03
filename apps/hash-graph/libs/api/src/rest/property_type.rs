//! Web routes for CRU operations on Property types.

#![expect(clippy::str_to_string)]

use std::sync::Arc;

use authorization::{
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    schema::{
        PropertyTypeEditorSubject, PropertyTypeOwnerSubject, PropertyTypePermission,
        PropertyTypeRelationAndSubject, PropertyTypeSetting, PropertyTypeSettingSubject,
        PropertyTypeViewerSubject,
    },
    zanzibar::Consistency,
    AuthorizationApi, AuthorizationApiPool,
};
use axum::{
    extract::{OriginalUri, Path, Query},
    http::{header::LINK, HeaderMap, StatusCode},
    response::Response,
    routing::{get, post, put},
    Extension, Router,
};
use error_stack::{Report, ResultExt};
use graph::{
    ontology::{
        domain_validator::{DomainValidator, ValidateOntologyType},
        patch_id_and_parse, PropertyTypeQueryToken,
    },
    store::{
        error::VersionedUrlAlreadyExists,
        ontology::{
            ArchivePropertyTypeParams, CreatePropertyTypeParams, GetPropertyTypeSubgraphParams,
            GetPropertyTypesParams, GetPropertyTypesResponse, UnarchivePropertyTypeParams,
            UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
        },
        query::Filter,
        BaseUrlAlreadyExists, ConflictBehavior, OntologyVersionDoesNotExist, PropertyTypeStore,
        StorePool,
    },
    subgraph::{
        edges::GraphResolveDepths, identifier::PropertyTypeVertexId,
        temporal_axes::QueryTemporalAxesUnresolved,
    },
};
use graph_types::{
    ontology::{
        OntologyTemporalMetadata, OntologyTypeClassificationMetadata, OntologyTypeMetadata,
        OntologyTypeReference, PropertyTypeEmbedding, PropertyTypeId, PropertyTypeMetadata,
        PropertyTypeWithMetadata, ProvidedOntologyEditionProvenance,
    },
    owned_by_id::OwnedById,
};
use hash_status::Status;
use serde::{Deserialize, Serialize};
use temporal_client::TemporalClient;
use time::OffsetDateTime;
use type_system::{
    url::{OntologyTypeVersion, VersionedUrl},
    PropertyType,
};
use utoipa::{OpenApi, ToSchema};

use super::api_resource::RoutedResource;
use crate::rest::{
    json::Json,
    status::{report_to_response, status_to_response},
    utoipa_typedef::{subgraph::Subgraph, ListOrValue, MaybeListOfPropertyType},
    AuthenticatedUserHeader, Cursor, Pagination, PermissionResponse, RestApiStore,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        get_property_type_authorization_relationships,
        modify_property_type_authorization_relationships,
        check_property_type_permission,

        create_property_type,
        load_external_property_type,
        get_property_types,
        get_property_type_subgraph,
        update_property_type,
        update_property_type_embeddings,
        archive_property_type,
        unarchive_property_type,
    ),
    components(
        schemas(
            PropertyTypeWithMetadata,
            PropertyTypeSetting,

            PropertyTypeSettingSubject,
            PropertyTypeOwnerSubject,
            PropertyTypeEditorSubject,
            PropertyTypeViewerSubject,
            PropertyTypePermission,
            PropertyTypeRelationAndSubject,
            ModifyPropertyTypeAuthorizationRelationship,
            PropertyTypeEmbedding,

            CreatePropertyTypeRequest,
            LoadExternalPropertyTypeRequest,
            UpdatePropertyTypeRequest,
            UpdatePropertyTypeEmbeddingParams,
            PropertyTypeQueryToken,
            GetPropertyTypesRequest,
            GetPropertyTypesResponse,
            GetPropertyTypeSubgraphRequest,
            GetPropertyTypeSubgraphResponse,
            ArchivePropertyTypeParams,
            UnarchivePropertyTypeParams,
        )
    ),
    tags(
        (name = "PropertyType", description = "Property type management API")
    )
)]
pub(crate) struct PropertyTypeResource;

impl RoutedResource for PropertyTypeResource {
    /// Create routes for interacting with property types.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'pool> S::Store<'pool, A::Api<'pool>>: RestApiStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/property-types",
            Router::new()
                .route(
                    "/",
                    post(create_property_type::<S, A>).put(update_property_type::<S, A>),
                )
                .route(
                    "/relationships",
                    post(modify_property_type_authorization_relationships::<A>),
                )
                .nest(
                    "/:property_type_id",
                    Router::new()
                        .route(
                            "/relationships",
                            get(get_property_type_authorization_relationships::<A>),
                        )
                        .route(
                            "/permissions/:permission",
                            get(check_property_type_permission::<A>),
                        ),
                )
                .nest(
                    "/query",
                    Router::new()
                        .route("/", post(get_property_types::<S, A>))
                        .route("/subgraph", post(get_property_type_subgraph::<S, A>)),
                )
                .route("/load", post(load_external_property_type::<S, A>))
                .route("/archive", put(archive_property_type::<S, A>))
                .route("/unarchive", put(unarchive_property_type::<S, A>))
                .route("/embeddings", post(update_property_type_embeddings::<S, A>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreatePropertyTypeRequest {
    #[schema(inline)]
    schema: MaybeListOfPropertyType,
    owned_by_id: OwnedById,
    relationships: Vec<PropertyTypeRelationAndSubject>,
    #[serde(
        default,
        skip_serializing_if = "ProvidedOntologyEditionProvenance::is_empty"
    )]
    provenance: ProvidedOntologyEditionProvenance,
}

#[utoipa::path(
    post,
    path = "/property-types",
    request_body = CreatePropertyTypeRequest,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the created property type", body = MaybeListOfPropertyTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create property type in the store as the base property type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, domain_validator)
)]
async fn create_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreatePropertyTypeRequest>,
) -> Result<Json<ListOrValue<PropertyTypeMetadata>>, StatusCode>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool, A::Api<'pool>>: RestApiStore,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let Json(CreatePropertyTypeRequest {
        schema,
        owned_by_id,
        relationships,
        provenance,
    }) = body;

    let is_list = matches!(&schema, ListOrValue::List(_));

    let mut metadata = store
        .create_property_types(
            actor_id,
            schema.into_iter().map(|schema| {
                domain_validator.validate(&schema).map_err(|report| {
                    tracing::error!(error=?report, id=schema.id().to_string(), "Property Type ID failed to validate");
                    StatusCode::UNPROCESSABLE_ENTITY
                })?;

                Ok(CreatePropertyTypeParams {
                    schema,
                    classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
                    relationships: relationships.clone(),
                    conflict_behavior: ConflictBehavior::Fail,
                    provenance: provenance.clone()
                })
            }).collect::<Result<Vec<_>, StatusCode>>()?
        )
        .await
        .map_err(|report| {
            // TODO: consider adding the data type, or at least its URL in the trace
            tracing::error!(error=?report, "Could not create data types");

            if report.contains::<PermissionAssertion>() {
                return StatusCode::FORBIDDEN;
            }
            if report.contains::<BaseUrlAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if is_list {
        Ok(Json(ListOrValue::List(metadata)))
    } else {
        Ok(Json(ListOrValue::Value(
            metadata.pop().expect("metadata does not contain a value"),
        )))
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
enum LoadExternalPropertyTypeRequest {
    #[serde(rename_all = "camelCase")]
    Fetch { property_type_id: VersionedUrl },
    Create {
        #[schema(value_type = VAR_PROPERTY_TYPE)]
        schema: PropertyType,
        relationships: Vec<PropertyTypeRelationAndSubject>,
        #[serde(
            default,
            skip_serializing_if = "ProvidedOntologyEditionProvenance::is_empty"
        )]
        provenance: ProvidedOntologyEditionProvenance,
    },
}

#[utoipa::path(
    post,
    path = "/property-types/load",
    request_body = LoadExternalPropertyTypeRequest,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the loaded property type", body = PropertyTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to load property type in the store as the base property type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, domain_validator)
)]
async fn load_external_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    Json(request): Json<LoadExternalPropertyTypeRequest>,
) -> Result<Json<PropertyTypeMetadata>, Response>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool, A::Api<'pool>>: RestApiStore,
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

    match request {
        LoadExternalPropertyTypeRequest::Fetch { property_type_id } => {
            let OntologyTypeMetadata::PropertyType(metadata) = store
                .load_external_type(
                    actor_id,
                    &domain_validator,
                    OntologyTypeReference::PropertyTypeReference((&property_type_id).into()),
                )
                .await?
            else {
                // TODO: Make the type fetcher typed
                panic!("`load_external_type` should have returned a `PropertyTypeMetadata`");
            };
            Ok(Json(metadata))
        }
        LoadExternalPropertyTypeRequest::Create {
            schema,
            relationships,
            provenance,
        } => {
            if domain_validator.validate_url(schema.id().base_url.as_str()) {
                let error = "Ontology type is not external".to_owned();
                tracing::error!(id=%schema.id(), error);
                return Err(status_to_response(Status::<()>::new(
                    hash_status::StatusCode::InvalidArgument,
                    Some(error),
                    vec![],
                )));
            }

            Ok(Json(
                store
                    .create_property_type(
                        actor_id,
                        CreatePropertyTypeParams {
                            schema,
                            classification: OntologyTypeClassificationMetadata::External {
                                fetched_at: OffsetDateTime::now_utc(),
                            },
                            relationships,
                            conflict_behavior: ConflictBehavior::Fail,
                            provenance,
                        },
                    )
                    .await
                    .map_err(report_to_response)?,
            ))
        }
    }
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetPropertyTypesRequest<'q> {
    #[serde(borrow)]
    filter: Filter<'q, PropertyTypeWithMetadata>,
    temporal_axes: QueryTemporalAxesUnresolved,
    include_drafts: bool,
}

#[utoipa::path(
    post,
    path = "/property-types/query",
    request_body = GetPropertyTypesRequest,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetPropertyTypesResponse,
            description = "Gets a a list of property types that satisfy the given query.",
            headers(
                ("Link" = String, description = "The link to be used to query the next page of property types"),
            ),
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool, request))]
async fn get_property_types<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Query(pagination): Query<Pagination<PropertyTypeVertexId>>,
    OriginalUri(uri): OriginalUri,
    Json(request): Json<serde_json::Value>,
) -> Result<(HeaderMap, Json<GetPropertyTypesResponse>), Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    // Manually deserialize the query from a JSON value to allow borrowed deserialization and better
    // error reporting.
    let mut request = GetPropertyTypesRequest::deserialize(&request).map_err(report_to_response)?;
    request
        .filter
        .convert_parameters()
        .map_err(report_to_response)?;
    let response = store
        .get_property_types(
            actor_id,
            GetPropertyTypesParams {
                filter: request.filter,
                after: pagination.after.map(|cursor| cursor.0),
                limit: pagination.limit,
                temporal_axes: request.temporal_axes,
                include_drafts: request.include_drafts,
            },
        )
        .await
        .map_err(report_to_response)?;

    let cursor = response.property_types.last().map(Cursor);
    let mut headers = HeaderMap::new();
    if let (Some(cursor), Some(limit)) = (cursor, pagination.limit) {
        headers.insert(LINK, cursor.link_header("next", uri, limit)?);
    }
    Ok((headers, Json(response)))
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetPropertyTypeSubgraphRequest<'q> {
    #[serde(borrow)]
    filter: Filter<'q, PropertyTypeWithMetadata>,
    graph_resolve_depths: GraphResolveDepths,
    temporal_axes: QueryTemporalAxesUnresolved,
    include_drafts: bool,
}

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct GetPropertyTypeSubgraphResponse {
    subgraph: Subgraph,
}

#[utoipa::path(
    post,
    path = "/property-types/query/subgraph",
    request_body = GetPropertyTypeSubgraphRequest,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetPropertyTypeSubgraphResponse,
            description = "A subgraph rooted at property types that satisfy the given query, each resolved to the requested depth.",
            headers(
                ("Link" = String, description = "The link to be used to query the next page of property types"),
            ),

        ),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool, request))]
async fn get_property_type_subgraph<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Query(pagination): Query<Pagination<PropertyTypeVertexId>>,
    OriginalUri(uri): OriginalUri,
    Json(request): Json<serde_json::Value>,
) -> Result<(HeaderMap, Json<GetPropertyTypeSubgraphResponse>), Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    let mut request =
        GetPropertyTypeSubgraphRequest::deserialize(&request).map_err(report_to_response)?;
    request
        .filter
        .convert_parameters()
        .map_err(report_to_response)?;
    let response = store
        .get_property_type_subgraph(
            actor_id,
            GetPropertyTypeSubgraphParams {
                filter: request.filter,
                graph_resolve_depths: request.graph_resolve_depths,
                temporal_axes: request.temporal_axes,
                after: pagination.after.map(|cursor| cursor.0),
                limit: pagination.limit,
                include_drafts: request.include_drafts,
            },
        )
        .await
        .map_err(report_to_response)?;

    let cursor = response.subgraph.roots.iter().last().map(Cursor);
    let mut headers = HeaderMap::new();
    if let (Some(cursor), Some(limit)) = (cursor, pagination.limit) {
        headers.insert(LINK, cursor.link_header("next", uri, limit)?);
    }
    Ok((
        headers,
        Json(GetPropertyTypeSubgraphResponse {
            subgraph: Subgraph::from(response.subgraph),
        }),
    ))
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdatePropertyTypeRequest {
    #[schema(value_type = VAR_UPDATE_PROPERTY_TYPE)]
    schema: serde_json::Value,
    type_to_update: VersionedUrl,
    relationships: Vec<PropertyTypeRelationAndSubject>,
    #[serde(
        default,
        skip_serializing_if = "ProvidedOntologyEditionProvenance::is_empty"
    )]
    provenance: ProvidedOntologyEditionProvenance,
}

#[utoipa::path(
    put,
    path = "/property-types",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("after" = Option<String>, Query, description = "The cursor to start reading from"),
        ("limit" = Option<usize>, Query, description = "The maximum number of property types to read"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated property type", body = PropertyTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    body: Json<UpdatePropertyTypeRequest>,
) -> Result<Json<PropertyTypeMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UpdatePropertyTypeRequest {
        schema,
        mut type_to_update,
        relationships,
        provenance,
    }) = body;

    type_to_update.version = OntologyTypeVersion::new(type_to_update.version.inner() + 1);

    let property_type = patch_id_and_parse(&type_to_update, schema).map_err(|report| {
        tracing::error!(error=?report, "Couldn't patch schema and convert to Property Type");
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    let authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not acquire store");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    store
        .update_property_type(
            actor_id,
            UpdatePropertyTypesParams {
                schema: property_type,
                relationships,
                provenance,
            },
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update property type");

            if report.contains::<PermissionAssertion>() {
                return StatusCode::FORBIDDEN;
            }
            if report.contains::<OntologyVersionDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/property-types/embeddings",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The embeddings were created"),

        (status = 403, description = "Insufficient permissions to update the property type"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeEmbeddingParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_property_type_embeddings<S, A>(
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
    let params = UpdatePropertyTypeEmbeddingParams::deserialize(body)
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
        .update_property_type_embeddings(actor_id, params)
        .await
        .map_err(report_to_response)
}

#[utoipa::path(
    put,
    path = "/property-types/archive",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated property type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Property type ID was not found"),
        (status = 409, description = "Property type ID is already archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = ArchivePropertyTypeParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn archive_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<OntologyTemporalMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = ArchivePropertyTypeParams::deserialize(body)
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
        .archive_property_type(actor_id, params)
        .await
        .map_err(|mut report| {
            if report.contains::<OntologyVersionDoesNotExist>() {
                report = report.attach(hash_status::StatusCode::NotFound);
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                report = report.attach(hash_status::StatusCode::AlreadyExists);
            }
            report_to_response(report)
        })
        .map(Json)
}

#[utoipa::path(
    put,
    path = "/property-types/unarchive",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The temporal metadata of the updated property type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Property type ID was not found"),
        (status = 409, description = "Property type ID already exists and is not archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UnarchivePropertyTypeParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn unarchive_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<OntologyTemporalMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = UnarchivePropertyTypeParams::deserialize(body)
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
        .unarchive_property_type(actor_id, params)
        .await
        .map_err(|mut report| {
            if report.contains::<OntologyVersionDoesNotExist>() {
                report = report.attach(hash_status::StatusCode::NotFound);
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                report = report.attach(hash_status::StatusCode::AlreadyExists);
            }
            report_to_response(report)
        })
        .map(Json)
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ModifyPropertyTypeAuthorizationRelationship {
    operation: ModifyRelationshipOperation,
    resource: VersionedUrl,
    relation_and_subject: PropertyTypeRelationAndSubject,
}

#[utoipa::path(
    post,
    path = "/property-types/relationships",
    tag = "PropertyType",
    request_body = [ModifyPropertyTypeAuthorizationRelationship],
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, description = "The relationship was modified for the property"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn modify_property_type_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    relationships: Json<Vec<ModifyPropertyTypeAuthorizationRelationship>>,
) -> Result<StatusCode, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let (property_types, operations): (Vec<_>, Vec<_>) = relationships
        .0
        .into_iter()
        .map(|request| {
            let resource = PropertyTypeId::from_url(&request.resource);
            (
                resource,
                (request.operation, resource, request.relation_and_subject),
            )
        })
        .unzip();

    let (permissions, _zookie) = authorization_api
        .check_property_types_permission(
            actor_id,
            PropertyTypePermission::Update,
            property_types,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(report_to_response)?;

    let mut failed = false;
    // TODO: Change interface for `check_property_types_permission` to avoid this loop
    for (_property_type_id, has_permission) in permissions {
        if !has_permission {
            tracing::error!("Insufficient permissions to modify relationship for property type");
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
        .modify_property_type_relations(operations)
        .await
        .map_err(report_to_response)?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/property-types/{property_type_id}/relationships",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("property_type_id" = VersionedUrl, Path, description = "The Property type to read the relations for"),
    ),
    responses(
        (status = 200, description = "The relations of the property type", body = [PropertyTypeRelationAndSubject]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_property_type_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(property_type_id): Path<VersionedUrl>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<Vec<PropertyTypeRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    Ok(Json(
        authorization_api
            .get_property_type_relations(
                PropertyTypeId::from_url(&property_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?,
    ))
}

#[utoipa::path(
    get,
    path = "/property-types/{property_type_id}/permissions/{permission}",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("property_type_id" = VersionedUrl, Path, description = "The property type ID to check if the actor has the permission"),
        ("permission" = PropertyTypePermission, Path, description = "The permission to check for"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor has the permission for the property type"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn check_property_type_permission<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((property_type_id, permission)): Path<(VersionedUrl, PropertyTypePermission)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(report_to_response)?
            .check_property_type_permission(
                actor_id,
                permission,
                PropertyTypeId::from_url(&property_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?
            .has_permission,
    }))
}
