//! The Axum webserver for accessing the Graph API operations.
//!
//! Handler methods are grouped by routes that make up the REST API.

#[cfg(feature = "test-server")]
pub mod test_server;

mod api_resource;
mod json;
mod middleware;
mod status;
mod utoipa_typedef;

mod account;
mod data_type;
mod entity;
mod entity_type;
mod property_type;
mod web;

use std::{borrow::Cow, fs, io, str::FromStr, sync::Arc};

use async_trait::async_trait;
use authorization::{AuthorizationApi, AuthorizationApiPool};
use axum::{
    extract::{FromRequestParts, Path},
    http::{request::Parts, uri::PathAndQuery, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Extension, Json, Router,
};
use base64::Engine;
use error_stack::{Report, ResultExt};
use graph::{
    ontology::{domain_validator::DomainValidator, Selector},
    store::{error::VersionedUrlAlreadyExists, Store, StorePool, TypeFetcher},
    subgraph::{
        edges::{
            EdgeResolveDepths, GraphResolveDepths, KnowledgeGraphEdgeKind, OntologyEdgeKind,
            OutgoingEdgeResolveDepth, SharedEdgeKind,
        },
        identifier::{
            DataTypeVertexId, EntityIdWithInterval, EntityTypeVertexId, EntityVertexId,
            GraphElementVertexId, PropertyTypeVertexId,
        },
        temporal_axes::{
            QueryTemporalAxes, QueryTemporalAxesUnresolved, RightBoundedTemporalIntervalUnresolved,
            SubgraphTemporalAxes,
        },
    },
};
use graph_types::{
    account::{AccountId, CreatedById, EditionArchivedById, EditionCreatedById},
    ontology::{
        DataTypeMetadata, EntityTypeMetadata, OntologyEditionProvenanceMetadata,
        OntologyProvenanceMetadata, OntologyTemporalMetadata, OntologyTypeMetadata,
        OntologyTypeRecordId, OntologyTypeReference, PropertyTypeMetadata,
    },
    owned_by_id::OwnedById,
};
use hash_status::Status;
use hyper::Uri;
use include_dir::{include_dir, Dir};
use sentry::integrations::tower::{NewSentryLayer, SentryHttpLayer};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use temporal_client::TemporalClient;
use temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound,
    OpenTemporalBound, RightBoundedTemporalInterval, TemporalBound, Timestamp, TransactionTime,
};
use type_system::url::{BaseUrl, OntologyTypeVersion, VersionedUrl};
use utoipa::{
    openapi::{
        self, schema, ArrayBuilder, KnownFormat, Object, ObjectBuilder, OneOfBuilder, Ref, RefOr,
        Schema, SchemaFormat, SchemaType,
    },
    Modify, OpenApi, ToSchema,
};
use uuid::Uuid;

use self::{
    api_resource::RoutedResource,
    middleware::span_trace_layer,
    status::{report_to_response, status_to_response},
    utoipa_typedef::{
        subgraph::{
            Edges, KnowledgeGraphOutwardEdge, KnowledgeGraphVertex, KnowledgeGraphVertices,
            OntologyOutwardEdge, OntologyTypeVertexId, OntologyVertex, OntologyVertices, Subgraph,
            Vertex, Vertices,
        },
        MaybeListOfDataTypeMetadata, MaybeListOfEntityTypeMetadata,
        MaybeListOfPropertyTypeMetadata,
    },
};

pub struct AuthenticatedUserHeader(pub AccountId);

#[async_trait]
impl<S> FromRequestParts<S> for AuthenticatedUserHeader {
    type Rejection = (StatusCode, Cow<'static, str>);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        if let Some(header_value) = parts.headers.get("X-Authenticated-User-Actor-Id") {
            let header_string = header_value
                .to_str()
                .map_err(|error| (StatusCode::BAD_REQUEST, Cow::Owned(error.to_string())))?;
            let uuid = Uuid::from_str(header_string)
                .map_err(|error| (StatusCode::BAD_REQUEST, Cow::Owned(error.to_string())))?;
            Ok(Self(AccountId::new(uuid)))
        } else {
            Err((
                StatusCode::BAD_REQUEST,
                Cow::Borrowed("`X-Authenticated-User-Actor-Id` header is missing"),
            ))
        }
    }
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PermissionResponse {
    has_permission: bool,
}

