//! Web routes for CRU operations on Property types.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use error_stack::IntoReport;
use futures::TryFutureExt;
use serde::{Deserialize, Serialize};
use type_system::{uri::VersionedUri, PropertyType};
use utoipa::{OpenApi, ToSchema};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::{read_from_store, report_to_status_code},
    ontology::{
        domain_validator::{DomainValidator, ValidateOntologyType},
        patch_id_and_parse, OntologyElementMetadata, PropertyTypeWithMetadata,
    },
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::{
        identifier::{ontology::OntologyTypeEditionId, GraphElementEditionId, GraphElementId},
        subgraph::{
            depths::GraphResolveDepths,
            edges::{Edges, OntologyEdgeKind, OutwardEdge, SharedEdgeKind},
            query::StructuralQuery,
            vertices::{Vertex, Vertices},
        },
    },
    store::{
        query::Filter, BaseUriAlreadyExists, BaseUriDoesNotExist, PropertyTypeStore, StorePool,
    },
    subgraph::{query::PropertyTypeStructuralQuery, Subgraph},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_property_type,
        get_property_types_by_query,
        get_property_type,
        get_latest_property_types,
        update_property_type
    ),
    components(
        schemas(
            CreatePropertyTypeRequest,
            UpdatePropertyTypeRequest,
            OwnedById,
            CreatedById,
            UpdatedById,
            OntologyTypeEditionId,
            OntologyElementMetadata,
            PropertyTypeWithMetadata,
            PropertyTypeStructuralQuery,
            GraphElementId,
            GraphElementEditionId,
            Vertices,
            Vertex,
            OntologyEdgeKind,
            SharedEdgeKind,
            OutwardEdge,
            GraphResolveDepths,
            Edges,
            Subgraph,
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
                    post(create_property_type::<P>)
                        .get(get_latest_property_types::<P>)
                        .put(update_property_type::<P>),
                )
                .route("/query", post(get_property_types_by_query::<P>))
                .route("/:version_id", get(get_property_type::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreatePropertyTypeRequest {
    #[schema(value_type = VAR_PROPERTY_TYPE)]
    schema: serde_json::Value,
    owned_by_id: OwnedById,
    actor_id: CreatedById,
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
async fn create_property_type<P: StorePool + Send>(
    body: Json<CreatePropertyTypeRequest>,
    pool: Extension<Arc<P>>,
    domain_validator: Extension<DomainValidator>,
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

    store
        .create_property_type(property_type, owned_by_id, actor_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create property type");

            if report.contains::<BaseUriAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
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
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/property-types",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "List of all property types at their latest versions", body = [PropertyTypeWithMetadata]),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_latest_property_types<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<PropertyTypeWithMetadata>>, StatusCode> {
    read_from_store(pool.as_ref(), &Filter::<PropertyType>::for_latest_version())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/property-types/{uri}",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the requested property type", body = PropertyTypeWithMetadata),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 404, description = "Property type was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("uri" = String, Path, description = "The URI of the property type"),
    )
)]
async fn get_property_type<P: StorePool + Send>(
    uri: Path<VersionedUri>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PropertyTypeWithMetadata>, StatusCode> {
    read_from_store(
        pool.as_ref(),
        &Filter::<PropertyType>::for_versioned_uri(&uri.0),
    )
    .await
    .and_then(|mut property_types| property_types.pop().ok_or(StatusCode::NOT_FOUND))
    .map(Json)
}

#[derive(ToSchema, Serialize, Deserialize)]
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
async fn update_property_type<P: StorePool + Send>(
    body: Json<UpdatePropertyTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<OntologyElementMetadata>, StatusCode> {
    let Json(UpdatePropertyTypeRequest {
        schema,
        type_to_update,
        actor_id,
    }) = body;

    let new_type_id = VersionedUri::new(
        type_to_update.base_uri().clone(),
        type_to_update.version() + 1,
    );

    let property_type = patch_id_and_parse(&new_type_id, schema).map_err(|report| {
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

            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}
