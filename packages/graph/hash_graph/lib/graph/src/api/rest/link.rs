//! Web routes for CRU operations on links.

use std::sync::Arc;

use axum::{extract::Path, http::StatusCode, routing::post, Extension, Json, Router};
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::{Component, OpenApi};

use crate::{
    api::rest::{api_resource::RoutedResource, read_from_store},
    knowledge::{EntityId, Link},
    ontology::AccountId,
    store::{error::QueryError, query::Expression, LinkStore, StorePool},
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_link,
        query_active_links,
        get_entity_links,
        inactivate_link
    ),
    components(AccountId, Link, CreateLinkRequest, InactivateLinkRequest),
    tags(
        (name = "Link", description = "link management API")
    )
)]
pub struct LinkResource;

impl RoutedResource for LinkResource {
    /// Create routes for interacting with links.
    fn routes<P: StorePool + Send + 'static>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        //   for links specifically, we are stacking on top of the existing `/entity/` routes.
        Router::new()
            .route(
                "/entities/:entity_id/links",
                post(create_link::<P>)
                    .get(get_entity_links::<P>)
                    .delete(inactivate_link::<P>),
            )
            .nest(
                "/links",
                Router::new().route("/query", post(query_active_links::<P>)),
            )
    }
}

#[derive(Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
struct CreateLinkRequest {
    target_entity_id: EntityId,
    #[component(value_type = String)]
    link_type_uri: VersionedUri,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/entities/{entityId}/links",
    request_body = CreateLinkRequest,
    tag = "Link",
    responses(
        (status = 201, content_type = "application/json", description = "The created link on the given source entity", body = Link),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Source entity, target entity or link type URI was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("entityId" = Uuid, Path, description = "The ID of the source entity"),
    )
)]
async fn create_link<P: StorePool + Send>(
    source_entity_id: Path<EntityId>,
    body: Json<CreateLinkRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<Link>, StatusCode> {
    let Path(source_entity_id) = source_entity_id;
    let Json(CreateLinkRequest {
        target_entity_id,
        link_type_uri,
        account_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let link = Link::new(source_entity_id, target_entity_id, link_type_uri);

    store
        .create_link(&link, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create link");

            // when parts of the requested link cannot be found
            if report.contains::<QueryError>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(link))
}

#[utoipa::path(
    post,
    path = "/links/query",
    request_body = Expression,
    tag = "Link",
    responses(
        (status = 200, content_type = "application/json", description = "List of all links matching the provided query", body = [Link]),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn query_active_links<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    Json(expression): Json<Expression>,
) -> Result<Json<Vec<Link>>, StatusCode> {
    read_from_store(pool.as_ref(), &expression).await.map(Json)
}

#[utoipa::path(
    get,
    path = "/entities/{entityId}/links",
    tag = "Link",
    responses(
        (status = 200, content_type = "application/json", description = "The requested links on the given source entity", body = [Link]),
        (status = 422, content_type = "text/plain", description = "Provided source entity id is invalid"),

        (status = 404, description = "No links were found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("entityId" = Uuid, Path, description = "The ID of the source entity"),
    )
)]
async fn get_entity_links<P: StorePool + Send>(
    Path(source_entity_id): Path<EntityId>,
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<Link>>, StatusCode> {
    read_from_store(
        pool.as_ref(),
        &Expression::for_link_by_source_entity_id(source_entity_id),
    )
    .await
    .map(Json)
}

#[derive(Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
struct InactivateLinkRequest {
    target_entity_id: EntityId,
    #[component(value_type = String)]
    link_type_uri: VersionedUri,
}

#[utoipa::path(
    delete,
    path = "/entities/{entityId}/links",
    tag = "Link",
    responses(
        (status = 204, content_type = "application/json", description = "Empty response at link inactivation"),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Source entity, target entity or link type URI was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = InactivateLinkRequest,
    params(
        ("entityId" = Uuid, Path, description = "The ID of the source entity"),
    ),
)]
async fn inactivate_link<P: StorePool + Send>(
    source_entity_id: Path<EntityId>,
    body: Json<InactivateLinkRequest>,
    pool: Extension<Arc<P>>,
) -> Result<StatusCode, StatusCode> {
    let Path(source_entity_id) = source_entity_id;
    let Json(InactivateLinkRequest {
        target_entity_id,
        link_type_uri,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .inactivate_link(&Link::new(
            source_entity_id,
            target_entity_id,
            link_type_uri,
        ))
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not inactivate link");

            if report.contains::<QueryError>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}
