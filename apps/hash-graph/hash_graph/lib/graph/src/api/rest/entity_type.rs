//! Web routes for CRU operations on Entity types.

use std::sync::Arc;

use axum::{http::StatusCode, routing::post, Extension, Json, Router};
use error_stack::IntoReport;
use futures::TryFutureExt;
use serde::{Deserialize, Serialize};
use type_system::{repr, uri::VersionedUri, EntityType};
use utoipa::{OpenApi, ToSchema};

use crate::{
    api::rest::{
        api_resource::RoutedResource, report_to_status_code, utoipa_typedef::subgraph::Subgraph,
    },
    ontology::{
        domain_validator::{DomainValidator, ValidateOntologyType},
        patch_id_and_parse, EntityTypeQueryToken, EntityTypeWithMetadata, OntologyElementMetadata,
    },
    provenance::{OwnedById, UpdatedById},
    store::{
        error::{BaseUriAlreadyExists, BaseUriDoesNotExist},
        EntityTypeStore, StorePool,
    },
    subgraph::query::{EntityTypeStructuralQuery, StructuralQuery},
};

#[derive(OpenApi)]
#[openapi(
    paths(
        create_entity_type,
        get_entity_types_by_query,
        update_entity_type
    ),
    components(
        schemas(
            EntityTypeWithMetadata,

            CreateEntityTypeRequest,
            UpdateEntityTypeRequest,
            EntityTypeQueryToken,
            EntityTypeStructuralQuery,
        )
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
                    post(create_entity_type::<P>).put(update_entity_type::<P>),
                )
                .route("/query", post(get_entity_types_by_query::<P>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct CreateEntityTypeRequest {
    #[schema(value_type = VAR_ENTITY_TYPE)]
    schema: repr::EntityType,
    owned_by_id: OwnedById,
    actor_id: UpdatedById,
}

#[utoipa::path(
    post,
    path = "/entity-types",
    request_body = CreateEntityTypeRequest,
    tag = "EntityType",
    responses(
        (status = 201, content_type = "application/json", description = "The metadata of the created entity type", body = OntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create entity type in the datastore as the base entity type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = CreateEntityTypeRequest,
)]
#[tracing::instrument(level = "info", skip(pool, domain_validator))]
async fn create_entity_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreateEntityTypeRequest>,
) -> Result<Json<OntologyElementMetadata>, StatusCode> {
    let Json(CreateEntityTypeRequest {
        schema,
        owned_by_id,
        actor_id,
    }) = body;

    let entity_type: EntityType = schema.try_into().into_report().map_err(|report| {
        tracing::error!(error=?report, "Couldn't convert schema to Entity Type");
        // Shame there isn't an UNPROCESSABLE_ENTITY_TYPE code :D
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    domain_validator.validate(&entity_type).map_err(|report| {
        tracing::error!(error=?report, id=entity_type.id().to_string(), "Entity Type ID failed to validate");
        StatusCode::UNPROCESSABLE_ENTITY
    })?;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .create_entity_type(entity_type, owned_by_id, actor_id)
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
    post,
    path = "/entity-types/query",
    request_body = EntityTypeStructuralQuery,
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", body = Subgraph, description = "A subgraph rooted at entity types that satisfy the given query, each resolved to the requested depth."),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(pool))]
async fn get_entity_types_by_query<P: StorePool + Send>(
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
                .get_entity_type(&query)
                .await
                .map_err(|report| {
                    tracing::error!(error=?report, ?query, "Could not read entity types from the store");
                    report_to_status_code(&report)
                })
        })
        .await
        .map(|subgraph| Json(subgraph.into()))
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct UpdateEntityTypeRequest {
    #[schema(value_type = VAR_UPDATE_ENTITY_TYPE)]
    schema: serde_json::Value,
    #[schema(value_type = String)]
    type_to_update: VersionedUri,
    actor_id: UpdatedById,
}

#[utoipa::path(
    put,
    path = "/entity-types",
    tag = "EntityType",
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity type", body = OntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base entity type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityTypeRequest,
)]
#[tracing::instrument(level = "info", skip(pool))]
async fn update_entity_type<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    body: Json<UpdateEntityTypeRequest>,
) -> Result<Json<OntologyElementMetadata>, StatusCode> {
    let Json(UpdateEntityTypeRequest {
        schema,
        type_to_update,
        actor_id,
    }) = body;

    let new_type_id = VersionedUri::new(
        type_to_update.base_uri().clone(),
        type_to_update.version() + 1,
    );

    let entity_type = patch_id_and_parse(&new_type_id, schema).map_err(|report| {
        tracing::error!(error=?report, "Couldn't convert schema to Entity Type");
        // Shame there isn't an UNPROCESSABLE_ENTITY_TYPE code :D
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    let mut store = pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_entity_type(entity_type, actor_id)
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
