//! Web routes for CRU operations on Property types.

#![expect(clippy::str_to_string)]

use std::sync::Arc;

use authorization::{
    backend::{ModifyRelationshipOperation, PermissionAssertion},
    schema::{
        PropertyTypeEditorSubject, PropertyTypeId, PropertyTypeOwnerSubject,
        PropertyTypePermission, PropertyTypeRelationAndSubject, PropertyTypeSetting,
        PropertyTypeSettingSubject, PropertyTypeViewerSubject,
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
use error_stack::Report;
use graph::{
    ontology::{
        domain_validator::{DomainValidator, ValidateOntologyType},
        patch_id_and_parse, PropertyTypeQueryToken,
    },
    store::{
        error::VersionedUrlAlreadyExists, BaseUrlAlreadyExists, ConflictBehavior,
        OntologyVersionDoesNotExist, PropertyTypeStore, StorePool,
    },
    subgraph::{
        identifier::PropertyTypeVertexId,
        query::{PropertyTypeStructuralQuery, StructuralQuery},
    },
};
use graph_types::{
    ontology::{
        OntologyTemporalMetadata, OntologyTypeClassificationMetadata, OntologyTypeMetadata,
        OntologyTypeRecordId, OntologyTypeReference, PartialPropertyTypeMetadata,
        PropertyTypeMetadata, PropertyTypeWithMetadata,
    },
    owned_by_id::OwnedById,
};
use hash_status::Status;
use serde::{Deserialize, Serialize};
use time::OffsetDateTime;
use type_system::{url::VersionedUrl, PropertyType};
use utoipa::{OpenApi, ToSchema};

use super::api_resource::RoutedResource;
use crate::rest::{
    json::Json,
    status::{report_to_response, status_to_response},
    utoipa_typedef::{subgraph::Subgraph, ListOrValue, MaybeListOfPropertyType},
    AuthenticatedUserHeader, Cursor, Pagination, PermissionResponse, RestApiStore,
};

#[derive(OpenApi)]
#[openapi(
    paths(
        get_property_type_authorization_relationships,
        modify_property_type_authorization_relationships,
        check_property_type_permission,

        create_property_type,
        load_external_property_type,
        get_property_types_by_query,
        update_property_type,
        archive_property_type,
        unarchive_property_type,
    ),
    components(
        schemas(
            PropertyTypeWithMetadata,
            PropertyTypeSetting,

            PropertyTypeSettingSubject,
            PropertyTypeOwnerSubject,
            PropertyTypeEditorSubject,
            PropertyTypeViewerSubject,
            PropertyTypePermission,
            PropertyTypeRelationAndSubject,
            ModifyPropertyTypeAuthorizationRelationship,

            CreatePropertyTypeRequest,
            LoadExternalPropertyTypeRequest,
            UpdatePropertyTypeRequest,
            PropertyTypeQueryToken,
            PropertyTypeStructuralQuery,
            ArchivePropertyTypeRequest,
            UnarchivePropertyTypeRequest,
        )
    ),
    tags(
        (name = "PropertyType", description = "Property type management API")
    )
)]
pub(crate) struct PropertyTypeResource;

