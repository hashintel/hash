//! Web routes for CRU operations on Data Types.

#![expect(clippy::str_to_string)]

use std::sync::Arc;

use authorization::{
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    schema::{
        DataTypeGeneralViewerSubject, DataTypeId, DataTypeOwnerSubject, DataTypePermission,
        DataTypeRelationAndSubject,
    },
    zanzibar::Consistency,
    AuthorizationApi, AuthorizationApiPool,
};
use axum::{
    extract::Path,
    http::StatusCode,
    response::Response,
    routing::{get, post, put},
    Extension, Router,
};
use error_stack::Report;
use graph_types::{
    ontology::{
        DataTypeWithMetadata, OntologyElementMetadata, OntologyTemporalMetadata,
        OntologyTypeReference, PartialCustomOntologyMetadata, PartialOntologyElementMetadata,
    },
    provenance::OwnedById,
};
use serde::{Deserialize, Serialize};
use type_system::{url::VersionedUrl, DataType};
use utoipa::{OpenApi, ToSchema};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{
        json::Json,
        report_to_status_code,
        status::report_to_response,
        utoipa_typedef::{subgraph::Subgraph, ListOrValue, MaybeListOfDataType},
        AuthenticatedUserHeader, PermissionResponse, RestApiStore,
    },
    ontology::{
        domain_validator::{DomainValidator, ValidateOntologyType},
        patch_id_and_parse, DataTypeQueryToken,
    },
    store::{
        error::VersionedUrlAlreadyExists, BaseUrlAlreadyExists, ConflictBehavior, DataTypeStore,
        OntologyVersionDoesNotExist, StorePool,
    },
    subgraph::query::{DataTypeStructuralQuery, StructuralQuery},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        get_data_type_authorization_relationships,
        modify_data_type_authorization_relationships,
        check_data_type_permission,

        create_data_type,
        load_external_data_type,
        get_data_types_by_query,
        update_data_type,
        archive_data_type,
        unarchive_data_type,
    ),
    components(
        schemas(
            DataTypeWithMetadata,

            DataTypeGeneralViewerSubject,
            DataTypeOwnerSubject,
            DataTypePermission,
            DataTypeRelationAndSubject,
            ModifyDataTypeAuthorizationRelationship,

            CreateDataTypeRequest,
            LoadExternalDataTypeRequest,
            UpdateDataTypeRequest,
            DataTypeQueryToken,
            DataTypeStructuralQuery,
            ArchiveDataTypeRequest,
            UnarchiveDataTypeRequest,
        )
    ),
    tags(
        (name = "DataType", description = "Data Type management API")
    )
)]
pub struct DataTypeResource;

impl RoutedResource for DataTypeResource {
    /// Create routes for interacting with data types.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'pool> S::Store<'pool>: RestApiStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/data-types",
            Router::new()
                .route(
                    "/",
                    post(create_data_type::<S, A>).put(update_data_type::<S, A>),
                )
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
                .route("/query", post(get_data_types_by_query::<S, A>))
                .route("/load", post(load_external_data_type::<S, A>))
                .route("/archive", put(archive_data_type::<S, A>))
                .route("/unarchive", put(unarchive_data_type::<S, A>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreateDataTypeRequest {
    #[schema(inline)]
    schema: MaybeListOfDataType,
    owned_by_id: OwnedById,
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
        (status = 200, content_type = "application/json", description = "The metadata of the created data type", body = MaybeListOfOntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create data type in the store as the base data type URL already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, domain_validator)
)]
async fn create_data_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreateDataTypeRequest>,
) -> Result<Json<ListOrValue<OntologyElementMetadata>>, StatusCode>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool>: RestApiStore,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let Json(CreateDataTypeRequest {
        schema,
        owned_by_id,
    }) = body;

    let is_list = matches!(&schema, ListOrValue::List(_));

    let schema_iter = schema.into_iter();
    let mut data_types = Vec::with_capacity(schema_iter.size_hint().0);
    let mut partial_metadata = Vec::with_capacity(schema_iter.size_hint().0);

    for schema in schema_iter {
        let data_type: DataType = schema.try_into().map_err(|report| {
            tracing::error!(error=?report, "Couldn't convert schema to Data Type");
            StatusCode::UNPROCESSABLE_ENTITY
            // TODO - We should probably return more information to the client
            //  https://app.asana.com/0/1201095311341924/1202574350052904/f
        })?;

        domain_validator.validate(&data_type).map_err(|report| {
            tracing::error!(error=?report, id=data_type.id().to_string(), "Data Type ID failed to validate");
            StatusCode::UNPROCESSABLE_ENTITY
        })?;

        partial_metadata.push(PartialOntologyElementMetadata {
            record_id: data_type.id().clone().into(),
            custom: PartialCustomOntologyMetadata::Owned { owned_by_id },
        });

        data_types.push(data_type);
    }