#[derive(Debug)]
pub struct Cursor<T>(pub T);

impl<T: Serialize> Cursor<T> {
    fn link_header(
        &self,
        relation: &'static str,
        uri: Uri,
        limit: usize,
    ) -> Result<HeaderValue, Response> {
        let mut uri_parts = uri.into_parts();
        let json = serde_json::to_string(&self.0).map_err(report_to_response)?;
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json);
        uri_parts.path_and_query = Some(
            PathAndQuery::try_from(format!(
                "{}?after={encoded}&limit={limit}",
                uri_parts.path_and_query.expect("path is missing").path(),
            ))
            .map_err(report_to_response)?,
        );
        let uri = Uri::from_parts(uri_parts).map_err(report_to_response)?;
        HeaderValue::from_str(&format!(r#"<{uri}>; rel="{relation}""#)).map_err(report_to_response)
    }
}

impl<T> Serialize for Cursor<T>
where
    T: Serialize,
{
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let json = serde_json::to_string(&self.0).map_err(serde::ser::Error::custom)?;
        let base64_encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json);
        serializer.serialize_str(&base64_encoded)
    }
}

impl<'de, T> Deserialize<'de> for Cursor<T>
where
    T: DeserializeOwned,
{
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let json = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(String::deserialize(deserializer)?)
            .map_err(serde::de::Error::custom)?;
        serde_json::from_slice(&json)
            .map_err(serde::de::Error::custom)
            .map(Self)
    }
}

#[derive(Debug, Deserialize)]
#[serde(
    rename_all = "camelCase",
    deny_unknown_fields,
    bound(deserialize = "T: DeserializeOwned")
)]
struct Pagination<T> {
    after: Option<Cursor<T>>,
    limit: Option<usize>,
}

#[async_trait]
pub trait RestApiStore: Store + TypeFetcher {
    async fn load_external_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        domain_validator: &DomainValidator,
        reference: OntologyTypeReference<'_>,
    ) -> Result<OntologyTypeMetadata, Response>;
}

#[async_trait]
impl<S> RestApiStore for S
where
    S: Store + TypeFetcher + Send,
{
    async fn load_external_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        domain_validator: &DomainValidator,
        reference: OntologyTypeReference<'_>,
    ) -> Result<OntologyTypeMetadata, Response> {
        if domain_validator.validate_url(reference.url().base_url.as_str()) {
            let error = "Ontology type is not external".to_owned();
            tracing::error!(id=%reference.url(), error);
            return Err(status_to_response(Status::<()>::new(
                hash_status::StatusCode::InvalidArgument,
                Some(error),
                vec![],
            )));
        }

        self.insert_external_ontology_type(actor_id, authorization_api, temporal_client, reference)
            .await
            .attach_printable("Could not insert external type")
            .attach_printable_lazy(|| reference.url().clone())
            .map_err(|report| {
                if report.contains::<VersionedUrlAlreadyExists>() {
                    report_to_response(report.attach(hash_status::StatusCode::AlreadyExists))
                } else {
                    report_to_response(report)
                }
            })
    }
}

static STATIC_SCHEMAS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/src/rest/json_schemas");

fn api_resources<S, A>() -> Vec<Router>
where
    S: StorePool + Send + Sync + 'static,
    A: AuthorizationApiPool + Send + Sync + 'static,
    for<'pool> S::Store<'pool>: RestApiStore,
{
    vec![
        account::AccountResource::routes::<S, A>(),
        data_type::DataTypeResource::routes::<S, A>(),
        property_type::PropertyTypeResource::routes::<S, A>(),
        entity_type::EntityTypeResource::routes::<S, A>(),
        entity::EntityResource::routes::<S, A>(),
        web::WebResource::routes::<S, A>(),
    ]
}

