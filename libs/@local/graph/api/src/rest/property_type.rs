//! Web routes for CRU operations on Property types.

use alloc::sync::Arc;

use axum::{
    Extension, Router,
    extract::Path,
    http::StatusCode,
    response::Response,
    routing::{get, post, put},
};
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{
    AuthorizationApi as _, AuthorizationApiPool,
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    schema::{
        PropertyTypeEditorSubject, PropertyTypeOwnerSubject, PropertyTypePermission,
        PropertyTypeRelationAndSubject, PropertyTypeSetting, PropertyTypeSettingSubject,
        PropertyTypeViewerSubject,
    },
    zanzibar::Consistency,
};
use hash_graph_postgres_store::{
    ontology::patch_id_and_parse,
    store::error::{OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
};
use hash_graph_store::{
    pool::StorePool,
    property_type::{
        ArchivePropertyTypeParams, CreatePropertyTypeParams, GetPropertyTypeSubgraphParams,
        GetPropertyTypesParams, GetPropertyTypesResponse, PropertyTypeQueryToken,
        PropertyTypeStore as _, UnarchivePropertyTypeParams, UpdatePropertyTypeEmbeddingParams,
        UpdatePropertyTypesParams,
    },
    query::ConflictBehavior,
};
use hash_graph_types::ontology::PropertyTypeEmbedding;
use hash_status::Status;
use hash_temporal_client::TemporalClient;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::{
    ontology::{
        OntologyTemporalMetadata, OntologyTypeMetadata, OntologyTypeReference,
        PropertyTypeWithMetadata,
        id::{OntologyTypeVersion, VersionedUrl},
        json_schema::{DomainValidator, ValidateOntologyType as _},
        property_type::{
            PropertyType, PropertyTypeMetadata, PropertyTypeUuid, schema::PropertyValueType,
        },
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::actor_group::WebId,
};
use utoipa::{OpenApi, ToSchema};

use crate::rest::{
    AuthenticatedUserHeader, OpenApiQuery, PermissionResponse, QueryLogger, RestApiStore,
    json::Json,
    status::{report_to_response, status_to_response},
    utoipa_typedef::{ListOrValue, MaybeListOfPropertyType, subgraph::Subgraph},
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
        update_property_types,
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
            PropertyValueType,

            CreatePropertyTypeRequest,
            LoadExternalPropertyTypeRequest,
            UpdatePropertyTypeRequest,
            UpdatePropertyTypeEmbeddingParams,
            PropertyTypeQueryToken,
            GetPropertyTypesParams,
            GetPropertyTypesResponse,
            GetPropertyTypeSubgraphParams,
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

impl PropertyTypeResource {
    /// Create routes for interacting with property types.
    pub(crate) fn routes<S, A>() -> Router
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
                .route("/bulk", put(update_property_types::<S, A>))
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
    web_id: WebId,
    relationships: Vec<PropertyTypeRelationAndSubject>,
    provenance: ProvidedOntologyEditionProvenance,
}

#[utoipa::path(
    post,
    path = "/property-types",
    request_body = CreatePropertyTypeRequest,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
    skip(store_pool, authorization_api_pool, domain_validator, temporal_client)
)]
async fn create_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreatePropertyTypeRequest>,
) -> Result<Json<ListOrValue<PropertyTypeMetadata>>, Response>
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

    let Json(CreatePropertyTypeRequest {
        schema,
        web_id,
        relationships,
        provenance,
    }) = body;

    let is_list = matches!(&schema, ListOrValue::List(_));

    let mut metadata = store
        .create_property_types(
            actor_id,
            schema
                .into_iter()
                .map(|schema| {
                    domain_validator
                        .validate(&schema)
                        .map_err(report_to_response)?;

                    Ok(CreatePropertyTypeParams {
                        schema,
                        ownership: OntologyOwnership::Local { web_id },
                        relationships: relationships.clone(),
                        conflict_behavior: ConflictBehavior::Fail,
                        provenance: provenance.clone(),
                    })
                })
                .collect::<Result<Vec<_>, Response>>()?,
        )
        .await
        .map_err(report_to_response)?;

    if is_list {
        Ok(Json(ListOrValue::List(metadata)))
    } else {
        Ok(Json(ListOrValue::Value(
            metadata.pop().expect("metadata does not contain a value"),
        )))
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, untagged)]
enum LoadExternalPropertyTypeRequest {
    #[serde(rename_all = "camelCase")]
    Fetch { property_type_id: VersionedUrl },
    #[serde(rename_all = "camelCase")]
    Create {
        schema: PropertyType,
        relationships: Vec<PropertyTypeRelationAndSubject>,
        provenance: Box<ProvidedOntologyEditionProvenance>,
    },
}