    let mut metadata = store
        .create_data_types(
            actor_id,
            &mut authorization_api,
            data_types.into_iter().zip(partial_metadata),
            ConflictBehavior::Fail,
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
#[serde(rename_all = "camelCase")]
struct LoadExternalDataTypeRequest {
    #[schema(value_type = SHARED_VersionedUrl)]
    data_type_id: VersionedUrl,
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
        (status = 200, content_type = "application/json", description = "The metadata of the loaded data type", body = OntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to load data type in the store as the base data type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, domain_validator)
)]
async fn load_external_data_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<LoadExternalDataTypeRequest>,
) -> Result<Json<OntologyElementMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool>: RestApiStore,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let Json(LoadExternalDataTypeRequest { data_type_id }) = body;

    Ok(Json(
        store
            .load_external_type(
                actor_id,
                &mut authorization_api,
                &domain_validator,
                OntologyTypeReference::DataTypeReference((&data_type_id).into()),
            )
            .await?,
    ))
}

#[utoipa::path(
    post,
    path = "/data-types/query",
    request_body = DataTypeStructuralQuery,
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", body = Subgraph, description = "Gets a subgraph rooted at all data types that satisfy the given query, each resolved to the requested depth."),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn get_data_types_by_query<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Json(query): Json<serde_json::Value>,
) -> Result<Json<Subgraph>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let store = store_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut query = StructuralQuery::deserialize(&query).map_err(|error| {
        tracing::error!(?error, "Could not deserialize query");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    query.filter.convert_parameters().map_err(|error| {
        tracing::error!(?error, "Could not validate query");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    let subgraph = store
        .get_data_type(actor_id, &authorization_api, &query)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, ?query, "Could not read data types from the store");
            report_to_status_code(&report)
        })?;

    Ok(Json(subgraph.into()))
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct UpdateDataTypeRequest {
    #[schema(value_type = VAR_UPDATE_DATA_TYPE)]
    schema: serde_json::Value,
    #[schema(value_type = SHARED_VersionedUrl)]
    type_to_update: VersionedUrl,
}

#[utoipa::path(
    put,
    path = "/data-types",
    tag = "DataType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated data type", body = OntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base data type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateDataTypeRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_data_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<UpdateDataTypeRequest>,
) -> Result<Json<OntologyElementMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UpdateDataTypeRequest {
        schema,
        mut type_to_update,
    }) = body;

    type_to_update.version += 1;

    let data_type = patch_id_and_parse(&type_to_update, schema).map_err(|report| {
        tracing::error!(error=?report, "Couldn't patch schema and convert to Data Type");
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_data_type(actor_id, &mut authorization_api, data_type)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update data type");

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

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ArchiveDataTypeRequest {
    #[schema(value_type = SHARED_VersionedUrl)]
    type_to_archive: VersionedUrl,
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
    request_body = ArchiveDataTypeRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn archive_data_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<ArchiveDataTypeRequest>,
) -> Result<Json<OntologyTemporalMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(ArchiveDataTypeRequest { type_to_archive }) = body;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .archive_data_type(actor_id, &mut authorization_api, &type_to_archive)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not archive data type");

            if report.contains::<OntologyVersionDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct UnarchiveDataTypeRequest {
    #[schema(value_type = SHARED_VersionedUrl)]
    type_to_unarchive: VersionedUrl,
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
    request_body = UnarchiveDataTypeRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn unarchive_data_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<UnarchiveDataTypeRequest>,
) -> Result<Json<OntologyTemporalMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UnarchiveDataTypeRequest { type_to_unarchive }) = body;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .unarchive_data_type(actor_id, &mut authorization_api, &type_to_unarchive)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not unarchive data type");

            if report.contains::<OntologyVersionDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
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
            let resource = DataTypeId::from_url(&request.resource);
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
) -> Result<Json<Vec<DataTypeRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    Ok(Json(
        authorization_api
            .get_data_type_relations(
                DataTypeId::from_url(&data_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?,
    ))
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
    Path((data_type_id, permission)): Path<(VersionedUrl, DataTypePermission)>,
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
            .check_data_type_permission(
                actor_id,
                permission,
                DataTypeId::from_url(&data_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?
            .has_permission,
    }))
}
