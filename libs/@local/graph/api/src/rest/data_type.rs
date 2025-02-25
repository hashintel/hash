//! Web routes for CRU operations on Data Types.

use alloc::sync::Arc;
use std::collections::HashMap;

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
        DataTypeEditorSubject, DataTypeOwnerSubject, DataTypePermission,
        DataTypeRelationAndSubject, DataTypeSetting, DataTypeSettingSubject, DataTypeViewerSubject,
    },
    zanzibar::Consistency,
};
use hash_graph_postgres_store::{
    ontology::patch_id_and_parse,
    store::error::{OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
};
use hash_graph_store::{
    data_type::{
        ArchiveDataTypeParams, CreateDataTypeParams, DataTypeConversionTargets, DataTypeQueryToken,
        DataTypeStore as _, GetDataTypeConversionTargetsParams,
        GetDataTypeConversionTargetsResponse, GetDataTypeSubgraphParams, GetDataTypesParams,
        GetDataTypesResponse, UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams,
        UpdateDataTypesParams,
    },
    entity_type::ClosedDataTypeDefinition,
    pool::StorePool,
    query::ConflictBehavior,
};
use hash_graph_types::{
    ontology::{
        DataTypeMetadata, DataTypeWithMetadata, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, OntologyTypeMetadata, OntologyTypeReference,
        ProvidedOntologyEditionProvenance,
    },
    owned_by_id::OwnedById,
};
use hash_status::Status;
use hash_temporal_client::TemporalClient;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::{
    schema::{
        ConversionDefinition, ConversionExpression, ConversionValue, Conversions, DataType,
        DataTypeUuid, DomainValidator, JsonSchemaValueType, Operator, ValidateOntologyType as _,
        Variable,
    },
    url::{BaseUrl, OntologyTypeVersion, VersionedUrl},
};
use utoipa::{OpenApi, ToSchema};

use super::api_resource::RoutedResource;
use crate::rest::{
    AuthenticatedUserHeader, OpenApiQuery, PermissionResponse, QueryLogger, RestApiStore,
    json::Json,
    status::{report_to_response, status_to_response},
    utoipa_typedef::{ListOrValue, MaybeListOfDataType, subgraph::Subgraph},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        get_data_type_authorization_relationships,
        modify_data_type_authorization_relationships,
        check_data_type_permission,

        create_data_type,
        load_external_data_type,
        get_data_types,
        get_data_type_subgraph,
        get_data_type_conversion_targets,
        update_data_type,
        update_data_types,
        update_data_type_embeddings,
        archive_data_type,
        unarchive_data_type,
    ),
    components(
        schemas(
            DataTypeWithMetadata,
            DataTypeSetting,

            DataTypeSettingSubject,
            DataTypeOwnerSubject,
            DataTypeEditorSubject,
            DataTypeViewerSubject,
            DataTypePermission,
            DataTypeRelationAndSubject,
            ModifyDataTypeAuthorizationRelationship,

            CreateDataTypeRequest,
            LoadExternalDataTypeRequest,
            UpdateDataTypeRequest,
            UpdateDataTypeEmbeddingParams,
            DataTypeQueryToken,
            GetDataTypesParams,
            GetDataTypesResponse,
            GetDataTypeSubgraphParams,
            GetDataTypeSubgraphResponse,
            GetDataTypeConversionTargetsParams,
            GetDataTypeConversionTargetsResponse,
            DataTypeConversionTargets,
            ArchiveDataTypeParams,
            UnarchiveDataTypeParams,
            ClosedDataTypeDefinition,
            JsonSchemaValueType,

            ConversionDefinition,
            ConversionExpression,
            ConversionValue,
            Conversions,
            Operator,
            Variable,
        )
    ),
    tags(
        (name = "DataType", description = "Data Type management API")
    )
)]
pub(crate) struct DataTypeResource;