#[utoipa::path(
    post,
    path = "/property-types/load",
    request_body = LoadExternalPropertyTypeRequest,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
    skip(store_pool, authorization_api_pool, domain_validator, temporal_client)
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
            if domain_validator.validate_url(schema.id.base_url.as_str()) {
                let error = "Ontology type is not external".to_owned();
                tracing::error!(id=%schema.id, error);
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
                            ownership: OntologyOwnership::Remote {
                                fetched_at: OffsetDateTime::now_utc(),
                            },
                            relationships,
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
    path = "/property-types/query",
    request_body = GetPropertyTypesParams,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetPropertyTypesResponse,
            description = "Gets a a list of property types that satisfy the given query.",
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn get_property_types<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetPropertyTypesResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetPropertyTypes(&request));
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
        .get_property_types(
            actor_id,
            // Manually deserialize the query from a JSON value to allow borrowed deserialization
            // and better error reporting.
            GetPropertyTypesParams::deserialize(&request)
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

#[derive(Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct GetPropertyTypeSubgraphResponse {
    subgraph: Subgraph,
    cursor: Option<VersionedUrl>,
}

#[utoipa::path(
    post,
    path = "/property-types/query/subgraph",
    request_body = GetPropertyTypeSubgraphParams,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn get_property_type_subgraph<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetPropertyTypeSubgraphResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetPropertyTypeSubgraph(&request));
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
        .get_property_type_subgraph(
            actor_id,
            GetPropertyTypeSubgraphParams::deserialize(&request)
                .map_err(Report::from)
                .map_err(report_to_response)?,
        )
        .await
        .map_err(report_to_response)
        .map(|response| {
            Json(GetPropertyTypeSubgraphResponse {
                subgraph: Subgraph::from(response.subgraph),
                cursor: response.cursor,
            })
        });
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdatePropertyTypeRequest {
    #[schema(value_type = UpdatePropertyType)]
    schema: serde_json::Value,
    type_to_update: VersionedUrl,
    relationships: Vec<PropertyTypeRelationAndSubject>,
    provenance: ProvidedOntologyEditionProvenance,
}

#[utoipa::path(
    put,
    path = "/property-types",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated property type", body = PropertyTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeRequest,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn update_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    body: Json<UpdatePropertyTypeRequest>,
) -> Result<Json<PropertyTypeMetadata>, Response>
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

    let property_type = patch_id_and_parse(&type_to_update, schema).map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

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
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    put,
    path = "/property-types/bulk",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated property types", body = [PropertyTypeMetadata]),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property types ID were not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = [UpdatePropertyTypeRequest],
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn update_property_types<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    bodies: Json<Vec<UpdatePropertyTypeRequest>>,
) -> Result<Json<Vec<PropertyTypeMetadata>>, Response>
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

    let params = bodies
        .0
        .into_iter()
        .map(
            |UpdatePropertyTypeRequest {
                 schema,
                 mut type_to_update,
                 relationships,
                 provenance,
             }| {
                type_to_update.version =
                    OntologyTypeVersion::new(type_to_update.version.inner() + 1);

                Ok(UpdatePropertyTypesParams {
                    schema: patch_id_and_parse(&type_to_update, schema)
                        .map_err(report_to_response)?,
                    relationships,
                    provenance,
                })
            },
        )
        .collect::<Result<Vec<_>, Response>>()?;
    store
        .update_property_types(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/property-types/embeddings",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The embeddings were created"),

        (status = 403, description = "Insufficient permissions to update the property type"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeEmbeddingParams,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, body)
)]
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
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
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
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
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
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
            let resource = PropertyTypeUuid::from_url(&request.resource);
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
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
    mut query_logger: Option<Extension<QueryLogger>>,
) -> Result<Json<Vec<PropertyTypeRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(
            actor_id,
            OpenApiQuery::GetPropertyTypeAuthorizationRelationships {
                property_type_id: &property_type_id,
            },
        );
    }

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let response = Ok(Json(
        authorization_api
            .get_property_type_relations(
                PropertyTypeUuid::from_url(&property_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?,
    ));
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    get,
    path = "/property-types/{property_type_id}/permissions/{permission}",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = ActorEntityUuid, Header, description = "The ID of the actor which is used to authorize the request"),
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
    mut query_logger: Option<Extension<QueryLogger>>,
) -> Result<Json<PermissionResponse>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(
            actor_id,
            OpenApiQuery::CheckPropertyTypePermission {
                property_type_id: &property_type_id,
                permission,
            },
        );
    }

    let response = Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(report_to_response)?
            .check_property_type_permission(
                actor_id,
                permission,
                PropertyTypeUuid::from_url(&property_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?
            .has_permission,
    }));
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}
