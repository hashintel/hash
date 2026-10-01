use alloc::borrow::Cow;
use core::assert_matches;

use aide::{
    axum::{
        ApiRouter,
        routing::{get, get_with, post},
    },
    openapi::{
        CookieStyle, HeaderStyle, Info, OpenApi, Parameter, ParameterData,
        ParameterSchemaOrContent, PathItem, ReferenceOr, Response, SchemaObject, StatusCode,
    },
    transform::TransformOperation,
};
use problematic::{Problem, ProblemDetails, ProblemType, ProblemVariant, Rejection, Variant};

use super::reference_responses;
use crate::rest::{
    Api,
    extract::{Path, Query},
    middleware, openapi,
    test_utils::NoCredentials,
};

/// The request uses an unsupported query.
#[derive(serde::Serialize, schemars::JsonSchema, derive_more::Display)]
#[display("The query is not supported.")]
struct UnsupportedQuery;

impl ProblemVariant for UnsupportedQuery {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("/problems/unsupported-query"),
        title: Cow::Borrowed("Unsupported query"),
        status: http::StatusCode::BAD_REQUEST,
    };
}

struct QueryProblem;

impl Problem for QueryProblem {
    const VARIANTS: &'static [Variant] = &[Variant::of::<UnsupportedQuery>()];
}

fn unsupported_query(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.response::<400, Rejection<QueryProblem>>()
}

fn response<'doc>(
    document: &'doc OpenApi,
    path: &str,
    method: &str,
    status: u16,
) -> &'doc ReferenceOr<Response> {
    let operation = |item: &'doc PathItem| match method {
        "get" => item.get.as_ref(),
        "post" => item.post.as_ref(),
        _ => None,
    };
    document
        .paths
        .as_ref()
        .and_then(|paths| paths.paths.get(path))
        .and_then(ReferenceOr::as_item)
        .and_then(operation)
        .and_then(|operation| operation.responses.as_ref())
        .and_then(|responses| responses.responses.get(&StatusCode::Code(status)))
        .expect("the route should document the response")
}

#[test]
fn shared_response_component() {
    let mut document = OpenApi::default();
    let _: axum::Router = ApiRouter::new()
        .api_route("/custom", get_with(|| async {}, unsupported_query))
        .api_route("/first", get(|| async {}))
        .api_route("/second", post(|| async {}))
        .finish_api_with(&mut document, |document| {
            document
                .with(middleware::document)
                .with(reference_responses)
        });

    assert_matches!(
        response(&document, "/first", "get", 400),
        ReferenceOr::Reference { .. },
        "the response most operations document should become the component"
    );
    assert_eq!(
        response(&document, "/first", "get", 400),
        response(&document, "/second", "post", 400),
        "every method documenting the shared response should reference the component"
    );
    let custom = &response(&document, "/custom", "get", 400)
        .as_item()
        .expect("the handler's distinct response should remain inline")
        .description;
    for variant in [
        "The request uses an unsupported query.",
        "The credentials are malformed.",
    ] {
        assert!(
            custom.contains(variant),
            "the distinct response should document the handler's variant beside the middleware's, \
             including `{variant}`"
        );
    }
}

fn teapot(operation: TransformOperation<'_>) -> TransformOperation<'_> {
    operation.response::<418, ProblemDetails<'static>>()
}

#[test]
fn component_names_keep_to_alphanumeric_keys() {
    let mut document = OpenApi::default();
    let _: axum::Router = ApiRouter::new()
        .api_route("/first", get_with(|| async {}, teapot))
        .api_route("/second", get_with(|| async {}, teapot))
        .finish_api_with(&mut document, |document| document.with(reference_responses));

    assert_eq!(
        response(&document, "/first", "get", 418),
        &ReferenceOr::ref_("#/components/responses/ImATeapot"),
        "the component name should drop the apostrophe of the canonical reason"
    );
}

#[test]
#[should_panic(expected = "should generate without errors")]
fn build_duplicate_response() {
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || {
            ApiRouter::new().api_route(
                "/duplicate",
                get_with(
                    || async {},
                    |operation| {
                        operation
                            .response::<400, ProblemDetails<'static>>()
                            .response::<400, ProblemDetails<'static>>()
                    },
                ),
            )
        },
        |document| document,
    );
}