fn api_documentation() -> Vec<openapi::OpenApi> {
    vec![
        account::AccountResource::documentation(),
        data_type::DataTypeResource::documentation(),
        property_type::PropertyTypeResource::documentation(),
        entity_type::EntityTypeResource::documentation(),
        entity::EntityResource::documentation(),
        web::WebResource::documentation(),
    ]
}

pub struct RestRouterDependencies<S, A>
where
    S: StorePool + Send + Sync + 'static,
    A: AuthorizationApiPool + Send + Sync + 'static,
{
    pub store: Arc<S>,
    pub authorization_api: Arc<A>,
    pub temporal_client: Option<TemporalClient>,
    pub domain_regex: DomainValidator,
}

/// A [`Router`] that only serves the `OpenAPI` specification (JSON, and necessary subschemas) for
/// the REST API.
pub fn openapi_only_router() -> Router {
    let open_api_doc = OpenApiDocumentation::openapi();

    Router::new().nest(
        "/api-doc",
        Router::new()
            .route("/openapi.json", get(|| async { Json(open_api_doc) }))
            .route("/models/*path", get(serve_static_schema)),
    )
}

/// A [`Router`] that serves all of the REST API routes, and the `OpenAPI` specification.
pub fn rest_api_router<S, A>(dependencies: RestRouterDependencies<S, A>) -> Router
where
    S: StorePool + Send + Sync + 'static,
    A: AuthorizationApiPool + Send + Sync + 'static,
    for<'pool> S::Store<'pool>: RestApiStore,
{
    // All api resources are merged together into a super-router.
    let merged_routes = api_resources::<S, A>()
        .into_iter()
        .fold(Router::new(), Router::merge);

    // super-router can then be used as any other router.
    // Make sure extensions are added at the end so they are made available to merged routers.
    // The `/api-doc` endpoints are nested as we don't want any layers or handlers for the api-doc
    merged_routes
        .layer(NewSentryLayer::new_from_top())
        .layer(SentryHttpLayer::with_transaction())
        .layer(Extension(dependencies.store))
        .layer(Extension(dependencies.authorization_api))
        .layer(Extension(dependencies.temporal_client.map(Arc::new)))
        .layer(Extension(dependencies.domain_regex))
        .layer(span_trace_layer())
        .merge(openapi_only_router())
}

async fn serve_static_schema(Path(path): Path<String>) -> Result<Response, StatusCode> {
    let path = path.trim_start_matches('/');

    STATIC_SCHEMAS
        .get_file(path)
        .map_or(Err(StatusCode::NOT_FOUND), |file| {
            Ok((
                [(
                    axum::http::header::CONTENT_TYPE,
                    axum::http::HeaderValue::from_static("application/json"),
                )],
                file.contents(),
            )
                .into_response())
        })
}

#[derive(OpenApi)]
#[openapi(
    tags(
        (name = "Graph", description = "HASH Graph API")
    ),
    info(title = "graph"),
    modifiers(
        &MergeAddon,
        &ExternalRefAddon,
        &OperationGraphTagAddon,
        &FilterSchemaAddon,
        &TimeSchemaAddon,
    ),
    components(
        schemas(
            PermissionResponse,

            BaseUrl,
            VersionedUrl,
            OwnedById,
            CreatedById,
            EditionCreatedById,
            EditionArchivedById,
            OntologyProvenanceMetadata,
            OntologyEditionProvenanceMetadata,
            OntologyTypeRecordId,
            OntologyTemporalMetadata,
            DataTypeMetadata,
            MaybeListOfDataTypeMetadata,
            PropertyTypeMetadata,
            MaybeListOfPropertyTypeMetadata,
            EntityTypeMetadata,
            MaybeListOfEntityTypeMetadata,
            EntityVertexId,
            EntityIdWithInterval,
            DataTypeVertexId,
            PropertyTypeVertexId,
            EntityTypeVertexId,
            OntologyTypeVertexId,
            OntologyTypeVersion,
            Selector,

            GraphElementVertexId,
            OntologyVertex,
            KnowledgeGraphVertex,
            Vertex,
            KnowledgeGraphVertices,
            OntologyVertices,
            Vertices,
            SharedEdgeKind,
            KnowledgeGraphEdgeKind,
            OntologyEdgeKind,
            OntologyOutwardEdge,
            KnowledgeGraphOutwardEdge,
            Edges,
            GraphResolveDepths,
            EdgeResolveDepths,
            OutgoingEdgeResolveDepth,
            Subgraph,
            SubgraphTemporalAxes,

            DecisionTime,
            TransactionTime,
            QueryTemporalAxes,
            QueryTemporalAxesUnresolved,
        )
    ),
)]
pub struct OpenApiDocumentation;