impl RoutedResource for DataTypeResource {
    /// Create routes for interacting with data types.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'pool> S::Store<'pool, A::Api<'pool>>: RestApiStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/data-types",
            Router::new()
                .route(
                    "/",
                    post(create_data_type::<S, A>).put(update_data_type::<S, A>),
                )
                .route("/bulk", put(update_data_types::<S, A>))
                .route(
                    "/relationships",
                    post(modify_data_type_authorization_relationships::<A>),
                )
                .nest(
                    "/:data_type_id",
                    Router::new()
                        .route(
                            "/relationships",
                            get(get_data_type_authorization_relationships::<A>),
                        )
                        .route(
                            "/permissions/:permission",
                            get(check_data_type_permission::<A>),
                        ),
                )
                .nest(
                    "/query",
                    Router::new()
                        .route("/", post(get_data_types::<S, A>))
                        .route("/subgraph", post(get_data_type_subgraph::<S, A>))
                        .route(
                            "/conversions",
                            post(get_data_type_conversion_targets::<S, A>),
                        ),
                )
                .route("/load", post(load_external_data_type::<S, A>))
                .route("/archive", put(archive_data_type::<S, A>))
                .route("/unarchive", put(unarchive_data_type::<S, A>))
                .route("/embeddings", post(update_data_type_embeddings::<S, A>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateDataTypeRequest {
    #[schema(inline)]
    schema: MaybeListOfDataType,
    owned_by_id: OwnedById,
    relationships: Vec<DataTypeRelationAndSubject>,
    provenance: ProvidedOntologyEditionProvenance,
    conversions: HashMap<BaseUrl, Conversions>,
}

#[utoipa::path(
    post,
    path = "/data-types",
    request_body = CreateDataTypeRequest,
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the created data type", body = MaybeListOfDataTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create data type in the store as the base data type URL already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, domain_validator)
)]
async fn create_data_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreateDataTypeRequest>,
) -> Result<Json<ListOrValue<DataTypeMetadata>>, Response>
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

    let Json(CreateDataTypeRequest {
        schema,
        owned_by_id,
        relationships,
        provenance,
        conversions,
    }) = body;

    let is_list = matches!(&schema, ListOrValue::List(_));

    let mut metadata = store
        .create_data_types(
            actor_id,
            schema
                .into_iter()
                .map(|schema| {
                    domain_validator
                        .validate(&schema)
                        .map_err(report_to_response)?;

                    Ok(CreateDataTypeParams {
                        schema,
                        classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
                        relationships: relationships.clone(),
                        conflict_behavior: ConflictBehavior::Fail,
                        provenance: provenance.clone(),
                        conversions: conversions.clone(),
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
enum LoadExternalDataTypeRequest {
    #[serde(rename_all = "camelCase")]
    Fetch { data_type_id: VersionedUrl },
    #[serde(rename_all = "camelCase")]
    Create {
        schema: Box<DataType>,
        relationships: Vec<DataTypeRelationAndSubject>,
        provenance: Box<ProvidedOntologyEditionProvenance>,
        conversions: HashMap<BaseUrl, Conversions>,
    },
}

#[utoipa::path(
    post,
    path = "/data-types/load",
    request_body = LoadExternalDataTypeRequest,
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the loaded data type", body = DataTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to load data type in the store as the base data type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, domain_validator)
)]
async fn load_external_data_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    Json(request): Json<LoadExternalDataTypeRequest>,
) -> Result<Json<DataTypeMetadata>, Response>
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
        LoadExternalDataTypeRequest::Fetch { data_type_id } => {
            let OntologyTypeMetadata::DataType(metadata) = store
                .load_external_type(
                    actor_id,
                    &domain_validator,
                    OntologyTypeReference::DataTypeReference((&data_type_id).into()),
                )
                .await?
            else {
                // TODO: Make the type fetcher typed
                panic!("`load_external_type` should have returned a `DataTypeMetadata`");
            };
            Ok(Json(metadata))
        }
        LoadExternalDataTypeRequest::Create {
            schema,
            relationships,
            provenance,
            conversions,
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
                    .create_data_type(
                        actor_id,
                        CreateDataTypeParams {
                            schema: *schema,
                            classification: OntologyTypeClassificationMetadata::External {
                                fetched_at: OffsetDateTime::now_utc(),
                            },
                            relationships,
                            conflict_behavior: ConflictBehavior::Fail,
                            provenance: *provenance,
                            conversions: conversions.clone(),
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
    path = "/data-types/query",
    request_body = GetDataTypesParams,
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetDataTypesResponse,
            description = "Gets a a list of data types that satisfy the given query.",
        ),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn get_data_types<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetDataTypesResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetDataTypes(&request));
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
        .get_data_types(
            actor_id,
            // Manually deserialize the query from a JSON value to allow borrowed deserialization
            // and better error reporting.
            GetDataTypesParams::deserialize(&request)
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
struct GetDataTypeSubgraphResponse {
    subgraph: Subgraph,
    cursor: Option<VersionedUrl>,
}

#[utoipa::path(
    post,
    path = "/data-types/query/subgraph",
    request_body = GetDataTypeSubgraphParams,
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetDataTypeSubgraphResponse,
            description = "Gets a subgraph rooted at all data types that satisfy the given query, each resolved to the requested depth.",
        ),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn get_data_type_subgraph<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    mut query_logger: Option<Extension<QueryLogger>>,
    Json(request): Json<serde_json::Value>,
) -> Result<Json<GetDataTypeSubgraphResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(actor_id, OpenApiQuery::GetDataTypeSubgraph(&request));
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
        .get_data_type_subgraph(
            actor_id,
            // Manually deserialize the query from a JSON value to allow borrowed deserialization
            // and better error reporting.
            GetDataTypeSubgraphParams::deserialize(&request)
                .map_err(Report::from)
                .map_err(report_to_response)?,
        )
        .await
        .map_err(report_to_response)
        .map(|response| {
            Json(GetDataTypeSubgraphResponse {
                subgraph: Subgraph::from(response.subgraph),
                cursor: response.cursor,
            })
        });
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    response
}

#[utoipa::path(
    post,
    path = "/data-types/query/conversions",
    request_body = GetDataTypeConversionTargetsParams,
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = GetDataTypeConversionTargetsResponse,
        ),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, request)
)]
async fn get_data_type_conversion_targets<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    Json(request): Json<GetDataTypeConversionTargetsParams>,
) -> Result<Json<GetDataTypeConversionTargetsResponse>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
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
        .get_data_type_conversion_targets(actor_id, request)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateDataTypeRequest {
    #[schema(value_type = UpdateDataType)]
    schema: serde_json::Value,
    type_to_update: VersionedUrl,
    relationships: Vec<DataTypeRelationAndSubject>,
    provenance: ProvidedOntologyEditionProvenance,
    conversions: HashMap<BaseUrl, Conversions>,
}

