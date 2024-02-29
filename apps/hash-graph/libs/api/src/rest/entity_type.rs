//! Web routes for CRU operations on Entity types.

#![expect(clippy::str_to_string)]

use std::{collections::hash_map, sync::Arc};

use authorization::{
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    schema::{
        EntityTypeEditorSubject, EntityTypeId, EntityTypeInstantiatorSubject,
        EntityTypeOwnerSubject, EntityTypePermission, EntityTypeRelationAndSubject,
        EntityTypeSetting, EntityTypeSettingSubject, EntityTypeViewerSubject,
    },
    zanzibar::Consistency,
    AuthorizationApi, AuthorizationApiPool,
};
use axum::{
    extract::{OriginalUri, Path, Query},
    http::{header::LINK, HeaderMap, StatusCode},
    response::Response,
    routing::{get, post, put},
    Extension, Router,
};
use error_stack::{Report, ResultExt};
use graph::{
    ontology::{
        domain_validator::{DomainValidator, ValidateOntologyType},
        patch_id_and_parse, EntityTypeQueryToken,
    },
    store::{
        error::{BaseUrlAlreadyExists, OntologyVersionDoesNotExist, VersionedUrlAlreadyExists},
        ontology::{
            ArchiveEntityTypeParams, CreateEntityTypeParams, GetEntityTypesParams,
            UnarchiveEntityTypeParams, UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
        },
        ConflictBehavior, EntityTypeStore, StorePool,
    },
    subgraph::{
        identifier::EntityTypeVertexId,
        query::{EntityTypeStructuralQuery, StructuralQuery},
    },
};
use graph_types::{
    ontology::{
        EntityTypeEmbedding, EntityTypeMetadata, EntityTypeWithMetadata, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, OntologyTypeMetadata, OntologyTypeReference,
    },
    owned_by_id::OwnedById,
};
use hash_map::HashMap;
use serde::{Deserialize, Serialize};
use temporal_client::TemporalClient;
use time::OffsetDateTime;
use type_system::{
    url::{BaseUrl, VersionedUrl},
    EntityType,
};
use utoipa::{OpenApi, ToSchema};

use crate::{
    error::{ErrorInfo, Status, StatusPayloads},
    rest::{
        api_resource::RoutedResource,
        json::Json,
        status::{report_to_response, status_to_response},
        utoipa_typedef::{subgraph::Subgraph, ListOrValue, MaybeListOfEntityType},
        AuthenticatedUserHeader, Cursor, Pagination, PermissionResponse, RestApiStore,
    },
};

#[derive(OpenApi)]
#[openapi(
    paths(
        get_entity_type_authorization_relationships,
        modify_entity_type_authorization_relationships,
        check_entity_type_permission,

        create_entity_type,
        load_external_entity_type,
        get_entity_types_by_query,
        update_entity_type,
        update_entity_type_embeddings,
        archive_entity_type,
        unarchive_entity_type,
    ),
    components(
        schemas(
            EntityTypeWithMetadata,
            EntityTypeSetting,

            EntityTypeSettingSubject,
            EntityTypeOwnerSubject,
            EntityTypeEditorSubject,
            EntityTypeViewerSubject,
            EntityTypeInstantiatorSubject,
            EntityTypePermission,
            EntityTypeRelationAndSubject,
            ModifyEntityTypeAuthorizationRelationship,
            EntityTypeEmbedding,

            CreateEntityTypeRequest,
            LoadExternalEntityTypeRequest,
            UpdateEntityTypeRequest,
            UpdateEntityTypeEmbeddingParams,
            EntityTypeQueryToken,
            EntityTypeStructuralQuery,
            ArchiveEntityTypeParams,
            UnarchiveEntityTypeParams,
        )
    ),
    tags(
        (name = "EntityType", description = "Entity type management API")
    )
)]
pub(crate) struct EntityTypeResource;