impl OpenApiDocumentation {
    /// Writes the `OpenAPI` specification to the given path.
    ///
    /// The path must be a directory, and the `OpenAPI` specification will be written to
    /// `openapi.json` in that directory.
    ///
    /// # Errors
    ///
    /// This function will return an error if the path is not a directory, or if the files cannot be
    /// written.
    pub fn write_openapi(path: impl AsRef<std::path::Path>) -> Result<(), Report<io::Error>> {
        let openapi = Self::openapi();
        let path = path.as_ref();
        fs::create_dir_all(path).attach_printable_lazy(|| path.display().to_string())?;

        let openapi_json_path = path.join("openapi.json");
        serde_json::to_writer_pretty(
            io::BufWriter::new(
                fs::File::create(&openapi_json_path)
                    .attach_printable("could not write openapi.json")
                    .attach_printable_lazy(|| openapi_json_path.display().to_string())?,
            ),
            &openapi,
        )
        .map_err(io::Error::from)?;

        let model_def_path = std::path::Path::new(&env!("CARGO_MANIFEST_DIR"))
            .join("src")
            .join("rest")
            .join("json_schemas");

        let model_path_dir = path.join("models");
        fs::create_dir_all(&model_path_dir)
            .attach_printable("could not create directory")
            .attach_printable_lazy(|| model_path_dir.display().to_string())?;

        for file in STATIC_SCHEMAS.files() {
            let model_path_source = model_def_path.join(file.path());
            let model_path_target = model_path_dir.join(file.path());
            fs::copy(&model_path_source, &model_path_target)
                .attach_printable("could not copy file")
                .attach_printable_lazy(|| model_path_source.display().to_string())
                .attach_printable_lazy(|| model_path_target.display().to_string())?;
        }

        Ok(())
    }
}

/// Addon to merge multiple [`OpenApi`] documents together.
///
/// [`OpenApi`]: utoipa::openapi::OpenApi
struct MergeAddon;

impl Modify for MergeAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let api_documentation = api_documentation();

        let api_components = api_documentation
            .iter()
            .cloned()
            .filter_map(|api_docs| {
                api_docs
                    .components
                    .map(|components| components.schemas.into_iter())
            })
            .flatten();

        let mut components = openapi.components.take().unwrap_or_default();
        components.schemas.extend(api_components);
        openapi.components = Some(components);

        let mut tags = openapi.tags.take().unwrap_or_default();
        tags.extend(
            api_documentation
                .iter()
                .cloned()
                .filter_map(|api_docs| api_docs.tags)
                .flatten(),
        );
        openapi.tags = Some(tags);

        openapi.paths.paths.extend(
            api_documentation
                .iter()
                .cloned()
                .flat_map(|api_docs| api_docs.paths.paths.into_iter()),
        );
    }
}

/// Addon to allow external references in schemas.
///
/// Any component that starts with `VAR_` will transform into a relative URL in the schema and
/// receive a `.json` ending.
///
/// Any component that starts with `SHARED_` will transform into a relative URL into the
/// `./models/shared.json` file.
///
/// For example the `VAR_Entity` component will be transformed into `./models/Entity.json`
struct ExternalRefAddon;

impl Modify for ExternalRefAddon {
    fn modify(&self, openapi: &mut openapi::OpenApi) {
        for path_item in openapi.paths.paths.values_mut() {
            for operation in path_item.operations.values_mut() {
                if let Some(request_body) = &mut operation.request_body {
                    modify_component(request_body.content.values_mut());
                }

                for response in &mut operation.responses.responses.values_mut() {
                    match response {
                        RefOr::Ref(reference) => modify_reference(reference),
                        RefOr::T(response) => modify_component(response.content.values_mut()),
                    }
                }
            }
        }

        if let Some(components) = &mut openapi.components {
            for component in &mut components.schemas.values_mut() {
                modify_schema_references(component);
            }
        }
    }
}