#[utoipa::path(
    put,
    path = "/data-types",
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated data type", body = DataTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base data type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateDataTypeRequest,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn update_data_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    body: Json<UpdateDataTypeRequest>,
) -> Result<Json<DataTypeMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UpdateDataTypeRequest {
        schema,
        mut type_to_update,
        relationships,
        provenance,
        conversions,
    }) = body;

    type_to_update.version = OntologyTypeVersion::new(type_to_update.version.inner() + 1);

    let data_type = patch_id_and_parse(&type_to_update, schema).map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut store = store_pool
        .acquire(authorization_api, temporal_client.0)
        .await
        .map_err(report_to_response)?;

    store
        .update_data_type(
            actor_id,
            UpdateDataTypesParams {
                schema: data_type,
                relationships,
                provenance,
                conversions,
            },
        )
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    put,
    path = "/data-types/bulk",
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated data types", body = [DataTypeMetadata]),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base data types ID were not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = [UpdateDataTypeRequest],
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn update_data_types<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    bodies: Json<Vec<UpdateDataTypeRequest>>,
) -> Result<Json<Vec<DataTypeMetadata>>, Response>
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
            |UpdateDataTypeRequest {
                 schema,
                 mut type_to_update,
                 relationships,
                 provenance,
                 conversions,
             }| {
                type_to_update.version =
                    OntologyTypeVersion::new(type_to_update.version.inner() + 1);

                Ok(UpdateDataTypesParams {
                    schema: patch_id_and_parse(&type_to_update, schema)
                        .map_err(report_to_response)?,
                    relationships,
                    provenance,
                    conversions,
                })
            },
        )
        .collect::<Result<Vec<_>, Response>>()?;
    store
        .update_data_types(actor_id, params)
        .await
        .map_err(report_to_response)
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/data-types/embeddings",
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The embeddings were created"),

        (status = 403, description = "Insufficient permissions to update the data type"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateDataTypeEmbeddingParams,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client, body)
)]
async fn update_data_type_embeddings<S, A>(
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
    let params = UpdateDataTypeEmbeddingParams::deserialize(body)
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
        .update_data_type_embeddings(actor_id, params)
        .await
        .map_err(report_to_response)
}