impl RoutedResource for PropertyTypeResource {
    /// Create routes for interacting with property types.
    fn routes<S, A>() -> Router
    where
        S: StorePool + Send + Sync + 'static,
        A: AuthorizationApiPool + Send + Sync + 'static,
        for<'pool> S::Store<'pool>: RestApiStore,
    {
        // TODO: The URL format here is preliminary and will have to change.
        Router::new().nest(
            "/property-types",
            Router::new()
                .route(
                    "/",
                    post(create_property_type::<S, A>).put(update_property_type::<S, A>),
                )
                .route(
                    "/relationships",
                    post(modify_property_type_authorization_relationships::<A>),
                )
                .nest(
                    "/:property_type_id",
                    Router::new()
                        .route(
                            "/relationships",
                            get(get_property_type_authorization_relationships::<A>),
                        )
                        .route(
                            "/permissions/:permission",
                            get(check_property_type_permission::<A>),
                        ),
                )
                .route("/query", post(get_property_types_by_query::<S, A>))
                .route("/load", post(load_external_property_type::<S, A>))
                .route("/archive", put(archive_property_type::<S, A>))
                .route("/unarchive", put(unarchive_property_type::<S, A>)),
        )
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreatePropertyTypeRequest {
    #[schema(inline)]
    schema: MaybeListOfPropertyType,
    owned_by_id: OwnedById,
    relationships: Vec<PropertyTypeRelationAndSubject>,
}

#[utoipa::path(
    post,
    path = "/property-types",
    request_body = CreatePropertyTypeRequest,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the created property type", body = MaybeListOfOntologyElementMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to create property type in the store as the base property type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, domain_validator)
)]
async fn create_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    domain_validator: Extension<DomainValidator>,
    body: Json<CreatePropertyTypeRequest>,
) -> Result<Json<ListOrValue<PropertyTypeMetadata>>, StatusCode>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool>: RestApiStore,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let Json(CreatePropertyTypeRequest {
        schema,
        owned_by_id,
        relationships,
    }) = body;

    let is_list = matches!(&schema, ListOrValue::List(_));

    let schema_iter = schema.into_iter();
    let mut property_types = Vec::with_capacity(schema_iter.size_hint().0);
    let mut partial_metadata = Vec::with_capacity(schema_iter.size_hint().0);

    for property_type in schema_iter {
        domain_validator
            .validate(&property_type)
            .map_err(|report| {
                tracing::error!(error=?report, id=property_type.id().to_string(), "Property Type ID failed to validate");
                StatusCode::UNPROCESSABLE_ENTITY
            })?;

        partial_metadata.push(PartialPropertyTypeMetadata {
            record_id: property_type.id().clone().into(),
            classification: OntologyTypeClassificationMetadata::Owned { owned_by_id },
        });

        property_types.push(property_type);
    }

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut metadata = store
        .create_property_types(
            actor_id,
            &mut authorization_api,
            property_types.into_iter().zip(partial_metadata),
            ConflictBehavior::Fail,
            relationships,
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not create property types");

            if report.contains::<PermissionAssertion>() {
                return StatusCode::FORBIDDEN;
            }
            if report.contains::<BaseUrlAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
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
enum LoadExternalPropertyTypeRequest {
    #[serde(rename_all = "camelCase")]
    Fetch {
        #[schema(value_type = SHARED_VersionedUrl)]
        property_type_id: VersionedUrl,
    },
    Create {
        #[schema(value_type = VAR_PROPERTY_TYPE)]
        schema: PropertyType,
        relationships: Vec<PropertyTypeRelationAndSubject>,
    },
}

#[utoipa::path(
    post,
    path = "/property-types/load",
    request_body = LoadExternalPropertyTypeRequest,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the loaded property type", body = PropertyTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 409, description = "Unable to load property type in the store as the base property type ID already exists"),
        (status = 500, description = "Store error occurred"),
    ),
)]
#[tracing::instrument(
    level = "info",
    skip(store_pool, authorization_api_pool, domain_validator)
)]
async fn load_external_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    domain_validator: Extension<DomainValidator>,
    Json(request): Json<LoadExternalPropertyTypeRequest>,
) -> Result<Json<PropertyTypeMetadata>, Response>
where
    S: StorePool + Send + Sync,
    for<'pool> S::Store<'pool>: RestApiStore,
    A: AuthorizationApiPool + Send + Sync,
{
    let mut store = store_pool.acquire().await.map_err(report_to_response)?;
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    match request {
        LoadExternalPropertyTypeRequest::Fetch { property_type_id } => {
            let OntologyTypeMetadata::PropertyType(metadata) = store
                .load_external_type(
                    actor_id,
                    &mut authorization_api,
                    &domain_validator,
                    OntologyTypeReference::PropertyTypeReference((&property_type_id).into()),
                )
                .await?
            else {
                // TODO: Make the type fetcher typed
                panic!("`load_external_type` should have returned a `PropertyTypeMetadata`");
            };
            Ok(Json(metadata))
        }
        LoadExternalPropertyTypeRequest::Create {
            schema,
            relationships,
        } => {
            let record_id = OntologyTypeRecordId::from(schema.id().clone());

            if domain_validator.validate_url(schema.id().base_url.as_str()) {
                let error = "Ontology type is not external".to_owned();
                tracing::error!(id=%schema.id(), error);
                return Err(status_to_response(Status::<()>::new(
                    hash_status::StatusCode::InvalidArgument,
                    Some(error),
                    vec![],
                )));
            }

            Ok(Json(
                store
                    .create_property_type(
                        actor_id,
                        &mut authorization_api,
                        schema,
                        PartialPropertyTypeMetadata {
                            record_id,
                            classification: OntologyTypeClassificationMetadata::External {
                                fetched_at: OffsetDateTime::now_utc(),
                            },
                        },
                        relationships,
                    )
                    .await
                    .map_err(report_to_response)?,
            ))
        }
    }
}

