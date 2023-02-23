//! Web routes for CRU operations on Property types.

use std::sync::Arc;

use axum::{http::StatusCode, routing::post, Extension, Json, Router};
use error_stack::IntoReport;
use futures::TryFutureExt;
use serde::{Deserialize, Serialize};
use type_system::{repr, uri::VersionedUri, PropertyType};
use utoipa::{OpenApi, ToSchema};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{report_to_status_code, utoipa_typedef::subgraph::Subgraph},
    ontology::{
        domain_validator::{DomainValidator, ValidateOntologyType},
        patch_id_and_parse, OntologyElementMetadata, OwnedOntologyElementMetadata,
        PropertyTypeQueryToken, PropertyTypeWithMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{BaseUriAlreadyExists, OntologyVersionDoesNotExist, PropertyTypeStore, StorePool},
    subgraph::query::{PropertyTypeStructuralQuery, StructuralQuery},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_property_type,
        get_property_types_by_query,
        update_property_type
    ),
    components(
        schemas(
            PropertyTypeWithMetadata,

            CreatePropertyTypeRequest,
            UpdatePropertyTypeRequest,
            PropertyTypeQueryToken,
            PropertyTypeStructuralQuery,
        )
    ),
    tags(
        (name = "PropertyType", description = "Property type management API")
    )
)]
pub struct PropertyTypeResource;

impl RoutedResource for PropertyTypeResource {
    /// Create routes for interacting with property types.
    fn routes<P: StorePool + Send + 'static>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/property-types",
            Router::new()
                .route(
                    "/",
                    post(create_property_type::<P>).put(update_property_type::<P>),
                )
                .route("/query", post(get_property_types_by_query::<P>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreatePropertyTypeRequest {
    #[schema(value_type = VAR_PROPERTY_TYPE)]
    schema: repr::PropertyType,
    owned_by_id: OwnedById,
    actor_id: UpdatedById,
}

#[utoipa::path(
    post,
    path = "/property-types",
    request_body = CreatePropertyTypeRequest,
    tag = "PropertyType",
    responses(
        (status = 201, content_type = "application/json", description = "The metadata of the created property type", body = OntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create property type in the store as the base property type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = CreatePropertyTypeRequest,
)]
#[tracing::instrument(level = "info", skip(pool, domain_validator))]
async fn create_property_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreatePropertyTypeRequest>,
) -> Result<Json<OntologyElementMetadata>, StatusCode> {
    let Json(CreatePropertyTypeRequest {
        schema,
        owned_by_id,
        actor_id,
    }) = body;

    let property_type: PropertyType = schema.try_into().into_report().map_err(|report| {
        tracing::error!(error=?report, "Couldn't convert schema to Property Type");
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    domain_validator
        .validate(&property_type)
        .map_err(|report| {
            tracing::error!(error=?report, id=property_type.id().to_string(), "Property Type ID failed to validate");
            StatusCode::UNPROCESSABLE_ENTITY
        })?;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let metadata = OntologyElementMetadata::Owned(OwnedOntologyElementMetadata::new(
        property_type.id().clone().into(),
        ProvenanceMetadata::new(actor_id),
        owned_by_id,
    ));

    store
        .create_property_type(property_type, &metadata)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create property type");

            if report.contains::<BaseUriAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(metadata))
}

#[utoipa::path(
    post,
    path = "/property-types/query",
    request_body = PropertyTypeStructuralQuery,
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", body = Subgraph, description = "A subgraph rooted at property types that satisfy the given query, each resolved to the requested depth."),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(pool))]
async fn get_property_types_by_query<P: StorePool + Send>(
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
            store
                .get_property_type(&query)
                .await
                .map_err(|report| {
                    tracing::error!(error=?report, ?query, "Could not read property types from the store");
                    report_to_status_code(&report)
                })
        })
        .await
        .map(|subgraph| Json(subgraph.into()))
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct UpdatePropertyTypeRequest {
    #[schema(value_type = VAR_UPDATE_PROPERTY_TYPE)]
    schema: serde_json::Value,
    #[schema(value_type = String)]
    type_to_update: VersionedUri,
    actor_id: UpdatedById,
}

#[utoipa::path(
    put,
    path = "/property-types",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated property type", body = OntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeRequest,
)]
#[tracing::instrument(level = "info", skip(pool))]
async fn update_property_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    body: Json<UpdatePropertyTypeRequest>,
) -> Result<Json<OntologyElementMetadata>, StatusCode> {
    let Json(UpdatePropertyTypeRequest {
        schema,
        mut type_to_update,
        actor_id,
    }) = body;

    type_to_update.version += 1;

    let property_type = patch_id_and_parse(&type_to_update, schema).map_err(|report| {
        tracing::error!(error=?report, "Couldn't patch schema and convert to Property Type");
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_property_type(property_type, actor_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update property type");

            if report.contains::<OntologyVersionDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}