impl RoutedResource for EntityTypeResource {
    /// Create routes for interacting with entity types.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'pool> S::Store<'pool>: RestApiStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/entity-types",
            Router::new()
                .route(
                    "/",
                    post(create_entity_type::<S, A>).put(update_entity_type::<S, A>),
                )
                .route(
                    "/relationships",
                    post(modify_entity_type_authorization_relationships::<A>),
                )
                .nest(
                    "/:entity_type_id",
                    Router::new()
                        .route(
                            "/relationships",
                            get(get_entity_type_authorization_relationships::<A>),
                        )
                        .route(
                            "/permissions/:permission",
                            get(check_entity_type_permission::<A>),
                        ),
                )
                .route("/query", post(get_entity_types_by_query::<S, A>))
                .route("/load", post(load_external_entity_type::<S, A>))
                .route("/archive", put(archive_entity_type::<S, A>))
                .route("/unarchive", put(unarchive_entity_type::<S, A>))
                .route("/embeddings", post(update_entity_type_embeddings::<S, A>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateEntityTypeRequest {
    #[schema(inline)]
    schema: MaybeListOfEntityType,
    owned_by_id: OwnedById,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    label_property: Option<BaseUrl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    relationships: Vec<EntityTypeRelationAndSubject>,
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ModifyEntityTypeAuthorizationRelationship {
    operation: ModifyRelationshipOperation,
    resource: VersionedUrl,
    relation_and_subject: EntityTypeRelationAndSubject,
}

#[utoipa::path(
    post,
    path = "/entity-types/relationships",
    tag = "EntityType",
    request_body = [ModifyEntityTypeAuthorizationRelationship],
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, description = "The relationship was modified for the entity"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn modify_entity_type_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    relationships: Json<Vec<ModifyEntityTypeAuthorizationRelationship>>,
) -> Result<StatusCode, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let (entity_types, operations): (Vec<_>, Vec<_>) = relationships
        .0
        .into_iter()
        .map(|request| {
            let resource = EntityTypeId::from_url(&request.resource);
            (
                resource,
                (request.operation, resource, request.relation_and_subject),
            )
        })
        .unzip();

    let (permissions, _zookie) = authorization_api
        .check_entity_types_permission(
            actor_id,
            EntityTypePermission::Update,
            entity_types,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(report_to_response)?;

    let mut failed = false;
    // TODO: Change interface for `check_entity_types_permission` to avoid this loop
    for (_entity_type_id, has_permission) in permissions {
        if !has_permission {
            tracing::error!("Insufficient permissions to modify relationship for entity type");
            failed = true;
        }
    }

    if failed {
        return Err(report_to_response(
            Report::new(PermissionAssertion).attach(hash_status::StatusCode::PermissionDenied),
        ));
    }

    // for request in relationships.0 {
    authorization_api
        .modify_entity_type_relations(operations)
        .await
        .map_err(report_to_response)?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/entity-types/{entity_type_id}/relationships",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_type_id" = VersionedUrl, Path, description = "The Entity type to read the relations for"),
    ),
    responses(
        (status = 200, description = "The relations of the entity type", body = [EntityTypeRelationAndSubject]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_entity_type_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(entity_type_id): Path<VersionedUrl>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<Vec<EntityTypeRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    Ok(Json(
        authorization_api
            .get_entity_type_relations(
                EntityTypeId::from_url(&entity_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?,
    ))
}

#[utoipa::path(
    get,
    path = "/entity-types/{entity_type_id}/permissions/{permission}",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("entity_type_id" = VersionedUrl, Path, description = "The entity type ID to check if the actor has the permission"),
        ("permission" = EntityTypePermission, Path, description = "The permission to check for"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor has the permission for the entity type"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn check_entity_type_permission<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((entity_type_id, permission)): Path<(VersionedUrl, EntityTypePermission)>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<PermissionResponse>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    Ok(Json(PermissionResponse {
        has_permission: authorization_api_pool
            .acquire()
            .await
            .map_err(report_to_response)?
            .check_entity_type_permission(
                actor_id,
                permission,
                EntityTypeId::from_url(&entity_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?
            .has_permission,
    }))
}

#[utoipa::path(
    post,
    path = "/entity-types",
    request_body = CreateEntityTypeRequest,
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the created entity type", body = MaybeListOfEntityTypeMetadata),
        (status = 400, content_type = "application/json", description = "Provided request body is invalid", body = VAR_STATUS),

        (status = 409, content_type = "application/json", description = "Unable to create entity type in the datastore as the base entity type ID already exists", body = VAR_STATUS),
        (status = 500, content_type = "application/json", description = "Store error occurred", body = VAR_STATUS),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, domain_validator)
)]
async fn create_entity_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreateEntityTypeRequest>,
    // TODO: We want to be able to return `Status` here we should try and create a general way to
    //  call `status_to_response` for our routes that return Status
) -> Result<Json<ListOrValue<EntityTypeMetadata>>, Response>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool>: RestApiStore,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        status_to_response(Status::new(
            hash_status::StatusCode::Internal,
            Some(
                "Could not acquire store. This is an internal error, please report to the \
                 developers of the HASH Graph with whatever information you can provide including \
                 request details and logs."
                    .to_owned(),
            ),
            vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                // TODO: add information from the report here
                //   https://app.asana.com/0/1203363157432094/1203639884730779/f
                HashMap::new(),
                // TODO: We should encapsulate these Reasons within the type system, perhaps
                //  requiring top level contexts to implement a trait `ErrorReason::to_reason`
                //  or perhaps as a big enum, or as an attachment
                "STORE_ACQUISITION_FAILURE".to_owned(),
            ))],
        ))
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        status_to_response(Status::new(
            hash_status::StatusCode::Internal,
            Some(
                "Could not acquire authorization API. This is an internal error, please report to \
                 the developers of the HASH Graph with whatever information you can provide \
                 including request details and logs."
                    .to_owned(),
            ),
            vec![],
        ))
    })?;

    let Json(CreateEntityTypeRequest {
        schema,
        owned_by_id,
        label_property,
        icon,
        relationships,
    }) = body;

    let is_list = matches!(&schema, ListOrValue::List(_));

    let mut metadata = store
        .create_entity_types(
            actor_id,
            &mut authorization_api,
            temporal_client.as_deref(),
            schema.into_iter().map(|schema| {
                domain_validator.validate(&schema).map_err(|report| {
                    tracing::error!(error=?report, id=schema.id().to_string(), "Entity Type ID failed to validate");
                    status_to_response(Status::new(
                        hash_status::StatusCode::InvalidArgument,
                        Some("Entity Type ID failed to validate against the given domain regex. Are you sure the service is able to host a type under the domain you supplied?".to_owned()),
                        vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                            HashMap::from([
                                (
                                    "entityTypeId".to_owned(),
                                    serde_json::to_value(schema.id().to_string())
                                        .expect("Could not serialize entity type id"),
                                ),
                            ]),
                            // TODO: We should encapsulate these Reasons within the type system, perhaps
                            //  requiring top level contexts to implement a trait `ErrorReason::to_reason`
                            //  or perhaps as a big enum
                            "INVALID_TYPE_ID".to_owned()
                        ))],
                    ))
                })?;

                Ok(CreateEntityTypeParams {
                    schema,
                    classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
                    relationships: relationships.clone(),
                    icon: icon.clone(),
                    label_property: label_property.clone(),
                    conflict_behavior: ConflictBehavior::Fail,
                })
            }).collect::<Result<Vec<_>, _>>()?
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create entity types");

            if report.contains::<PermissionAssertion>() {
                return status_to_response(Status::new(
                    hash_status::StatusCode::PermissionDenied,
                    Some("Permission denied".to_owned()),
                    vec![],
                ));
            }
            if report.contains::<BaseUrlAlreadyExists>() {
                let metadata =
                    report
                        .request_ref::<BaseUrl>()
                        .next()
                        .map_or_else(HashMap::new, |base_url| {
                            let base_url = base_url.to_string();
                            HashMap::from([(
                                "baseUrl".to_owned(),
                                serde_json::to_value(base_url)
                                    .expect("Could not serialize base url"),
                            )])
                        });

                return status_to_response(Status::new(
                    hash_status::StatusCode::AlreadyExists,
                    Some(
                        "Could not create entity type as the base URI already existed, perhaps \
                         you intended to call `updateEntityType` instead?"
                            .to_owned(),
                    ),
                    vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                        metadata,
                        // TODO: We should encapsulate these Reasons within the type system,
                        //  perhaps requiring top level contexts to implement a trait
                        //  `ErrorReason::to_reason` or perhaps as a big enum, or as an attachment
                        "BASE_URI_ALREADY_EXISTS".to_owned(),
                    ))],
                ));
            }

            // Insertion/update errors are considered internal server errors.
            status_to_response(Status::new(
                hash_status::StatusCode::Internal,
                Some(
                    "Internal error, please report to the developers of the HASH Graph with \
                     whatever information you can provide including request details and logs."
                        .to_owned(),
                ),
                vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                    HashMap::new(),
                    // TODO: We should encapsulate these Reasons within the type system, perhaps
                    //  requiring top level contexts to implement a trait
                    //  `ErrorReason::to_reason` or perhaps as a big enum, or as an attachment
                    "INTERNAL".to_owned(),
                ))],
            ))
        })?;

    if is_list {
        Ok(Json(ListOrValue::List(metadata)))
    } else {
        Ok(Json(ListOrValue::Value(
            metadata.pop().expect("metadata does not contain a value"),
        )))
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
enum LoadExternalEntityTypeRequest {
    #[serde(rename_all = "camelCase")]
    Fetch { entity_type_id: VersionedUrl },
    Create {
        #[schema(value_type = VAR_ENTITY_TYPE)]
        schema: EntityType,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        label_property: Option<BaseUrl>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        icon: Option<String>,
        relationships: Vec<EntityTypeRelationAndSubject>,
    },
}

#[utoipa::path(
    post,
    path = "/entity-types/load",
    request_body = LoadExternalEntityTypeRequest,
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the created entity type", body = EntityTypeMetadata),
        (status = 400, content_type = "application/json", description = "Provided request body is invalid", body = VAR_STATUS),

        (status = 409, content_type = "application/json", description = "Unable to load entity type in the datastore as the entity type ID already exists", body = VAR_STATUS),
        (status = 500, content_type = "application/json", description = "Store error occurred", body = VAR_STATUS),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, domain_validator)
)]
async fn load_external_entity_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    domain_validator: Extension<DomainValidator>,
    Json(request): Json<LoadExternalEntityTypeRequest>,
    // TODO: We want to be able to return `Status` here we should try and create a general way to
    //  call `status_to_response` for our routes that return Status
) -> Result<Json<EntityTypeMetadata>, Response>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool>: RestApiStore,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        status_to_response(Status::new(
            hash_status::StatusCode::Internal,
            Some(
                "Could not acquire store. This is an internal error, please report to the \
                 developers of the HASH Graph with whatever information you can provide including \
                 request details and logs."
                    .to_owned(),
            ),
            vec![StatusPayloads::ErrorInfo(ErrorInfo::new(
                // TODO: add information from the report here
                //   https://app.asana.com/0/1203363157432094/1203639884730779/f
                HashMap::new(),
                // TODO: We should encapsulate these Reasons within the type system, perhaps
                //  requiring top level contexts to implement a trait `ErrorReason::to_reason`
                //  or perhaps as a big enum, or as an attachment
                "STORE_ACQUISITION_FAILURE".to_owned(),
            ))],
        ))
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        status_to_response(Status::new(
            hash_status::StatusCode::Internal,
            Some(
                "Could not acquire authorization API. This is an internal error, please report to \
                 the developers of the HASH Graph with whatever information you can provide \
                 including request details and logs."
                    .to_owned(),
            ),
            vec![],
        ))
    })?;

    match request {
        LoadExternalEntityTypeRequest::Fetch { entity_type_id } => {
            let OntologyTypeMetadata::EntityType(metadata) = store
                .load_external_type(
                    actor_id,
                    &mut authorization_api,
                    temporal_client.as_deref(),
                    &domain_validator,
                    OntologyTypeReference::EntityTypeReference((&entity_type_id).into()),
                )
                .await?
            else {
                // TODO: Make the type fetcher typed
                panic!("`load_external_type` should have returned a `EntityTypeMetadata`");
            };
            Ok(Json(metadata))
        }
        LoadExternalEntityTypeRequest::Create {
            schema,
            label_property,
            icon,
            relationships,
        } => {
            if domain_validator.validate_url(schema.id().base_url.as_str()) {
                let error = "Ontology type is not external".to_owned();
                tracing::error!(id=%schema.id(), error);
                return Err(status_to_response(Status::new(
                    hash_status::StatusCode::InvalidArgument,
                    Some(error),
                    vec![],
                )));
            }

            Ok(Json(
                store
                    .create_entity_type(
                        actor_id,
                        &mut authorization_api,
                        temporal_client.as_deref(),
                        CreateEntityTypeParams {
                            schema,
                            label_property,
                            icon,
                            classification: OntologyTypeClassificationMetadata::External {
                                fetched_at: OffsetDateTime::now_utc(),
                            },
                            relationships,
                            conflict_behavior: ConflictBehavior::Fail,
                        },
                    )
                    .await
                    .map_err(report_to_response)?,
            ))
        }
    }
}

