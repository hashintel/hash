//! Web routes for CRU operations on links.

use std::sync::Arc;

use axum::{extract::Path, http::StatusCode, routing::post, Extension, Json, Router};
use futures::TryFutureExt;
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::{OpenApi, ToSchema};

use crate::{
    api::rest::{api_resource::RoutedResource, read_from_store, report_to_status_code},
    knowledge::{EntityId, Link, LinkRootedSubgraph, PersistedLink, PersistedLinkMetadata},
    ontology::AccountId,
    store::{error::QueryError, query::Expression, LinkStore, StorePool},
    subgraph::StructuralQuery,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_link,
        get_links_by_query,
        get_entity_links,
        remove_link
    ),
    components(
        schemas(
            AccountId,
            PersistedLink,
            Link,
            CreateLinkRequest,
            RemoveLinkRequest,
            StructuralQuery,
            LinkRootedSubgraph,
            PersistedLinkMetadata
        )
    ),
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
                    .delete(remove_link::<P>),
            )
            .nest(
                "/links",
                Router::new().route("/query", post(get_links_by_query::<P>)),
            )
    }
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct CreateLinkRequest {
    target_entity_id: EntityId,
    #[schema(value_type = String)]
    link_type_id: VersionedUri,
    owned_by_id: AccountId,
    // TODO: Consider if ordering should be exposed on links as they are here. The API consumer
    //   manages indexes currently.
    //   https://app.asana.com/0/1202805690238892/1202937382769278/f
    index: Option<i32>,
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
        link_type_id,
        owned_by_id,
        index,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let link = Link::new(source_entity_id, target_entity_id, link_type_id, index);

    store
        .create_link(&link, owned_by_id)
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
    request_body = StructuralQuery,
    tag = "Link",
    responses(
        (status = 200, content_type = "application/json", body = [LinkRootedSubgraph], description = "A list of subgraphs rooted at links that satisfy the given query, each resolved to the requested depth."),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_links_by_query<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    Json(query): Json<StructuralQuery>,
) -> Result<Json<Vec<LinkRootedSubgraph>>, StatusCode> {
    pool.acquire()
        .map_err(|error| {
            tracing::error!(?error, "Could not acquire access to the store");
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .and_then(|store| async move {
            store.get_links(&query).await.map_err(|report| {
                tracing::error!(error=?report, ?query, "Could not read links from the store");
                report_to_status_code(&report)
            })
        })
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entities/{entityId}/links",
    tag = "Link",
    responses(
        (status = 200, content_type = "application/json", description = "The requested links on the given source entity", body = [PersistedLink]),
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
) -> Result<Json<Vec<PersistedLink>>, StatusCode> {
    read_from_store(
        pool.as_ref(),
        &Expression::for_link_by_source_entity_id(source_entity_id),
    )
    .await
    .map(Json)
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct RemoveLinkRequest {
    target_entity_id: EntityId,
    #[schema(value_type = String)]
    link_type_id: VersionedUri,
    removed_by_id: AccountId,
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
    request_body = RemoveLinkRequest,
    params(
        ("entityId" = Uuid, Path, description = "The ID of the source entity"),
    ),
)]
async fn remove_link<P: StorePool + Send>(
    source_entity_id: Path<EntityId>,
    body: Json<RemoveLinkRequest>,
    pool: Extension<Arc<P>>,
) -> Result<StatusCode, StatusCode> {
    let Path(source_entity_id) = source_entity_id;
    let Json(RemoveLinkRequest {
        target_entity_id,
        link_type_id,
        removed_by_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .remove_link(
            &Link::new(source_entity_id, target_entity_id, link_type_id, None),
            removed_by_id,
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not remove link");

            if report.contains::<QueryError>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(StatusCode::NO_CONTENT)
}
