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

use crate::{
    api::rest::{api_resource::RoutedResource, read_from_store, report_to_status_code},
    knowledge::{
        Entity, EntityMetadata, EntityProperties, EntityQueryToken, EntityUuid, LinkEntityMetadata,
        LinkOrder,
    },
    provenance::{CreatedById, OwnedById, ProvenanceMetadata, UpdatedById},
    shared::{
        identifier::{
            knowledge::{EntityEditionId, EntityId, EntityIdAndTimestamp, EntityVersion},
            GraphElementEditionId, GraphElementId,
        },
        subgraph::{
            depths::GraphResolveDepths,
            edges::{
                Edges, KnowledgeGraphEdgeKind, KnowledgeGraphOutwardEdges,
                KnowledgeGraphRootedEdges, OntologyEdgeKind, OntologyOutwardEdges,
                OntologyRootedEdges, OutwardEdge, SharedEdgeKind,
            },
            query::StructuralQuery,
            vertices::{
                KnowledgeGraphVertex, KnowledgeGraphVertices, OntologyVertex, OntologyVertices,
                Vertex, Vertices,
            },
        },
    },
    store::{
        error::{EntityDoesNotExist, QueryError},
        query::Filter,
        EntityStore, StorePool,
    },
    subgraph::{query::EntityStructuralQuery, Subgraph},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity,
        get_entities_by_query,
        get_entity,
        get_latest_entities,
        update_entity,
        archive_entity
    ),
    components(
        schemas(
            OwnedById,
            CreatedById,
            UpdatedById,
            CreateEntityRequest,
            UpdateEntityRequest,
            ArchiveEntityRequest,
            EntityUuid,
            EntityId,
            EntityEditionId,
            EntityIdAndTimestamp,
            EntityMetadata,
            Entity,
            EntityProperties,
            EntityVersion,
            EntityStructuralQuery,
            EntityQueryToken,
            LinkEntityMetadata,
            LinkOrder,
            ProvenanceMetadata,
            GraphElementId,
            GraphElementEditionId,
            OntologyVertex,
            KnowledgeGraphVertex,
            Vertex,
            KnowledgeGraphVertices,
            OntologyVertices,
            Vertices,
            SharedEdgeKind,
            KnowledgeGraphEdgeKind,
            OntologyEdgeKind,
            OutwardEdge,
            OntologyOutwardEdges,
            KnowledgeGraphOutwardEdges,
            OntologyRootedEdges,
            KnowledgeGraphRootedEdges,
            Edges,
            GraphResolveDepths,
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
                .route("/archive", post(archive_entity::<P>))
                .route("/query", post(get_entities_by_query::<P>))
                .route("/:entity_uuid", get(get_entity::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreateEntityRequest {
    properties: EntityProperties,
    #[schema(value_type = String)]
    entity_type_id: VersionedUri,
    owned_by_id: OwnedById,
    entity_uuid: Option<EntityUuid>,
    actor_id: CreatedById,
    // TODO: this could break invariants if we don't move to fractional indexing
    //  https://app.asana.com/0/1201095311341924/1202085856561975/f
    #[serde(default, skip_serializing_if = "Option::is_none")]
    link_metadata: Option<LinkEntityMetadata>,
}

#[utoipa::path(
    post,
    path = "/entities",
    request_body = CreateEntityRequest,
    tag = "Entity",
    responses(
        (status = 201, content_type = "application/json", description = "The metadata of the created entity", body = EntityMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity Type URI was not found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
async fn create_entity<P: StorePool + Send>(
    body: Json<CreateEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<EntityMetadata>, StatusCode> {
    let Json(CreateEntityRequest {
        properties,
        entity_type_id,
        owned_by_id,
        entity_uuid,
        actor_id,
        link_metadata,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_entity(
            properties,
            entity_type_id,
            owned_by_id,
            entity_uuid,
            actor_id,
            link_metadata,
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create entity");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[derive(Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ArchiveEntityRequest {
    entity_id: EntityId,
    actor_id: UpdatedById,
}

#[utoipa::path(
    post,
    path = "/entities/archive",
    request_body = ArchiveEntityRequest,
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "No response"),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity could not be found"),
        (status = 500, description = "Store error occurred"),
    ),
)]
async fn archive_entity<P: StorePool + Send>(
    body: Json<ArchiveEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<(), StatusCode> {
    let Json(ArchiveEntityRequest {
        entity_id,
        actor_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .archive_entity(entity_id, actor_id)
        .await
        .map_err(|report| {
            if report.contains::<QueryError>() {
                return StatusCode::NOT_FOUND;
            }

            tracing::error!(error=?report, "Could not archive entity");

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
}

#[utoipa::path(
    post,
    path = "/entities/query",
    request_body = EntityStructuralQuery,
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", body = Subgraph, description = "A subgraph rooted at entities that satisfy the given query, each resolved to the requested depth."),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_entities_by_query<P: StorePool + Send>(
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
        (status = 200, content_type = "application/json", description = "List of all entities", body = [Entity]),

        (status = 500, description = "Store error occurred"),
    )
)]
async fn get_latest_entities<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<Entity>>, StatusCode> {
    read_from_store(pool.as_ref(), &Filter::<Entity>::for_all_latest_entities())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entities/{entityId}",
    tag = "Entity",
    responses(
        (status = 200, content_type = "application/json", description = "The latest version of the requested entity", body = Entity),

        (status = 400, content_type = "text/plain", description = "Provided entity id is invalid"),
        (status = 404, description = "Entity was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    params(
        ("entityId" = EntityId, Path, description = "The EntityId"),
    )
)]
async fn get_entity<P: StorePool + Send>(
    Path(entity_id): Path<EntityId>,
    pool: Extension<Arc<P>>,
) -> Result<Json<Entity>, StatusCode> {
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
    properties: EntityProperties,
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
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity", body = EntityMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity ID or Entity Type URI was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityRequest,
)]
async fn update_entity<P: StorePool + Send>(
    body: Json<UpdateEntityRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<EntityMetadata>, StatusCode> {
    let Json(UpdateEntityRequest {
        properties,
        entity_id,
        entity_type_id,
        actor_id,
    }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_entity(entity_id, properties, entity_type_id, actor_id)
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