/// Path parameters with a field the route has no placeholder for.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct DraftPath {
    entity: String,
    draft: String,
}

#[test]
#[should_panic(expected = "should document one path parameter per placeholder")]
fn build_path_placeholder_undocumented() {
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || {
            ApiRouter::new().api_route(
                "/entities/{entity}",
                get(async |Path((entity,)): Path<(String,)>| entity),
            )
        },
        |document| document,
    );
}

#[test]
#[should_panic(expected = "should document one path parameter per placeholder")]
fn build_path_parameter_without_placeholder() {
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || {
            ApiRouter::new().api_route(
                "/entities/{entity}",
                get(async |Path(DraftPath { entity, draft }): Path<DraftPath>| {
                    format!("{entity}/{draft}")
                }),
            )
        },
        |document| document,
    );
}

/// Path parameters with a field the path always carries.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct OptionalPath {
    entity: Option<String>,
}

/// Path parameters with a sequence for a field.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct SequencePath {
    entity: Vec<String>,
}

/// A value with fields of its own.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct Entity {
    id: String,
}

/// Path parameters with a struct for a field.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct StructPath {
    entity: Entity,
}

/// A single value with a name of its own.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct EntityUuid(String);

/// Path parameters with a newtype for a field.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct NewtypePath {
    entity: EntityUuid,
}

fn build_entity_route<T>(read: fn(T) -> String)
where
    T: serde::de::DeserializeOwned + schemars::JsonSchema + Send + 'static,
{
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || {
            ApiRouter::new().api_route(
                "/entities/{entity}",
                get(async move |Path(parameters): Path<T>| read(parameters)),
            )
        },
        |document| document,
    );
}

#[test]
#[should_panic(expected = "should require its path parameter `entity`")]
fn build_path_parameter_optional() {
    build_entity_route(|OptionalPath { entity }: OptionalPath| entity.unwrap_or_default());
}

#[test]
#[should_panic(expected = "should read its path parameter `entity` as a single value")]
fn build_path_parameter_sequence() {
    build_entity_route(|SequencePath { entity }: SequencePath| entity.concat());
}

#[test]
#[should_panic(expected = "should read its path parameter `entity` as a single value")]
fn build_path_parameter_struct() {
    build_entity_route(|StructPath { entity }: StructPath| entity.id);
}

/// A single value around a value with fields of its own.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct WrappedEntity(Entity);

/// Path parameters with a newtype around a struct for a field.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct WrappedPath {
    entity: WrappedEntity,
}

#[test]
#[should_panic(expected = "should read its path parameter `entity` as a single value")]
fn build_path_parameter_wrapped_struct() {
    build_entity_route(|WrappedPath { entity }: WrappedPath| entity.0.id);
}

#[test]
fn build_path_parameter_newtype_accepted() {
    build_entity_route(|NewtypePath { entity }: NewtypePath| entity.0);
}

/// Query parameters with a struct for a field.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct StructQuery {
    entity: Entity,
}

/// A choice between values with fields of their own.
#[derive(serde::Deserialize, schemars::JsonSchema)]
enum Filter {
    ById { id: String },
    ByName { name: String },
}

/// Query parameters with an enum of structs for a field.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct EnumQuery {
    filter: Filter,
}

/// Query parameters with an optional sequence of structs for a field.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct StructSequenceQuery {
    entities: Option<Vec<Entity>>,
}

/// Query parameters with single values and a sequence of them.
#[derive(serde::Deserialize, schemars::JsonSchema)]
struct ValuesQuery {
    ids: Vec<u8>,
    limit: Option<u8>,
}

fn build_query_route<T>(read: fn(T) -> String)
where
    T: serde::de::DeserializeOwned + schemars::JsonSchema + Send + 'static,
{
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || {
            ApiRouter::new().api_route(
                "/entities",
                get(async move |Query(parameters): Query<T>| read(parameters)),
            )
        },
        |document| document,
    );
}