fn modify_component<'a>(content_iter: impl IntoIterator<Item = &'a mut openapi::Content>) {
    for content in content_iter {
        modify_schema_references(&mut content.schema);
    }
}

fn modify_schema_references(schema_component: &mut RefOr<openapi::Schema>) {
    match schema_component {
        RefOr::Ref(reference) => modify_reference(reference),
        RefOr::T(schema) => match schema {
            openapi::Schema::Object(object) => object
                .properties
                .values_mut()
                .for_each(modify_schema_references),
            openapi::Schema::Array(array) => modify_schema_references(array.items.as_mut()),
            openapi::Schema::OneOf(one_of) => {
                one_of.items.iter_mut().for_each(modify_schema_references);
            }
            openapi::Schema::AllOf(all_of) => {
                all_of.items.iter_mut().for_each(modify_schema_references);
            }
            _ => (),
        },
    }
}

fn modify_reference(reference: &mut openapi::Ref) {
    static REF_PREFIX_MODELS: &str = "#/components/schemas/VAR_";

    if reference.ref_location.starts_with(REF_PREFIX_MODELS) {
        reference
            .ref_location
            .replace_range(0..REF_PREFIX_MODELS.len(), "./models/");
        reference.ref_location.make_ascii_lowercase();
        reference.ref_location.push_str(".json");
    };
}

/// Append a `Graph` tag wherever a tag appears in individual routes.
///
/// When generating API clients the tags are used for grouping routes. Having the `Graph` tag on all
/// routes makes it so that every operation appear under the same `Graph` API interface.
///
/// As generators are not all created the same way, we're putting the `Graph` tag in the beginning
/// for it to take precedence. Other tags in the system are used for logical grouping of the
/// routes, which is why we don't want to entirely replace them.
struct OperationGraphTagAddon;

impl Modify for OperationGraphTagAddon {
    fn modify(&self, openapi: &mut openapi::OpenApi) {
        let tag = "Graph";

        for path_item in openapi.paths.paths.values_mut() {
            for operation in path_item.operations.values_mut() {
                if let Some(tags) = &mut operation.tags {
                    tags.insert(0, tag.to_owned());
                }
            }
        }
    }
}

struct FilterSchemaAddon;

impl Modify for FilterSchemaAddon {
    #[expect(clippy::too_many_lines)]
    fn modify(&self, openapi: &mut openapi::OpenApi) {
        // This is a bit of hack, but basically, it adds a schema that is equivalent to "any value"
        // `SchemaType::Value` indicates any generic JSON value.
        struct Any;

        impl ToSchema<'_> for Any {
            fn schema() -> (&'static str, RefOr<Schema>) {
                (
                    "Any",
                    Schema::Object(Object::with_type(SchemaType::Value)).into(),
                )
            }
        }

