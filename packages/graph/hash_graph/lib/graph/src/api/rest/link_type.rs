//! Web routes for CRU operations on Link types.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use error_stack::IntoReport;
use serde::{Deserialize, Serialize};
use type_system::{uri::VersionedUri, LinkType};
use utoipa::{Component, OpenApi};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::read_from_store,
    ontology::{AccountId, PersistedLinkType, PersistedOntologyIdentifier},
    store::{
        query::Expression, BaseUriAlreadyExists, BaseUriDoesNotExist, LinkTypeStore, StorePool,
    },
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_link_type,
        query_link_types,
        get_link_type,
        get_latest_link_types,
        update_link_type
    ),
    components(
        CreateLinkTypeRequest,
        UpdateLinkTypeRequest,
        AccountId,
        PersistedOntologyIdentifier,
        PersistedLinkType
    ),
    tags(
        (name = "LinkType", description = "Link type management API")
    )
)]
pub struct LinkTypeResource;

impl RoutedResource for LinkTypeResource {
    /// Create routes for interacting with link types.
    fn routes<P: StorePool + Send + 'static>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/link-types",
            Router::new()
                .route(
                    "/",
                    post(create_link_type::<P>)
                        .get(get_latest_link_types::<P>)
                        .put(update_link_type::<P>),
                )
                .route("/query", post(query_link_types::<P>))
                .route("/:version_id", get(get_link_type::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
struct CreateLinkTypeRequest {
    #[component(value_type = VAR_LINK_TYPE)]
    schema: serde_json::Value,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/link-types",
    request_body = CreateLinkTypeRequest,
    tag = "LinkType",
    responses(
        (status = 201, content_type = "application/json", description = "The schema of the created link type", body = PersistedOntologyIdentifier),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create link type in the store as the base link type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = CreateLinkTypeRequest,
)]
async fn create_link_type<P: StorePool + Send>(
    body: Json<CreateLinkTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedOntologyIdentifier>, StatusCode> {
    let Json(CreateLinkTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let link_type: LinkType = schema.try_into().into_report().map_err(|report| {
        tracing::error!(error=?report, "Couldn't convert schema to Link Type");
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    store
        .create_link_type(link_type, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create link type");

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
    path = "/link-types/query",
    request_body = Expression,
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "List of all link types matching the provided query", body = [PersistedLinkType]),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn query_link_types<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    Json(expression): Json<Expression>,
) -> Result<Json<Vec<PersistedLinkType>>, StatusCode> {
    read_from_store(pool.as_ref(), &expression).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/link-types",
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "List of all link types at their latest versions", body = [PersistedLinkType]),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_latest_link_types<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<PersistedLinkType>>, StatusCode> {
    read_from_store(pool.as_ref(), &Expression::for_latest_version())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/link-types/{uri}",
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the requested link type", body = PersistedLinkType),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 404, description = "Link type was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("uri" = String, Path, description = "The URI of the link type"),
    )
)]
async fn get_link_type<P: StorePool + Send>(
    uri: Path<VersionedUri>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedLinkType>, StatusCode> {
    read_from_store(pool.as_ref(), &Expression::for_versioned_uri(&uri.0))
        .await
        .and_then(|mut data_types| data_types.pop().ok_or(StatusCode::NOT_FOUND))
        .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLinkTypeRequest {
    #[component(value_type = VAR_LINK_TYPE)]
    schema: serde_json::Value,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/link-types",
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the updated link type", body = PersistedOntologyIdentifier),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base link type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateLinkTypeRequest,
)]
async fn update_link_type<P: StorePool + Send>(
    body: Json<UpdateLinkTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedOntologyIdentifier>, StatusCode> {
    let Json(UpdateLinkTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let link_type: LinkType = schema.try_into().into_report().map_err(|report| {
        tracing::error!(error=?report, "Couldn't convert schema to Link Type");
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    store
        .update_link_type(link_type, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update link type");

            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}
