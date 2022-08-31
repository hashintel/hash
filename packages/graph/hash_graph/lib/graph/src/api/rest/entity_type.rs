//! Web routes for CRU operations on Entity types.

use std::sync::Arc;

use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Extension, Json, Router,
};
use error_stack::IntoReport;
use serde::{Deserialize, Serialize};
use type_system::{uri::VersionedUri, EntityType};
use utoipa::{Component, OpenApi};

use crate::{
    api::rest::{api_resource::RoutedResource, read_from_store},
    ontology::{AccountId, PersistedEntityType, PersistedOntologyIdentifier},
    store::{
        error::{BaseUriAlreadyExists, BaseUriDoesNotExist},
        query::EntityTypeQuery,
        EntityTypeStore, StorePool,
    },
};

#[derive(OpenApi)]
#[openapi(
    handlers(
        create_entity_type,
        get_entity_type,
        get_latest_entity_types,
        update_entity_type
    ),
    components(
        CreateEntityTypeRequest,
        UpdateEntityTypeRequest,
        AccountId,
        PersistedOntologyIdentifier,
        PersistedEntityType
    ),
    tags(
        (name = "EntityType", description = "Entity type management API")
    )
)]
pub struct EntityTypeResource;

impl RoutedResource for EntityTypeResource {
    /// Create routes for interacting with entity types.
    fn routes<P: StorePool + Send + 'static>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entity-types",
            Router::new()
                .route(
                    "/",
                    post(create_entity_type::<P>)
                        .get(get_latest_entity_types::<P>)
                        .put(update_entity_type::<P>),
                )
                .route("/:version_id", get(get_entity_type::<P>)),
        )
    }
}

#[derive(Serialize, Deserialize, Component)]
#[serde(rename_all = "camelCase")]
struct CreateEntityTypeRequest {
    #[component(value_type = VAR_ENTITY_TYPE)]
    schema: serde_json::Value,
    account_id: AccountId,
}

#[utoipa::path(
    post,
    path = "/entity-types",
    request_body = CreateEntityTypeRequest,
    tag = "EntityType",
    responses(
        (status = 201, content_type = "application/json", description = "The schema of the created entity type", body = PersistedOntologyIdentifier),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create entity type in the datastore as the base entity type ID already exists"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = CreateEntityTypeRequest,
)]
async fn create_entity_type<P: StorePool + Send>(
    body: Json<CreateEntityTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedOntologyIdentifier>, StatusCode> {
    let Json(CreateEntityTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let entity_type: EntityType = schema.try_into().into_report().map_err(|report| {
        tracing::error!(error=?report, "Couldn't convert schema to Entity Type");
        // Shame there isn't an UNPROCESSABLE_ENTITY_TYPE code :D
        StatusCode::UNPROCESSABLE_ENTITY // TODO - Do we want to return a 400 instead
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    store
        .create_entity_type(entity_type, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create entity type");

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
    path = "/entity-types",
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", description = "List of all entity types at their latest versions", body = [PersistedEntityType]),

        (status = 500, description = "Datastore error occurred"),
    )
)]
async fn get_latest_entity_types<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
) -> Result<Json<Vec<PersistedEntityType>>, StatusCode> {
    read_from_store(pool.as_ref(), &EntityTypeQuery::new().by_latest_version())
        .await
        .map(Json)
}

#[utoipa::path(
    get,
    path = "/entity-types/{uri}",
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the requested entity type", body = PersistedEntityType),
        (status = 422, content_type = "text/plain", description = "Provided URI is invalid"),

        (status = 404, description = "Entity type was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    params(
        ("uri" = String, Path, description = "The URI of the entity type"),
    )
)]
async fn get_entity_type<P: StorePool + Send>(
    uri: Path<VersionedUri>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedEntityType>, StatusCode> {
    read_from_store(
        pool.as_ref(),
        &EntityTypeQuery::new()
            .by_uri(uri.base_uri())
            .by_version(uri.version()),
    )
    .await
    .and_then(|mut entity_types| entity_types.pop().ok_or(StatusCode::NOT_FOUND))
    .map(Json)
}

#[derive(Component, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateEntityTypeRequest {
    #[component(value_type = VAR_ENTITY_TYPE)]
    schema: serde_json::Value,
    account_id: AccountId,
}

#[utoipa::path(
    put,
    path = "/entity-types",
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", description = "The schema of the updated entity type", body = PersistedOntologyIdentifier),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base entity type ID was not found"),
        (status = 500, description = "Datastore error occurred"),
    ),
    request_body = UpdateEntityTypeRequest,
)]
async fn update_entity_type<P: StorePool + Send>(
    body: Json<UpdateEntityTypeRequest>,
    pool: Extension<Arc<P>>,
) -> Result<Json<PersistedOntologyIdentifier>, StatusCode> {
    let Json(UpdateEntityTypeRequest { schema, account_id }) = body;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let entity_type: EntityType = schema.try_into().into_report().map_err(|report| {
        tracing::error!(error=?report, "Couldn't convert schema to Entity Type");
        // Shame there isn't an UNPROCESSABLE_ENTITY_TYPE code :D
        StatusCode::UNPROCESSABLE_ENTITY // TODO - Do we want to return a 400 instead
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    store
        .update_entity_type(entity_type, account_id)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update entity type");

            if report.contains::<BaseUriDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}