#[test]
#[should_panic(
    expected = "should read its query parameter `entity` as a single value or a sequence"
)]
fn build_query_parameter_struct() {
    build_query_route(|StructQuery { entity }: StructQuery| entity.id);
}

#[test]
#[should_panic(
    expected = "should read its query parameter `filter` as a single value or a sequence"
)]
fn build_query_parameter_enum() {
    build_query_route(|EnumQuery { filter }: EnumQuery| match filter {
        Filter::ById { id } => id,
        Filter::ByName { name } => name,
    });
}

#[test]
#[should_panic(
    expected = "should read its query parameter `entities` as a single value or a sequence"
)]
fn build_query_parameter_struct_sequence() {
    build_query_route(|StructSequenceQuery { entities }: StructSequenceQuery| {
        entities
            .unwrap_or_default()
            .into_iter()
            .map(|entity| entity.id)
            .collect()
    });
}

#[test]
fn build_query_parameter_values_accepted() {
    build_query_route(|ValuesQuery { ids, limit }: ValuesQuery| format!("{ids:?} {limit:?}"));
}

#[test]
#[should_panic(expected = "should read its path parameter `entity` through `rest::extract::Path`")]
fn build_axum_path() {
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || {
            ApiRouter::new().api_route(
                "/entities/{entity}",
                get(
                    async |axum::extract::Path(NewtypePath { entity }): axum::extract::Path<
                        NewtypePath,
                    >| entity.0,
                ),
            )
        },
        |document| document,
    );
}

#[test]
#[should_panic(expected = "should read its query parameter `ids` through `rest::extract::Query`")]
fn build_axum_extra_query() {
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || {
            ApiRouter::new().api_route(
                "/entities",
                get(
                    async |axum_extra::extract::Query(ValuesQuery { ids, limit }): axum_extra::extract::Query<
                        ValuesQuery,
                    >| format!("{ids:?} {limit:?}"),
                ),
            )
        },
        |document| document,
    );
}

#[test]
#[should_panic(expected = "should read its request body through `rest::extract::Json`")]
fn build_bytes_body() {
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || ApiRouter::new().api_route("/entities", post(async |body: bytes::Bytes| body)),
        |document| document,
    );
}

fn build_with_parameter(parameter: Parameter) {
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        move || {
            ApiRouter::new().api_route(
                "/entities",
                get_with(
                    || async {},
                    move |mut operation| {
                        operation
                            .inner_mut()
                            .parameters
                            .push(ReferenceOr::Item(parameter));
                        operation
                    },
                ),
            )
        },
        |document| document,
    );
}

fn parameter_data(name: &str) -> ParameterData {
    ParameterData {
        name: name.to_owned(),
        description: None,
        required: false,
        deprecated: None,
        format: ParameterSchemaOrContent::Schema(SchemaObject {
            json_schema: schemars::json_schema!({ "type": "string" }),
            example: None,
            external_docs: None,
        }),
        example: None,
        examples: indexmap::IndexMap::new(),
        explode: None,
        extensions: indexmap::IndexMap::new(),
    }
}

#[test]
#[should_panic(expected = "should read no header parameter such as `x-trace`")]
fn build_header_parameter() {
    build_with_parameter(Parameter::Header {
        parameter_data: parameter_data("x-trace"),
        style: HeaderStyle::Simple,
    });
}

#[test]
#[should_panic(expected = "should read no cookie parameter such as `session`")]
fn build_cookie_parameter() {
    build_with_parameter(Parameter::Cookie {
        parameter_data: parameter_data("session"),
        style: CookieStyle::Form,
    });
}

#[test]
#[should_panic(expected = "should answer with JSON through `rest::extract::Json`")]
fn build_axum_json_response() {
    let _: Api = openapi::build::<NoCredentials>(
        "/test",
        Info::default(),
        || ApiRouter::new().api_route("/entities", get(async || axum::Json(0_u8))),
        |document| document,
    );
}