#[utoipa::path(
    put,
    path = "/data-types/archive",
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated data type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Data type ID was not found"),
        (status = 409, description = "Data type ID is already archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = ArchiveDataTypeParams,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn archive_data_type<S, A>(
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
    let params = ArchiveDataTypeParams::deserialize(body)
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
        .archive_data_type(actor_id, params)
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
    path = "/data-types/unarchive",
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The temporal metadata of the updated data type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Data type ID was not found"),
        (status = 409, description = "Data type ID already exists and is not archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UnarchiveDataTypeParams,
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, temporal_client)
)]
async fn unarchive_data_type<S, A>(
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
    let params = UnarchiveDataTypeParams::deserialize(body)
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
        .unarchive_data_type(actor_id, params)
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
struct ModifyDataTypeAuthorizationRelationship {
    operation: ModifyRelationshipOperation,
    resource: VersionedUrl,
    relation_and_subject: DataTypeRelationAndSubject,
}

#[utoipa::path(
    post,
    path = "/data-types/relationships",
    tag = "DataType",
    request_body = [ModifyDataTypeAuthorizationRelationship],
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, description = "The relationship was modified for the data"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn modify_data_type_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    relationships: Json<Vec<ModifyDataTypeAuthorizationRelationship>>,
) -> Result<StatusCode, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let (data_types, operations): (Vec<_>, Vec<_>) = relationships
        .0
        .into_iter()
        .map(|request| {
            let resource = DataTypeUuid::from_url(&request.resource);
            (
                resource,
                (request.operation, resource, request.relation_and_subject),
            )
        })
        .unzip();

    let (permissions, _zookie) = authorization_api
        .check_data_types_permission(
            actor_id,
            DataTypePermission::Update,
            data_types,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(report_to_response)?;

    let mut failed = false;
    // TODO: Change interface for `check_data_types_permission` to avoid this loop
    for (_data_type_id, has_permission) in permissions {
        if !has_permission {
            tracing::error!("Insufficient permissions to modify relationship for data type");
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
        .modify_data_type_relations(operations)
        .await
        .map_err(report_to_response)?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/data-types/{data_type_id}/relationships",
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("data_type_id" = VersionedUrl, Path, description = "The Data type to read the relations for"),
    ),
    responses(
        (status = 200, description = "The relations of the data type", body = [DataTypeRelationAndSubject]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_data_type_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(data_type_id): Path<VersionedUrl>,
    authorization_api_pool: Extension<Arc<A>>,
    mut query_logger: Option<Extension<QueryLogger>>,
) -> Result<Json<Vec<DataTypeRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(
            actor_id,
            OpenApiQuery::GetDataTypeAuthorizationRelationships {
                data_type_id: &data_type_id,
            },
        );
    }

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let response = authorization_api
        .get_data_type_relations(
            DataTypeUuid::from_url(&data_type_id),
            Consistency::FullyConsistent,
        )
        .await
        .map_err(report_to_response)?;
    if let Some(query_logger) = &mut query_logger {
        query_logger.send().await.map_err(report_to_response)?;
    }
    Ok(Json(response))
}

#[utoipa::path(
    get,
    path = "/data-types/{data_type_id}/permissions/{permission}",
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("data_type_id" = VersionedUrl, Path, description = "The data type ID to check if the actor has the permission"),
        ("permission" = DataTypePermission, Path, description = "The permission to check for"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor has the permission for the data type"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn check_data_type_permission<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    mut query_logger: Option<Extension<QueryLogger>>,
    Path((data_type_id, permission)): Path<(VersionedUrl, DataTypePermission)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    if let Some(query_logger) = &mut query_logger {
        query_logger.capture(
            actor_id,
            OpenApiQuery::CheckDataTypePermission {
                data_type_id: &data_type_id,
                permission,
            },
        );
    }

    let response = Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(report_to_response)?
            .check_data_type_permission(
                actor_id,
                permission,
                DataTypeUuid::from_url(&data_type_id),
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