#[utoipa::path(
    post,
    path = "/entity-types/query",
    request_body = EntityTypeStructuralQuery,
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = Subgraph,
            description = "A subgraph rooted at entity types that satisfy the given query, each resolved to the requested depth.",
            headers(
                ("Link" = String, description = "The link to be used to query the next page of entity types"),
            ),
        ),
        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool, query))]
async fn get_entity_types_by_query<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Query(pagination): Query<Pagination<EntityTypeVertexId>>,
    OriginalUri(uri): OriginalUri,
    Json(query): Json<serde_json::Value>,
) -> Result<(HeaderMap, Json<Subgraph>), Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let store = store_pool.acquire().await.map_err(report_to_response)?;

    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let mut query = StructuralQuery::deserialize(&query).map_err(report_to_response)?;
    query
        .filter
        .convert_parameters()
        .map_err(report_to_response)?;

    let subgraph = store
        .get_entity_type(
            actor_id,
            &authorization_api,
            GetEntityTypesParams {
                query,
                after: pagination.after.map(|cursor| cursor.0),
                limit: pagination.limit,
            },
        )
        .await
        .map_err(report_to_response)?;

    let cursor = subgraph.roots.iter().last().map(Cursor);
    let mut headers = HeaderMap::new();
    if let (Some(cursor), Some(limit)) = (cursor, pagination.limit) {
        headers.insert(LINK, cursor.link_header("next", uri, limit)?);
    }
    Ok((headers, Json(Subgraph::from(subgraph))))
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateEntityTypeRequest {
    #[schema(value_type = VAR_UPDATE_ENTITY_TYPE)]
    schema: serde_json::Value,
    type_to_update: VersionedUrl,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    label_property: Option<BaseUrl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    relationships: Vec<EntityTypeRelationAndSubject>,
}

