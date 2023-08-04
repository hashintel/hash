//! Web routes for CRU operations on Data Types.

use std::sync::Arc;

use axum::{
    http::StatusCode,
    routing::{post, put},
    Extension, Router,
};
use error_stack::IntoReport;
use futures::TryFutureExt;
use serde::{Deserialize, Serialize};
use type_system::{url::VersionedUrl, DataType};
use utoipa::{OpenApi, ToSchema};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{
        json::Json,
        report_to_status_code,
        utoipa_typedef::{subgraph::Subgraph, ListOrValue, MaybeListOfDataType},
        RestApiStore,
    },
    ontology::{
        domain_validator::{DomainValidator, ValidateOntologyType},
        patch_id_and_parse, DataTypeQueryToken, DataTypeWithMetadata, OntologyElementMetadata,
        OntologyTemporalMetadata, OntologyTypeReference, PartialCustomOntologyMetadata,
        PartialOntologyElementMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordArchivedById, RecordCreatedById},
    store::{
        error::VersionedUrlAlreadyExists, BaseUrlAlreadyExists, ConflictBehavior, DataTypeStore,
        OntologyVersionDoesNotExist, StorePool,
    },
    subgraph::query::{DataTypeStructuralQuery, StructuralQuery},
};

#[derive(OpenApi)]
#[openapi(
    paths(
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
    fn routes<P: StorePool + Send + 'static>() -> Router
    where
        for<'pool> P::Store<'pool>: RestApiStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/data-types",
            Router::new()
                .route("/", post(create_data_type::<P>).put(update_data_type::<P>))
                .route("/query", post(get_data_types_by_query::<P>))
                .route("/load", post(load_external_data_type::<P>))
                .route("/archive", put(archive_data_type::<P>))
                .route("/unarchive", put(unarchive_data_type::<P>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreateDataTypeRequest {
    #[schema(inline)]
    schema: MaybeListOfDataType,
    owned_by_id: OwnedById,
    actor_id: RecordCreatedById,
}

#[utoipa::path(
    post,
    path = "/data-types",
    request_body = CreateDataTypeRequest,
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the created data type", body = MaybeListOfOntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create data type in the store as the base data type URL already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(level = "info", skip(pool, domain_validator))]
async fn create_data_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreateDataTypeRequest>,
) -> Result<Json<ListOrValue<OntologyElementMetadata>>, StatusCode>
where
    for<'pool> P::Store<'pool>: RestApiStore,
{
    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let Json(CreateDataTypeRequest {
        schema,
        owned_by_id,
        actor_id,
    }) = body;

    let is_list = matches!(&schema, ListOrValue::List(_));

    let schema_iter = schema.into_iter();
    let mut data_types = Vec::with_capacity(schema_iter.size_hint().0);
    let mut partial_metadata = Vec::with_capacity(schema_iter.size_hint().0);

    for schema in schema_iter {
        let data_type: DataType = schema.try_into().into_report().map_err(|report| {
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
            custom: PartialCustomOntologyMetadata::Owned {
                provenance: ProvenanceMetadata::new(actor_id),
                owned_by_id,
            },
        });

        data_types.push(data_type);
    }

    let mut metadata = store
        .create_data_types(
            data_types.into_iter().zip(partial_metadata),
            ConflictBehavior::Fail,
        )
        .await
        .map_err(|report| {
            // TODO: consider adding the data type, or at least its URL in the trace
            tracing::error!(error=?report, "Could not create data types");

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
    #[schema(value_type = String)]
    data_type_id: VersionedUrl,
    actor_id: RecordCreatedById,
}

#[utoipa::path(
    post,
    path = "/data-types/load",
    request_body = LoadExternalDataTypeRequest,
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the loaded data type", body = OntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to load data type in the store as the base data type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(level = "info", skip(pool, domain_validator))]
async fn load_external_data_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<LoadExternalDataTypeRequest>,
) -> Result<Json<OntologyElementMetadata>, StatusCode>
where
    for<'pool> P::Store<'pool>: RestApiStore,
{
    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let Json(LoadExternalDataTypeRequest {
        data_type_id,
        actor_id,
    }) = body;

    Ok(Json(
        store
            .load_external_type(
                &domain_validator,
                OntologyTypeReference::DataTypeReference((&data_type_id).into()),
                actor_id,
            )
            .await?,
    ))
}

#[utoipa::path(
    post,
    path = "/data-types/query",
    request_body = DataTypeStructuralQuery,
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", body = Subgraph, description = "Gets a subgraph rooted at all data types that satisfy the given query, each resolved to the requested depth."),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(pool))]
async fn get_data_types_by_query<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    Json(query): Json<serde_json::Value>,
) -> Result<Json<Subgraph>, StatusCode> {
    pool.acquire()
        .map_err(|error| {
            tracing::error!(?error, "Could not acquire access to the store");
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .and_then(|store| async move {
            let mut query = StructuralQuery::deserialize(&query).map_err(|error| {
                tracing::error!(?error, "Could not deserialize query");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            query.filter.convert_parameters().map_err(|error| {
                tracing::error!(?error, "Could not validate query");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            store.get_data_type(&query).await.map_err(|report| {
                tracing::error!(error=?report, ?query, "Could not read data types from the store");
                report_to_status_code(&report)
            })
        })
        .await
        .map(|subgraph| Json(subgraph.into()))
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct UpdateDataTypeRequest {
    #[schema(value_type = VAR_UPDATE_DATA_TYPE)]
    schema: serde_json::Value,
    #[schema(value_type = String)]
    type_to_update: VersionedUrl,
    actor_id: RecordCreatedById,
}

#[utoipa::path(
    put,
    path = "/data-types",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated data type", body = OntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base data type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateDataTypeRequest,
)]
#[tracing::instrument(level = "info", skip(pool))]
async fn update_data_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    body: Json<UpdateDataTypeRequest>,
) -> Result<Json<OntologyElementMetadata>, StatusCode> {
    let Json(UpdateDataTypeRequest {
        schema,
        mut type_to_update,
        actor_id,
    }) = body;

    type_to_update.version += 1;

    let data_type = patch_id_and_parse(&type_to_update, schema).map_err(|report| {
        tracing::error!(error=?report, "Couldn't patch schema and convert to Data Type");
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_data_type(data_type, actor_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update data type");

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
    #[schema(value_type = String)]
    type_to_archive: VersionedUrl,
    #[expect(dead_code)]
    actor_id: RecordArchivedById,
}

#[utoipa::path(
    put,
    path = "/data-types/archive",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated data type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Data type ID was not found"),
        (status = 409, description = "Data type ID is already archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = ArchiveDataTypeRequest,
)]
#[tracing::instrument(level = "info", skip(pool))]
async fn archive_data_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    body: Json<ArchiveDataTypeRequest>,
) -> Result<Json<OntologyTemporalMetadata>, StatusCode> {
    let Json(ArchiveDataTypeRequest {
        type_to_archive, ..
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .archive_data_type(&type_to_archive)
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
    #[schema(value_type = String)]
    type_to_unarchive: VersionedUrl,
    #[expect(dead_code)]
    actor_id: RecordCreatedById,
}

#[utoipa::path(
    put,
    path = "/data-types/unarchive",
    tag = "DataType",
    responses(
        (status = 200, content_type = "application/json", description = "The temporal metadata of the updated data type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Data type ID was not found"),
        (status = 409, description = "Data type ID already exists and is not archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UnarchiveDataTypeRequest,
)]
#[tracing::instrument(level = "info", skip(pool))]
async fn unarchive_data_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    body: Json<UnarchiveDataTypeRequest>,
) -> Result<Json<OntologyTemporalMetadata>, StatusCode> {
    let Json(UnarchiveDataTypeRequest {
        type_to_unarchive, ..
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .unarchive_data_type(&type_to_unarchive)
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
