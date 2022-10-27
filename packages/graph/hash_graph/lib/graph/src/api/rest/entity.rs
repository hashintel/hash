//! Web routes for CRU operations on entities.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use futures::TryFutureExt;
use serde::{Deserialize, Serialize};
use type_system::uri::VersionedUri;
use utoipa::{OpenApi, ToSchema};

use super::StructuralQuery;
use crate::{
    api::rest::{api_resource::RoutedResource, read_from_store, report_to_status_code},
    knowledge::{
        Entity, EntityId, PersistedEntity, PersistedEntityIdentifier, PersistedEntityMetadata,
    },
    provenance::{CreatedById, OwnedById, UpdatedById},
    shared::identifier::GraphElementIdentifier,
    store::{
        error::{EntityDoesNotExist, QueryError},
        query::Filter,
        EntityStore, StorePool,
    },
    subgraph::{
        EdgeKind, Edges, GraphResolveDepths, NewStructuralQuery, OutwardEdge, Subgraph, Vertex,
    },
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity,
        get_entities_by_query,
        get_entity,
        get_latest_entities,
        update_entity
    ),
    components(
        schemas(
            OwnedById,
            CreatedById,
            UpdatedById,
            CreateEntityRequest,
            UpdateEntityRequest,
            EntityId,
            PersistedEntityIdentifier,
            PersistedEntityMetadata,
            PersistedEntity,
            Entity,
            StructuralQuery,
            GraphElementIdentifier,
            Vertex,
            EdgeKind,
            OutwardEdge,
            GraphResolveDepths,
            Edges,
            Subgraph,
        )
    ),
    tags(
        (name = "Entity", description = "entity management API")
    )
)]
pub struct EntityResource;

impl RoutedResource for EntityResource {
    /// Create routes for interacting with entities.
    fn routes<P: StorePool + Send + 'static>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entities",
            Router::new()
                .route(
                    "/",
                    post(create_entity::<P>)
                        .get(get_latest_entities::<P>)
                        .put(update_entity::<P>),
                )
                .route("/query", post(get_entities_by_query::<P>))
                .route("/:entity_id", get(get_entity::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreateEntityRequest {
    entity: Entity,
    #[schema(value_type = String)]
    entity_type_id: VersionedUri,
    owned_by_id: OwnedById,
    entity_id: Option<EntityId>,
    actor_id: CreatedById,
}

#[utoipa::path(
    post,
    path = "/entities",
    request_body = CreateEntityRequest,
    tag = "Entity",
    responses(
        (status = 201, content_type = "application/json", description = "The metadata of the created entity", body = PersistedEntityMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URI was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = CreateEntityRequest,
)]
async fn create_entity<P: StorePool + Send>(
    body: Json<CreateEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedEntityMetadata>, StatusCode> {
    let Json(CreateEntityRequest {
        entity,
        entity_type_id,
        owned_by_id,
        entity_id,
        actor_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_entity(entity, entity_type_id, owned_by_id, entity_id, actor_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create entity");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = StructuralQuery,
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", body = Subgraph, description = "A subgraph rooted at entities that satisfy the given query, each resolved to the requested depth."),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_entities_by_query<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    Json(query): Json<StructuralQuery>,
) -> Result<Json<Subgraph>, StatusCode> {
    pool.acquire()
        .map_err(|error| {
            tracing::error!(?error, "Could not acquire access to the store");
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .and_then(|store| async move {
            let mut query = NewStructuralQuery::try_from(query).map_err(|error| {
                tracing::error!(?error, "Could not deserialize query");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            query.filter.convert_parameters().map_err(|error| {
                tracing::error!(?error, "Could not validate query");
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
            store.get_entity(&query).await.map_err(|report| {
                tracing::error!(error=?report, ?query, "Could not read entities from the store");
                report_to_status_code(&report)
            })
        })
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entities",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "List of all entities", body = [PersistedEntity]),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_latest_entities<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<PersistedEntity>>, StatusCode> {
    read_from_store(pool.as_ref(), &Filter::<Entity>::for_all_latest_entities())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entities/{entityId}",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "The requested entity", body = PersistedEntity),

        (status = 400, content_type = "text/plain", description = "Provided entity id is invalid"),
        (status = 404, description = "Entity was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("entityId" = Uuid, Path, description = "The ID of the entity"),
    )
)]
async fn get_entity<P: StorePool + Send>(
    Path(entity_id): Path<EntityId>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedEntity>, StatusCode> {
    read_from_store(
        pool.as_ref(),
        &Filter::<Entity>::for_latest_entity_by_entity_id(entity_id),
    )
    .await
    .and_then(|mut entities| entities.pop().ok_or(StatusCode::NOT_FOUND))
    .map(Json)
}

#[derive(ToSchema, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateEntityRequest {
    entity: Entity,
    entity_id: EntityId,
    #[schema(value_type = String)]
    entity_type_id: VersionedUri,
    actor_id: UpdatedById,
}

#[utoipa::path(
    put,
    path = "/entities",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity", body = PersistedEntityMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity ID or Entity Type URI was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityRequest,
)]
async fn update_entity<P: StorePool + Send>(
    body: Json<UpdateEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedEntityMetadata>, StatusCode> {
    let Json(UpdateEntityRequest {
        entity,
        entity_id,
        entity_type_id,
        actor_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_entity(entity_id, entity, entity_type_id, actor_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update entity");

            if report.contains::<QueryError>() || report.contains::<EntityDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}