        if let Some(ref mut components) = openapi.components {
            components.schemas.insert(
                "Filter".to_owned(),
                schema::Schema::OneOf(
                    OneOfBuilder::new()
                        .item(
                            ObjectBuilder::new()
                                .title(Some("AllFilter"))
                                .property(
                                    "all",
                                    ArrayBuilder::new().items(Ref::from_schema_name("Filter")),
                                )
                                .required("all"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("AnyFilter"))
                                .property(
                                    "any",
                                    ArrayBuilder::new().items(Ref::from_schema_name("Filter")),
                                )
                                .required("any"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("NotFilter"))
                                .property("not", Ref::from_schema_name("Filter"))
                                .required("not"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("EqualFilter"))
                                .property(
                                    "equal",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(2))
                                        .max_items(Some(2)),
                                )
                                .required("equal"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("NotEqualFilter"))
                                .property(
                                    "notEqual",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(2))
                                        .max_items(Some(2)),
                                )
                                .required("notEqual"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("CosineDistanceFilter"))
                                .property(
                                    "cosineDistance",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(3))
                                        .max_items(Some(3)),
                                )
                                .required("cosineDistance"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("StartsWithFilter"))
                                .property(
                                    "startsWith",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(2))
                                        .max_items(Some(2)),
                                )
                                .required("startsWith"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("EndsWithFilter"))
                                .property(
                                    "endsWith",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(2))
                                        .max_items(Some(2)),
                                )
                                .required("endsWith"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("ContainsSegmentFilter"))
                                .property(
                                    "containsSegment",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(2))
                                        .max_items(Some(2)),
                                )
                                .required("containsSegment"),
                        )
                        .build(),
                )
                .into(),
            );
            components.schemas.insert(
                "FilterExpression".to_owned(),
                schema::Schema::OneOf(
                    OneOfBuilder::new()
                        .item(
                            ObjectBuilder::new()
                                .title(Some("PathExpression"))
                                .property(
                                    "path",
                                    ArrayBuilder::new().items(
                                        OneOfBuilder::new()
                                            .item(Ref::from_schema_name("DataTypeQueryToken"))
                                            .item(Ref::from_schema_name("PropertyTypeQueryToken"))
                                            .item(Ref::from_schema_name("EntityTypeQueryToken"))
                                            .item(Ref::from_schema_name("EntityQueryToken"))
                                            .item(Ref::from_schema_name("Selector"))
                                            .item(
                                                ObjectBuilder::new()
                                                    .schema_type(SchemaType::String),
                                            )
                                            .item(
                                                ObjectBuilder::new()
                                                    .schema_type(SchemaType::Number),
                                            ),
                                    ),
                                )
                                .required("path"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("ParameterExpression"))
                                .property("parameter", Any::schema().1)
                                .required("parameter"),
                        )
                        .build(),
                )
                .into(),
            );
            components.schemas.insert(
                "EntityQuerySortingPath".to_owned(),
                schema::Schema::Array(
                    ArrayBuilder::new()
                        .items(
                            OneOfBuilder::new()
                                .item(Ref::from_schema_name("EntityQuerySortingToken"))
                                .item(ObjectBuilder::new().schema_type(SchemaType::String))
                                .item(ObjectBuilder::new().schema_type(SchemaType::Number)),
                        )
                        .build(),
                )
                .into(),
            );
        }
    }
}

/// Adds time-related structs to the `OpenAPI` schema.
struct TimeSchemaAddon;

impl Modify for TimeSchemaAddon {
    fn modify(&self, openapi: &mut openapi::OpenApi) {
        if let Some(ref mut components) = openapi.components {
            components.schemas.insert(
                Timestamp::<()>::schema().0.to_owned(),
                Timestamp::<()>::schema().1,
            );
            components.schemas.insert(
                "NullableTimestamp".to_owned(),
                ObjectBuilder::new()
                    .schema_type(SchemaType::String)
                    .format(Some(SchemaFormat::KnownFormat(KnownFormat::DateTime)))
                    .nullable(true)
                    .into(),
            );
            components.schemas.insert(
                TemporalBound::<()>::schema().0.to_owned(),
                TemporalBound::<()>::schema().1,
            );
            components.schemas.insert(
                LimitedTemporalBound::<()>::schema().0.to_owned(),
                LimitedTemporalBound::<()>::schema().1,
            );
            components.schemas.insert(
                OpenTemporalBound::<()>::schema().0.to_owned(),
                OpenTemporalBound::<()>::schema().1,
            );
            components.schemas.insert(
                ClosedTemporalBound::<()>::schema().0.to_owned(),
                ClosedTemporalBound::<()>::schema().1,
            );
            components.schemas.insert(
                "LeftClosedTemporalInterval".to_owned(),
                LeftClosedTemporalInterval::<()>::schema().1,
            );
            components.schemas.insert(
                "RightBoundedTemporalInterval".to_owned(),
                RightBoundedTemporalInterval::<()>::schema().1,
            );
            components.schemas.insert(
                RightBoundedTemporalIntervalUnresolved::<()>::schema()
                    .0
                    .to_owned(),
                RightBoundedTemporalIntervalUnresolved::<()>::schema().1,
            );
        }
    }
}
