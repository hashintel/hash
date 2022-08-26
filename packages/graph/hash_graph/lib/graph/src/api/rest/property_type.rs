//! Web routes for CRU operations on Property types.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use type_system::{uri::VersionedUri, PropertyType};
use utoipa::{Component, OpenApi};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::read_from_store,
    ontology::{AccountId, PersistedOntologyIdentifier, PersistedPropertyType},
    store::{BaseUriAlreadyExists, BaseUriDoesNotExist, PropertyTypeStore, StorePool},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_property_type,
        get_property_type,
        get_latest_property_types,
        update_property_type
    ),
    components(
        CreatePropertyTypeRequest,
        UpdatePropertyTypeRequest,
        AccountId,
        PersistedOntologyIdentifier,
        PersistedPropertyType
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
                .route("/:version_id", get(get_property_type::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
struct CreatePropertyTypeRequest {
    #[component(value_type = VAR_PROPERTY_TYPE)]
    schema: PropertyType,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/property-types",
    request_body = CreatePropertyTypeRequest,
    tag = "PropertyType",
    responses(
        (status = 201, content_type = "application/json", description = "The schema of the created property type", body = PersistedOntologyIdentifier),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create property type in the store as the base property type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = CreatePropertyTypeRequest,
)]
async fn create_property_type<P: StorePool + Send>(
    body: Json<CreatePropertyTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedOntologyIdentifier>, StatusCode> {
    let Json(CreatePropertyTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_property_type(&schema, account_id)
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
    get,
    path = "/property-types",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "List of all property types at their latest versions", body = [PersistedPropertyType]),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_latest_property_types<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<PersistedPropertyType>>, StatusCode> {
    use crate::store::query::{Expression, Literal, Path, PathSegment};

    let query = Expression::Eq(vec![
        Expression::Path(Path {
            segments: vec![PathSegment {
                identifier: "version".to_owned(),
            }],
        }),
        Expression::Literal(Literal::String("latest".to_owned())),
    ]);
    tracing::debug!("query: {}", serde_json::to_string_pretty(&query).unwrap());
    read_from_store(pool.as_ref(), &query).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/property-types/{uri}",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the requested property type", body = PersistedPropertyType),
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
) -> Result<Json<PersistedPropertyType>, StatusCode> {
    use crate::store::query::{Expression, Literal, Path, PathSegment};

    let query = Expression::All(vec![
        Expression::Eq(vec![
            Expression::Path(Path {
                segments: vec![PathSegment {
                    identifier: "version".to_owned(),
                }],
            }),
            Expression::Literal(Literal::Float(f64::from(uri.version()))),
        ]),
        Expression::Eq(vec![
            Expression::Path(Path {
                segments: vec![PathSegment {
                    identifier: "uri".to_owned(),
                }],
            }),
            Expression::Literal(Literal::String(uri.base_uri().to_string())),
        ]),
    ]);
    tracing::debug!("query: {}", serde_json::to_string_pretty(&query).unwrap());
    read_from_store(pool.as_ref(), &query)
        .await
        .and_then(|mut data_types| data_types.pop().ok_or(StatusCode::NOT_FOUND))
        .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePropertyTypeRequest {
    #[component(value_type = VAR_PROPERTY_TYPE)]
    schema: PropertyType,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/property-types",
    tag = "PropertyType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the updated property type", body = PersistedOntologyIdentifier),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeRequest,
)]
async fn update_property_type<P: StorePool + Send>(
    body: Json<UpdatePropertyTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedOntologyIdentifier>, StatusCode> {
    let Json(UpdatePropertyTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_property_type(&schema, account_id)
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