#[utoipa::path(
    put,
    path = "/entity-types",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("after" = Option<String>, Query, description = "The cursor to start reading from"),
        ("limit" = Option<usize>, Query, description = "The maximum number of entity types to read"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity type", body = EntityTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base entity type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityTypeRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_entity_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    temporal_client: Extension<Option<Arc<TemporalClient>>>,
    body: Json<UpdateEntityTypeRequest>,
) -> Result<Json<EntityTypeMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UpdateEntityTypeRequest {
        schema,
        mut type_to_update,
        label_property,
        icon,
        relationships,
    }) = body;

    type_to_update.version += 1;

    let entity_type = patch_id_and_parse(&type_to_update, schema).map_err(|report| {
        tracing::error!(error=?report, "Couldn't convert schema to Entity Type");
        // Shame there isn't an UNPROCESSABLE_ENTITY_TYPE code :D
        StatusCode::UNPROCESSABLE_ENTITY
        // TODO - We should probably return more information to the client
        //  https://app.asana.com/0/1201095311341924/1202574350052904/f
    })?;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .update_entity_type(
            actor_id,
            &mut authorization_api,
            temporal_client.as_deref(),
            UpdateEntityTypesParams {
                schema: entity_type,
                label_property,
                icon,
                relationships,
            },
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update entity type");

            if report.contains::<PermissionAssertion>() {
                return StatusCode::FORBIDDEN;
            }
            if report.contains::<OntologyVersionDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[utoipa::path(
    post,
    path = "/entity-types/embeddings",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, content_type = "application/json", description = "The embeddings were created"),

        (status = 403, description = "Insufficient permissions to update the entity type"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdateEntityTypeEmbeddingParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_entity_type_embeddings<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Json(body): Json<serde_json::Value>,
) -> Result<(), Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = UpdateEntityTypeEmbeddingParams::deserialize(body)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .update_entity_type_embeddings(actor_id, &mut authorization_api, params)
        .await
        .map_err(report_to_response)
}

#[utoipa::path(
    put,
    path = "/entity-types/archive",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated entity type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity type ID was not found"),
        (status = 409, description = "Entity type ID is already archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = ArchiveEntityTypeParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn archive_entity_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<OntologyTemporalMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = ArchiveEntityTypeParams::deserialize(body)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .archive_entity_type(actor_id, &mut authorization_api, params)
        .await
        .map_err(|mut report| {
            if report.contains::<OntologyVersionDoesNotExist>() {
                report = report.attach(hash_status::StatusCode::NotFound);
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                report = report.attach(hash_status::StatusCode::AlreadyExists);
            }
            report_to_response(report)
        })
        .map(Json)
}

#[utoipa::path(
    put,
    path = "/entity-types/unarchive",
    tag = "EntityType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The temporal metadata of the updated entity type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Entity type ID was not found"),
        (status = 409, description = "Entity type ID already exists and is not archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UnarchiveEntityTypeParams,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn unarchive_entity_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<OntologyTemporalMetadata>, Response>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    // Manually deserialize the request from a JSON value to allow borrowed deserialization and
    // better error reporting.
    let params = UnarchiveEntityTypeParams::deserialize(body)
        .attach(hash_status::StatusCode::InvalidArgument)
        .map_err(report_to_response)?;

    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    store
        .unarchive_entity_type(actor_id, &mut authorization_api, params)
        .await
        .map_err(|mut report| {
            if report.contains::<OntologyVersionDoesNotExist>() {
                report = report.attach(hash_status::StatusCode::NotFound);
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                report = report.attach(hash_status::StatusCode::AlreadyExists);
            }
            report_to_response(report)
        })
        .map(Json)
}
