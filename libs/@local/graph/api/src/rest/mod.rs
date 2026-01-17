#![expect(clippy::needless_for_each, reason = "Utoipa derive macro uses it")]

//! The Axum webserver for accessing the Graph API operations.
//!
//! Handler methods are grouped by routes that make up the REST API.

pub mod data_type;
pub mod entity;
pub mod entity_type;
pub mod permissions;
pub mod principal;
pub mod property_type;
pub mod status;

pub mod http_tracing_layer;

mod entity_query_request;
mod json;
mod utoipa_typedef;
use alloc::{borrow::Cow, sync::Arc};
use core::str::FromStr as _;
use std::{
    fs,
    io::{self, Write as _},
    time::Instant,
};

use axum::{
    Extension, Json, Router,
    extract::{FromRequestParts, Path},
    http::{StatusCode, request::Parts},
    response::{IntoResponse as _, Response},
    routing::get,
};
use error_stack::{Report, ResultExt as _};
use futures::{SinkExt as _, channel::mpsc::Sender};
use hash_codec::numeric::Real;
use hash_graph_authorization::policies::store::{PolicyStore, PrincipalStore};
use hash_graph_postgres_store::store::error::VersionedUrlAlreadyExists;
use hash_graph_store::{
    account::AccountStore,
    data_type::DataTypeStore,
    entity::{DiffEntityParams, EntityStore},
    entity_type::EntityTypeStore,
    filter::{ParameterConversion, Selector},
    pool::StorePool,
    property_type::PropertyTypeStore,
    subgraph::{
        edges::{
            EdgeDirection, EntityTraversalEdge, EntityTraversalPath, GraphResolveDepths,
            KnowledgeGraphEdgeKind, OntologyEdgeKind, SharedEdgeKind, TraversalEdge, TraversalPath,
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
use hash_graph_temporal_versioning::{
    ClosedTemporalBound, DecisionTime, LeftClosedTemporalInterval, LimitedTemporalBound,
    OpenTemporalBound, RightBoundedTemporalInterval, TemporalBound, Timestamp, TransactionTime,
};
use hash_graph_type_fetcher::TypeFetcher;
use hash_status::Status;
use hash_temporal_client::TemporalClient;
use include_dir::{Dir, include_dir};
use sentry::integrations::tower::{NewSentryLayer, SentryHttpLayer};
use serde::{Deserialize, Serialize};
use serde_json::{Number as JsonNumber, Value as JsonValue, value::RawValue as RawJsonValue};
use tower::ServiceBuilder;
use type_system::{
    ontology::{
        OntologyTemporalMetadata, OntologyTypeMetadata, OntologyTypeReference,
        data_type::DataTypeMetadata,
        entity_type::EntityTypeMetadata,
        id::{BaseUrl, OntologyTypeRecordId, OntologyTypeVersion, VersionedUrl},
        json_schema::DomainValidator,
        property_type::PropertyTypeMetadata,
        provenance::{
            OntologyEditionProvenance, OntologyProvenance, ProvidedOntologyEditionProvenance,
        },
    },
    principal::{actor::ActorEntityUuid, actor_group::WebId},
};
use utoipa::{
    Modify, OpenApi, ToSchema,
    openapi::{
        self, ArrayBuilder, KnownFormat, Object, ObjectBuilder, OneOfBuilder, Ref, RefOr, Schema,
        SchemaFormat, SchemaType, schema,
    },
};
use uuid::Uuid;

use self::{
    status::{BoxedResponse, report_to_response, status_to_response},
    utoipa_typedef::{
        MaybeListOfDataTypeMetadata, MaybeListOfEntityTypeMetadata,
        MaybeListOfPropertyTypeMetadata,
        subgraph::{
            Edges, KnowledgeGraphOutwardEdge, KnowledgeGraphVertex, KnowledgeGraphVertices,
            OntologyOutwardEdge, OntologyTypeVertexId, OntologyVertex, OntologyVertices, Subgraph,
            Vertex, Vertices,
        },
    },
};

pub struct AuthenticatedUserHeader(pub ActorEntityUuid);

impl<S: Sync> FromRequestParts<S> for AuthenticatedUserHeader {
    type Rejection = (StatusCode, Cow<'static, str>);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        if let Some(header_value) = parts.headers.get("X-Authenticated-User-Actor-Id") {
            let header_string = header_value
                .to_str()
                .map_err(|error| (StatusCode::BAD_REQUEST, Cow::Owned(error.to_string())))?;
            let uuid = Uuid::from_str(header_string)
                .map_err(|error| (StatusCode::BAD_REQUEST, Cow::Owned(error.to_string())))?;
            Ok(Self(ActorEntityUuid::new(uuid)))
        } else {
            Err((
                StatusCode::BAD_REQUEST,
                Cow::Borrowed("`X-Authenticated-User-Actor-Id` header is missing"),
            ))
        }
    }
}

pub struct InteractiveHeader(pub bool);

impl<S: Sync> FromRequestParts<S> for InteractiveHeader {
    type Rejection = (StatusCode, Cow<'static, str>);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let Some(value) = parts.headers.get("Interactive") else {
            return Ok(Self(false));
        };

        let bytes = value.as_ref();
        if bytes.eq_ignore_ascii_case(b"true") || bytes.eq_ignore_ascii_case(b"1") {
            return Ok(Self(true));
        }

        if bytes.eq_ignore_ascii_case(b"false") || bytes.eq_ignore_ascii_case(b"0") {
            return Ok(Self(false));
        }

        Err((
            StatusCode::BAD_REQUEST,
            Cow::Borrowed("`Interactive` header must be either `true` (`1`) or `false` (`0`)"),
        ))
    }
}

#[derive(Debug, Serialize, Deserialize, ToSchema)]
pub struct PermissionResponse {
    pub has_permission: bool,
}

pub trait RestApiStore:
    AccountStore + DataTypeStore + PropertyTypeStore + EntityTypeStore + EntityStore + TypeFetcher
{
    fn load_external_type(
        &mut self,
        actor_id: ActorEntityUuid,
        domain_validator: &DomainValidator,
        reference: OntologyTypeReference<'_>,
    ) -> impl Future<Output = Result<OntologyTypeMetadata, BoxedResponse>> + Send;
}

impl<S> RestApiStore for S
where
    S: AccountStore
        + DataTypeStore
        + PropertyTypeStore
        + EntityTypeStore
        + EntityStore
        + TypeFetcher
        + Send,
{
    async fn load_external_type(
        &mut self,
        actor_id: ActorEntityUuid,
        domain_validator: &DomainValidator,
        reference: OntologyTypeReference<'_>,
    ) -> Result<OntologyTypeMetadata, BoxedResponse> {
        if domain_validator.validate_url(reference.url().base_url.as_str()) {
            let error = "Ontology type is not external".to_owned();
            tracing::error!(id=%reference.url(), error);
            return Err(status_to_response(Status::<()>::new(
                hash_status::StatusCode::InvalidArgument,
                Some(error),
                vec![],
            )));
        }

        self.insert_external_ontology_type(actor_id, reference)
            .await
            .attach("Could not insert external type")
            .attach_with(|| reference.url().clone())
            .map_err(|report| {
                if report.contains::<VersionedUrlAlreadyExists>() {
                    report_to_response(report.attach_opaque(hash_status::StatusCode::AlreadyExists))
                } else {
                    report_to_response(report)
                }
            })
    }
}

static STATIC_SCHEMAS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/src/rest/json_schemas");

fn api_resources<S>() -> Vec<Router>
where
    S: StorePool + Send + Sync + 'static,
    for<'pool> S::Store<'pool>: RestApiStore + PrincipalStore + PolicyStore,
{
    vec![
        data_type::DataTypeResource::routes::<S>(),
        property_type::PropertyTypeResource::routes::<S>(),
        entity_type::EntityTypeResource::routes::<S>(),
        entity::EntityResource::routes::<S>(),
        permissions::PermissionResource::routes::<S>(),
        principal::PrincipalResource::routes::<S>(),
    ]
}

fn api_documentation() -> Vec<openapi::OpenApi> {
    vec![
        data_type::DataTypeResource::openapi(),
        property_type::PropertyTypeResource::openapi(),
        entity_type::EntityTypeResource::openapi(),
        entity::EntityResource::openapi(),
        permissions::PermissionResource::openapi(),
        principal::PrincipalResource::openapi(),
    ]
}

#[derive(Debug, Clone)]
pub struct QueryLogger {
    sender: Sender<JsonValue>,
    value: Option<JsonValue>,
    created_at: Instant,
}

#[derive(Debug, derive_more::Display, derive_more::Error)]
#[display("Could not send query to logger")]
pub struct QueryLoggingError;

impl QueryLogger {
    #[must_use]
    pub fn new(sender: Sender<JsonValue>) -> Self {
        Self {
            sender,
            value: None,
            created_at: Instant::now(),
        }
    }

    #[expect(clippy::missing_panics_doc)]
    pub fn capture(&mut self, actor: ActorEntityUuid, query: OpenApiQuery<'_>) {
        let mut record = serde_json::to_value(query)
            .change_context(QueryLoggingError)
            .expect("query should be serializable");
        record
            .as_object_mut()
            .map(|object| object.insert("actor".to_owned(), JsonValue::String(actor.to_string())));
        self.value = Some(record);
        self.created_at = Instant::now();
    }

    /// Sends the captured query to the query logger.
    ///
    /// # Errors
    ///
    /// This function will return an error if the query could not be sent.
    pub async fn send(&mut self) -> Result<(), Report<QueryLoggingError>> {
        let mut query = self
            .value
            .take()
            .ok_or(QueryLoggingError)
            .attach("no query was captured")?;
        query
            .as_object_mut()
            .ok_or(QueryLoggingError)
            .attach("serialized value is not an object")?
            .insert(
                "elapsed".to_owned(),
                JsonValue::Number(
                    JsonNumber::from_u128(self.created_at.elapsed().as_millis())
                        .ok_or(QueryLoggingError)
                        .attach("Could not convert milliseconds to JSON")?,
                ),
            );

        self.sender
            .send(query)
            .await
            .change_context(QueryLoggingError)
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "endpoint", content = "query", rename_all = "camelCase")]
pub enum OpenApiQuery<'a> {
    GetDataTypes(&'a JsonValue),
    GetDataTypeSubgraph(&'a JsonValue),
    GetPropertyTypes(&'a JsonValue),
    GetPropertyTypeSubgraph(&'a JsonValue),
    GetEntityTypes(&'a JsonValue),
    GetClosedMultiEntityTypes(&'a JsonValue),
    GetEntityTypeSubgraph(&'a JsonValue),
    GetEntities(&'a RawJsonValue),
    CountEntities(&'a JsonValue),
    GetEntitySubgraph(&'a JsonValue),
    ValidateEntity(&'a JsonValue),
    DiffEntity(&'a DiffEntityParams),
}

pub struct RestRouterDependencies<S>
where
    S: StorePool + Send + Sync + 'static,
{
    pub store: Arc<S>,
    pub temporal_client: Option<TemporalClient>,
    pub domain_regex: DomainValidator,
    pub query_logger: Option<QueryLogger>,
}

/// A [`Router`] that only serves the `OpenAPI` specification (JSON, and necessary subschemas) for
/// the REST API.
pub fn openapi_only_router() -> Router {
    let open_api_doc = OpenApiDocumentation::openapi();

    Router::new()
        .route("/health", get(async || "Healthy".into_response()))
        .nest(
            "/api-doc",
            Router::new()
                .route("/openapi.json", get(|| async { Json(open_api_doc) }))
                .route("/models/{*path}", get(serve_static_schema)),
        )
}

/// A [`Router`] that serves all of the REST API routes, and the `OpenAPI` specification.
pub fn rest_api_router<S>(dependencies: RestRouterDependencies<S>) -> Router
where
    S: StorePool + Send + Sync + 'static,
    for<'p> S::Store<'p>: RestApiStore + PrincipalStore + PolicyStore,
{
    // All api resources are merged together into a super-router.
    let merged_routes = api_resources::<S>()
        .into_iter()
        .fold(Router::new(), Router::merge)
        .fallback(|| {
            tracing::error!("404: Not found");
            async { StatusCode::NOT_FOUND }
        });

    // super-router can then be used as any other router.
    // Make sure extensions are added at the end so they are made available to merged routers.
    // The `/api-doc` endpoints are nested as we don't want any layers or handlers for the api-doc.
    // We use a `ServiceBuilder` to add the layers in the correct order.
    let mut router = merged_routes
        .layer(
            ServiceBuilder::new()
                .layer(NewSentryLayer::new_from_top())
                .layer(SentryHttpLayer::default().enable_transaction()),
        )
        .layer(http_tracing_layer::HttpTracingLayer)
        .layer(Extension(dependencies.store))
        .layer(Extension(dependencies.temporal_client.map(Arc::new)))
        .layer(Extension(dependencies.domain_regex));

    if let Some(query_logger) = dependencies.query_logger {
        router = router.layer(Extension(query_logger));
    }

    router.merge(openapi_only_router())
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
            Real,
            PermissionResponse,

            BaseUrl,
            VersionedUrl,
            WebId,
            OntologyProvenance,
            OntologyEditionProvenance,
            ProvidedOntologyEditionProvenance,
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
            Subgraph,
            SubgraphTemporalAxes,

            TraversalEdge,
            TraversalPath,
            EntityTraversalEdge,
            EntityTraversalPath,
            EdgeDirection,

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
        fs::create_dir_all(path).attach_with(|| path.display().to_string())?;

        let openapi_json_path = path.join("openapi.json");

        {
            let mut writer = io::BufWriter::new(
                fs::File::create(&openapi_json_path)
                    .attach("could not write openapi.json")
                    .attach_with(|| openapi_json_path.display().to_string())?,
            );
            serde_json::to_writer_pretty(&mut writer, &openapi).map_err(io::Error::from)?;
            // Add a newline to the end of the file because many IDEs and tools expect or
            // automatically add a trailing newline.
            writeln!(&mut writer)?;
        }

        let model_def_path = std::path::Path::new(&env!("CARGO_MANIFEST_DIR"))
            .join("src")
            .join("rest")
            .join("json_schemas");

        let model_path_dir = path.join("models");
        fs::create_dir_all(&model_path_dir)
            .attach("could not create directory")
            .attach_with(|| model_path_dir.display().to_string())?;

        for file in STATIC_SCHEMAS.files() {
            let model_path_source = model_def_path.join(file.path());
            let model_path_target = model_path_dir.join(file.path());
            fs::copy(&model_path_source, &model_path_target)
                .attach("could not copy file")
                .attach_with(|| model_path_source.display().to_string())
                .attach_with(|| model_path_target.display().to_string())?;
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

struct ExternalRefAddon;

impl Modify for ExternalRefAddon {
    fn modify(&self, openapi: &mut openapi::OpenApi) {
        if let Some(ref mut components) = openapi.components {
            for (name, model) in [
                ("DataType", "data_type"),
                ("UpdateDataType", "update_data_type"),
                ("ClosedDataType", "closed_data_type"),
                ("PropertyType", "property_type"),
                ("UpdatePropertyType", "update_property_type"),
                ("EntityType", "entity_type"),
                ("UpdateEntityType", "update_entity_type"),
                ("ClosedEntityType", "closed_entity_type"),
                ("PartialEntityType", "partial_entity_type"),
                ("ClosedMultiEntityType", "closed_multi_entity_type"),
                ("Status", "status"),
                ("Report", "report"),
                ("MultiReport", "multi_report"),
            ] {
                *components.schemas.entry(name.to_owned()).or_default() =
                    Ref::new(format!("./models/{model}.json")).into();
            }
        }
    }
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
                                .title(Some("ExistsFilter"))
                                .property("exists", Ref::from_schema_name("PathExpression"))
                                .required("exists"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("GreaterFilter"))
                                .property(
                                    "greater",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(2))
                                        .max_items(Some(2)),
                                )
                                .required("notEqual"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("GreaterOrEqualFilter"))
                                .property(
                                    "greaterOrEqual",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(2))
                                        .max_items(Some(2)),
                                )
                                .required("notEqual"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("LessFilter"))
                                .property(
                                    "less",
                                    ArrayBuilder::new()
                                        .items(Ref::from_schema_name("FilterExpression"))
                                        .min_items(Some(2))
                                        .max_items(Some(2)),
                                )
                                .required("notEqual"),
                        )
                        .item(
                            ObjectBuilder::new()
                                .title(Some("LessOrEqualFilter"))
                                .property(
                                    "lessOrEqual",
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
                "PathExpression".to_owned(),
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
                                        .schema_type(SchemaType::String)
                                        .enum_values(Some(["convert"])),
                                )
                                .item(ObjectBuilder::new().schema_type(SchemaType::String))
                                .item(ObjectBuilder::new().schema_type(SchemaType::Number)),
                        ),
                    )
                    .required("path")
                    .build()
                    .into(),
            );
            components.schemas.insert(
                "ParameterExpression".to_owned(),
                ObjectBuilder::new()
                    .title(Some("ParameterExpression"))
                    .property("parameter", Any::schema().1)
                    .required("parameter")
                    .property("convert", ParameterConversion::schema().1)
                    .build()
                    .into(),
            );
            components.schemas.insert(
                "FilterExpression".to_owned(),
                schema::Schema::OneOf(
                    OneOfBuilder::new()
                        .item(Ref::from_schema_name("PathExpression"))
                        .item(Ref::from_schema_name("ParameterExpression"))
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
            components.schemas.insert(
                "PropertyValue".to_owned(),
                ObjectBuilder::new().schema_type(SchemaType::Value).into(),
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