#[utoipa::path(
    post,
    path = "/property-types/query",
    request_body = PropertyTypeStructuralQuery,
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (
            status = 200,
            content_type = "application/json",
            body = Subgraph,
            description = "A subgraph rooted at property types that satisfy the given query, each resolved to the requested depth.",
            headers(
                ("Link" = String, description = "The link to be used to query the next page of property types"),
            ),

        ),

        (status = 422, content_type = "text/plain", description = "Provided query is invalid"),
        (status = 500, description = "Store error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn get_property_types_by_query<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    Query(pagination): Query<Pagination<PropertyTypeVertexId>>,
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
        .get_property_type(
            actor_id,
            &authorization_api,
            &query,
            pagination.after.as_ref().map(|cursor| &cursor.0),
            pagination.limit,
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
struct UpdatePropertyTypeRequest {
    #[schema(value_type = VAR_UPDATE_PROPERTY_TYPE)]
    schema: serde_json::Value,
    #[schema(value_type = SHARED_VersionedUrl)]
    type_to_update: VersionedUrl,
    relationships: Vec<PropertyTypeRelationAndSubject>,
}

#[utoipa::path(
    put,
    path = "/property-types",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("after" = Option<String>, Query, description = "The cursor to start reading from"),
        ("limit" = Option<usize>, Query, description = "The maximum number of property types to read"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated property type", body = PropertyTypeMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Base property type ID was not found"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UpdatePropertyTypeRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn update_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<UpdatePropertyTypeRequest>,
) -> Result<Json<PropertyTypeMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UpdatePropertyTypeRequest {
        schema,
        mut type_to_update,
        relationships,
    }) = body;

    type_to_update.version += 1;

    let property_type = patch_id_and_parse(&type_to_update, schema).map_err(|report| {
        tracing::error!(error=?report, "Couldn't patch schema and convert to Property Type");
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
        .update_property_type(
            actor_id,
            &mut authorization_api,
            property_type,
            relationships,
        )
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not update property type");

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

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ArchivePropertyTypeRequest {
    #[schema(value_type = SHARED_VersionedUrl)]
    type_to_archive: VersionedUrl,
}

#[utoipa::path(
    put,
    path = "/property-types/archive",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The metadata of the updated property type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Property type ID was not found"),
        (status = 409, description = "Property type ID is already archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = ArchivePropertyTypeRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn archive_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<ArchivePropertyTypeRequest>,
) -> Result<Json<OntologyTemporalMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(ArchivePropertyTypeRequest { type_to_archive }) = body;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .archive_property_type(actor_id, &mut authorization_api, &type_to_archive)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not archive property type");

            if report.contains::<OntologyVersionDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UnarchivePropertyTypeRequest {
    #[schema(value_type = SHARED_VersionedUrl)]
    type_to_unarchive: VersionedUrl,
}

#[utoipa::path(
    put,
    path = "/property-types/unarchive",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 200, content_type = "application/json", description = "The temporal metadata of the updated property type", body = OntologyTemporalMetadata),
        (status = 422, content_type = "text/plain", description = "Provided request body is invalid"),

        (status = 404, description = "Property type ID was not found"),
        (status = 409, description = "Property type ID already exists and is not archived"),
        (status = 500, description = "Store error occurred"),
    ),
    request_body = UnarchivePropertyTypeRequest,
)]
#[tracing::instrument(level = "info", skip(store_pool, authorization_api_pool))]
async fn unarchive_property_type<S, A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    store_pool: Extension<Arc<S>>,
    authorization_api_pool: Extension<Arc<A>>,
    body: Json<UnarchivePropertyTypeRequest>,
) -> Result<Json<OntologyTemporalMetadata>, StatusCode>
where
    S: StorePool + Send + Sync,
    A: AuthorizationApiPool + Send + Sync,
{
    let Json(UnarchivePropertyTypeRequest { type_to_unarchive }) = body;

    let mut store = store_pool.acquire().await.map_err(|report| {
        tracing::error!(error=?report, "Could not acquire store");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut authorization_api = authorization_api_pool.acquire().await.map_err(|error| {
        tracing::error!(?error, "Could not acquire access to the authorization API");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    store
        .unarchive_property_type(actor_id, &mut authorization_api, &type_to_unarchive)
        .await
        .map_err(|report| {
            tracing::error!(error=?report, "Could not unarchive property type");

            if report.contains::<OntologyVersionDoesNotExist>() {
                return StatusCode::NOT_FOUND;
            }
            if report.contains::<VersionedUrlAlreadyExists>() {
                return StatusCode::CONFLICT;
            }

            // Insertion/update errors are considered internal server errors.
            StatusCode::INTERNAL_SERVER_ERROR
        })
        .map(Json)
}

#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
struct ModifyPropertyTypeAuthorizationRelationship {
    operation: ModifyRelationshipOperation,
    resource: VersionedUrl,
    relation_and_subject: PropertyTypeRelationAndSubject,
}

#[utoipa::path(
    post,
    path = "/property-types/relationships",
    tag = "PropertyType",
    request_body = [ModifyPropertyTypeAuthorizationRelationship],
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
    ),
    responses(
        (status = 204, description = "The relationship was modified for the property"),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn modify_property_type_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    authorization_api_pool: Extension<Arc<A>>,
    relationships: Json<Vec<ModifyPropertyTypeAuthorizationRelationship>>,
) -> Result<StatusCode, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let mut authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    let (property_types, operations): (Vec<_>, Vec<_>) = relationships
        .0
        .into_iter()
        .map(|request| {
            let resource = PropertyTypeId::from_url(&request.resource);
            (
                resource,
                (request.operation, resource, request.relation_and_subject),
            )
        })
        .unzip();

    let (permissions, _zookie) = authorization_api
        .check_property_types_permission(
            actor_id,
            PropertyTypePermission::Update,
            property_types,
            Consistency::FullyConsistent,
        )
        .await
        .map_err(report_to_response)?;

    let mut failed = false;
    // TODO: Change interface for `check_property_types_permission` to avoid this loop
    for (_property_type_id, has_permission) in permissions {
        if !has_permission {
            tracing::error!("Insufficient permissions to modify relationship for property type");
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
        .modify_property_type_relations(operations)
        .await
        .map_err(report_to_response)?;

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/property-types/{property_type_id}/relationships",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("property_type_id" = VersionedUrl, Path, description = "The Property type to read the relations for"),
    ),
    responses(
        (status = 200, description = "The relations of the property type", body = [PropertyTypeRelationAndSubject]),

        (status = 403, description = "Permission denied"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn get_property_type_authorization_relationships<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path(property_type_id): Path<VersionedUrl>,
    authorization_api_pool: Extension<Arc<A>>,
) -> Result<Json<Vec<PropertyTypeRelationAndSubject>>, Response>
where
    A: AuthorizationApiPool + Send + Sync,
{
    let authorization_api = authorization_api_pool
        .acquire()
        .await
        .map_err(report_to_response)?;

    Ok(Json(
        authorization_api
            .get_property_type_relations(
                PropertyTypeId::from_url(&property_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?,
    ))
}

#[utoipa::path(
    get,
    path = "/property-types/{property_type_id}/permissions/{permission}",
    tag = "PropertyType",
    params(
        ("X-Authenticated-User-Actor-Id" = AccountId, Header, description = "The ID of the actor which is used to authorize the request"),
        ("property_type_id" = VersionedUrl, Path, description = "The property type ID to check if the actor has the permission"),
        ("permission" = PropertyTypePermission, Path, description = "The permission to check for"),
    ),
    responses(
        (status = 200, body = PermissionResponse, description = "Information if the actor has the permission for the property type"),

        (status = 500, description = "Internal error occurred"),
    )
)]
#[tracing::instrument(level = "info", skip(authorization_api_pool))]
async fn check_property_type_permission<A>(
    AuthenticatedUserHeader(actor_id): AuthenticatedUserHeader,
    Path((property_type_id, permission)): Path<(VersionedUrl, PropertyTypePermission)>,
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
            .check_property_type_permission(
                actor_id,
                permission,
                PropertyTypeId::from_url(&property_type_id),
                Consistency::FullyConsistent,
            )
            .await
            .map_err(report_to_response)?
            .has_permission,
    }))
}
