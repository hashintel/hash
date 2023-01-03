use std::sync::Arc;

use axum::{http::StatusCode, routing::put, Extension, Json, Router};
use error_stack::IntoReport;
use serde::{Deserialize, Serialize};
use type_system::{EntityType, PropertyType};
use utoipa::{OpenApi, ToSchema};

use crate::{
    api::rest::{
        api_resource::RoutedResource, data_type::CreateDataTypeRequest,
        entity::CreateEntityRequest, entity_type::CreateEntityTypeRequest,
        property_type::CreatePropertyTypeRequest, DomainValidator,
    },
    ontology::domain_validator::ValidateOntologyType,
    store::{
        BaseUriAlreadyExists, EntityStore, EntityTypeStore, PropertyTypeStore, Store, StorePool,
    },
};

#[derive(OpenApi)]
#[openapi(
    paths(
        batched_insert,
    ),
    components(
        schemas(
            InsertBatchRequest,
        )
    ),
    tags(
        (name = "Batch", description = "batch-creation management API")
    )
)]
pub struct BatchResource;

impl RoutedResource for BatchResource {
    /// Create routes for batch-creation of graph elements.
    fn routes<P: StorePool + Send + 'static>() -> Router {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest("/batch", Router::new().route("/", put(batched_insert::<P>)))
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct InsertBatchRequest {
    create_data_type_requests: Vec<CreateDataTypeRequest>,
    create_property_type_requests: Vec<CreatePropertyTypeRequest>,
    create_entity_type_requests: Vec<CreateEntityTypeRequest>,
    create_entity_requests: Vec<CreateEntityRequest>,
}

#[utoipa::path(
    post,
    path = "/batch",
    request_body = InsertBatchRequest,
    tag = "Batch",
    responses(
        (status = 201, content_type = "application/json", description = "The vertices to insert", body = EntityMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(level = "info", skip(pool, domain_validator))]
async fn batched_insert<P: StorePool + Send>(
    pool: Extension<Arc<P>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<InsertBatchRequest>,
) -> Result<Json<()>, StatusCode> {
    let Json(InsertBatchRequest {
        create_data_type_requests,
        create_property_type_requests,
        create_entity_type_requests,
        create_entity_requests,
    }) = body;

    // TODO: do we have to acquire_owned here?
    let mut store = pool.acquire_owned().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut transaction = store.transaction().await.map_err(|report| {
        tracing::error!(error=?report, "Could not start transaction");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    for CreatePropertyTypeRequest {
        schema,
        owned_by_id,
        actor_id,
    } in create_property_type_requests
    {
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

        // match instead of `map_err` as we need async error handling logic
        match transaction
            // TODO: we don't need this clone if we check if it already exists
            .create_property_type(property_type.clone(), owned_by_id, actor_id)
            .await
        {
            Err(report) => {
                if report.contains::<BaseUriAlreadyExists>() {
                    transaction
                        .update_property_type(property_type, actor_id)
                        .await
                        .map_err(|report| {
                            tracing::error!(error=?report, "Could not update property type");
                            // Insertion/update errors are considered internal server errors.
                            StatusCode::INTERNAL_SERVER_ERROR
                        })?;
                    Ok(())
                } else {
                    tracing::error!(error=?report, "Could not create property type");
                    // Insertion/update errors are considered internal server errors.
                    Err(StatusCode::INTERNAL_SERVER_ERROR)
                }
            }
            ok_val => Ok(()),
        }
        .map(Json)?;
    }

    for CreateEntityTypeRequest {
        schema,
        owned_by_id,
        actor_id,
    } in create_entity_type_requests
    {
        let entity_type: EntityType = schema.try_into().into_report().map_err(|report| {
            tracing::error!(error=?report, "Couldn't convert schema to Entity Type");
            StatusCode::UNPROCESSABLE_ENTITY
            // TODO - We should probably return more information to the client
            //  https://app.asana.com/0/1201095311341924/1202574350052904/f
        })?;

        domain_validator
            .validate(&entity_type)
            .map_err(|report| {
                tracing::error!(error=?report, id=entity_type.id().to_string(), "Entity Type ID failed to validate");
                StatusCode::UNPROCESSABLE_ENTITY
            })?;

        match transaction
            // TODO: we don't need this clone if we check if it already exists
            .create_entity_type(entity_type.clone(), owned_by_id, actor_id)
            .await
        {
            Err(report) => {
                if report.contains::<BaseUriAlreadyExists>() {
                    transaction
                        .update_entity_type(entity_type, actor_id)
                        .await
                        .map_err(|report| {
                            tracing::error!(error=?report, "Could not update entity type");
                            // Insertion/update errors are considered internal server errors.
                            StatusCode::INTERNAL_SERVER_ERROR
                        })?;
                    Ok(())
                } else {
                    tracing::error!(error=?report, "Could not create entity type");
                    // Insertion/update errors are considered internal server errors.
                    Err(StatusCode::INTERNAL_SERVER_ERROR)
                }
            }
            ok_val => Ok(()),
        }
        .map(Json)?;
    }

    for CreateEntityRequest {
        properties,
        entity_type_id,
        owned_by_id,
        entity_uuid,
        actor_id,
        link_data,
    } in create_entity_requests
    {
        match transaction
            .create_entity(
                owned_by_id,
                entity_uuid,
                None,
                actor_id,
                false,
                entity_type_id,
                properties,
                link_data,
            )
            .await
        {
            Err(report) => {
                tracing::error!(error=?report, "Could not create entity");

                // TODO: handle existing entities
                // if report.contains::<TODO>() {
                //     transaction
                //         .update_entity(
                //             entity_id,
                //             None,
                //             actor_id,
                //             false,
                //             entity_type_id,
                //             properties,
                //             link_order,
                //         )
                //         .await
                //         .map_err(|report| {
                //             tracing::error!(error=?report, "Could not update entity");
                //             // Insertion/update errors are considered internal server errors.
                //             StatusCode::INTERNAL_SERVER_ERROR
                //         })
                // }

                // Insertion/update errors are considered internal server errors.
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
            ok_val => Ok(()),
        }
        .map(Json)?;
    }

    Ok(()).map(Json)
}
