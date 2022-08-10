//! Web routes for CRU operations on Link types.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::{Component, OpenApi};

use super::api_resource::RoutedResource;
use crate::{
    api::rest::read_from_store,
    ontology::{
        types::{uri::VersionedUri, LinkType},
        AccountId,
    },
    store::{
        query::LinkTypeQuery, BaseUriAlreadyExists, BaseUriDoesNotExist, LinkTypeStore, StorePool,
    },
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_link_type,
        get_link_type,
        get_latest_link_types,
        update_link_type
    ),
    components(CreateLinkTypeRequest, UpdateLinkTypeRequest, AccountId),
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
                .route("/:version_id", get(get_link_type::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
struct CreateLinkTypeRequest {
    #[component(value_type = VAR_LINK_TYPE)]
    schema: LinkType,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/link-types",
    request_body = CreateLinkTypeRequest,
    tag = "LinkType",
    responses(
        (status = 201, content_type = "application/json", description = "The schema of the created link type", body = VAR_LINK_TYPE),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create link type in the store as the base link type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = CreateLinkTypeRequest,
)]
async fn create_link_type<P: StorePool + Send>(
    body: Json<CreateLinkTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<LinkType>, StatusCode> {
    let Json(CreateLinkTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_link_type(&schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create link type");

            if report.contains::<BaseUriAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(schema))
}

#[utoipa::path(
    get,
    path = "/link-types",
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "List of all link types at their latest versions", body = [VAR_LINK_TYPE]),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_latest_link_types<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<LinkType>>, StatusCode> {
    read_from_store(pool.as_ref(), &LinkTypeQuery::new().by_latest_version())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/link-types/{uri}",
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the requested link type", body = VAR_LINK_TYPE),
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
) -> Result<Json<LinkType>, StatusCode> {
    read_from_store(
        pool.as_ref(),
        &LinkTypeQuery::new()
            .by_uri(uri.base_uri())
            .by_version(uri.version()),
    )
    .await
    .and_then(|mut link_types| link_types.pop().ok_or(StatusCode::NOT_FOUND))
    .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLinkTypeRequest {
    #[component(value_type = VAR_LINK_TYPE)]
    schema: LinkType,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/link-types",
    tag = "LinkType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the updated link type", body = VAR_LINK_TYPE),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base link type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateLinkTypeRequest,
)]
async fn update_link_type<P: StorePool + Send>(
    body: Json<UpdateLinkTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<LinkType>, StatusCode> {
    let Json(UpdateLinkTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_link_type(&schema, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update link type");

            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(schema))
}
