use std::io;

use aide::{
    axum::{
        ApiRouter,
        routing::{get, post, post_with},
    },
    openapi::{Info, OpenApi, Operation, PathItem, Response, StatusCode},
};
use axum::{Router, body::Body, extract::DefaultBodyLimit};
use bytes::Bytes;
use hash_middleware::problem::InternalServerError;
use http::{Request, header::CONTENT_TYPE};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tower::ServiceExt as _;

use super::{Json, Path, Query};
use crate::rest::{openapi, test_utils::NoCredentials};

#[derive(Deserialize, JsonSchema)]
struct Subject {
    name: String,
}

#[derive(Deserialize, JsonSchema)]
struct Limit {
    limit: u8,
}

/// The status, the media type and the parsed body of one reply.
struct Reply {
    status: u16,
    content_type: Option<String>,
    body: Value,
}

async fn send(router: Router, request: Request<Body>) -> Reply {
    let response = router
        .oneshot(request)
        .await
        .expect("the router should answer");
    let status = response.status().as_u16();
    let content_type = response.headers().get(CONTENT_TYPE).map(|value| {
        value
            .to_str()
            .expect("the media type should be readable")
            .to_owned()
    });
    let body = axum::body::to_bytes(response.into_body(), 64 * 1024)
        .await
        .expect("the response body should be readable");
    Reply {
        status,
        content_type,
        body: serde_json::from_slice(&body).expect("the response body should be JSON"),
    }
}

/// A route reading a JSON body of at most `limit` bytes.
fn body_route(router: ApiRouter, limit: usize) -> ApiRouter {
    router.api_route(
        "/subject",
        post(async |Json(Subject { name }): Json<Subject>| name)
            .layer(DefaultBodyLimit::max(limit)),
    )
}

async fn post_body(content_type: &str, body: String) -> Reply {
    let request = Request::builder()
        .method("POST")
        .uri("/subject")
        .header(CONTENT_TYPE, content_type)
        .body(Body::from(body))
        .expect("the request should build");
    send(body_route(ApiRouter::new(), 32).into(), request).await
}

fn get_request(uri: &str) -> Request<Body> {
    Request::builder()
        .uri(uri)
        .body(Body::empty())
        .expect("the request should build")
}

/// Every extractor answers the same problem document, so only this case asserts its media type,
/// `status`, `type` and `detail`.
#[tokio::test]
async fn json_syntax_error() {
    let reply = post_body("application/json", "{ not json".to_owned()).await;

    assert_eq!(reply.status, 400, "a syntax error should answer 400");
    assert_eq!(
        reply.content_type.as_deref(),
        Some("application/problem+json"),
        "a rejection should answer a problem document"
    );
    assert_eq!(
        reply.body["status"], 400,
        "the document should carry its status"
    );
    assert_eq!(
        reply.body["type"], "about:blank",
        "the document should be typed by its status alone"
    );
    assert!(
        reply.body["detail"]
            .as_str()
            .is_some_and(|detail| !detail.is_empty()),
        "the document should explain the rejection, got {}",
        reply.body
    );
}

#[tokio::test]
async fn json_wrong_content_type() {
    let reply = post_body("text/plain", "name=n".to_owned()).await;

    assert_eq!(reply.status, 415, "a non-JSON media type should answer 415");
}

#[tokio::test]
async fn json_mistyped_body() {
    let reply = post_body("application/json", json!({ "name": 7 }).to_string()).await;

    assert_eq!(
        reply.status, 422,
        "a body of the wrong shape should answer 422"
    );
}

#[tokio::test]
async fn json_body_too_large() {
    let reply = post_body(
        "application/json",
        json!({ "name": "n".repeat(64) }).to_string(),
    )
    .await;

    assert_eq!(
        reply.status, 413,
        "a body over the route's limit should answer 413"
    );
}

#[tokio::test]
async fn json_body_unreadable() {
    let body = Body::from_stream(futures::stream::iter([
        Ok(Bytes::from_static(b"{")),
        Err(io::Error::other("the connection closed")),
    ]));
    let request = Request::builder()
        .method("POST")
        .uri("/subject")
        .header(CONTENT_TYPE, "application/json")
        .body(body)
        .expect("the request should build");

    let reply = send(body_route(ApiRouter::new(), 32).into(), request).await;

    assert_eq!(
        reply.status, 400,
        "a body that breaks off should answer 400"
    );
}

#[tokio::test]
async fn path_parameter_unparsable() {
    let router: Router = ApiRouter::new()
        .api_route(
            "/limit/{limit}",
            get(async |Path(Limit { limit }): Path<Limit>| limit.to_string()),
        )
        .into();

    let reply = send(router, get_request("/limit/over-nine-thousand")).await;

    assert_eq!(
        reply.status, 400,
        "an unparsable path parameter should answer 400"
    );
    assert!(
        reply.body["detail"]
            .as_str()
            .is_some_and(|detail| !detail.is_empty()),
        "the document should explain which parameter failed, got {}",
        reply.body
    );
}

/// A handler reading more path parameters than its route names is a defect of the route, so the
/// document says nothing about it.
#[tokio::test]
async fn path_parameters_mismatched() {
    let router: Router = ApiRouter::new()
        .api_route(
            "/limit/{limit}",
            get(async |Path((low, _)): Path<(u8, u8)>| low.to_string()),
        )
        .into();

    let reply = send(router, get_request("/limit/5")).await;

    assert_eq!(
        reply.status, 500,
        "a route naming fewer parameters than its handler reads should answer 500"
    );
    assert_eq!(
        reply.body["detail"],
        InternalServerError.to_string(),
        "the document should not describe the route's wiring"
    );
}

#[tokio::test]
async fn query_parameter_unparsable() {
    let router: Router = ApiRouter::new()
        .api_route(
            "/limit",
            get(async |Query(Limit { limit }): Query<Limit>| limit.to_string()),
        )
        .into();

    let reply = send(router, get_request("/limit?limit=over-nine-thousand")).await;

    assert_eq!(
        reply.status, 400,
        "an unparsable query parameter should answer 400"
    );
    assert!(
        reply.body["detail"]
            .as_str()
            .is_some_and(|detail| !detail.is_empty()),
        "the document should explain which parameter failed, got {}",
        reply.body
    );
}

fn documented<'a>(
    document: &'a OpenApi,
    path: &str,
    operation: impl Fn(&'a PathItem) -> Option<&'a Operation>,
    status: u16,
) -> Option<&'a Response> {
    operation(document.paths.as_ref()?.paths.get(path)?.as_item()?)?
        .responses
        .as_ref()?
        .responses
        .get(&StatusCode::Code(status))?
        .as_item()
}

fn is_problem_response(response: Option<&Response>) -> bool {
    response.is_some_and(|response| response.content.contains_key("application/problem+json"))
}

#[tokio::test]
async fn json_documents_body_rejections() {
    let mut document = OpenApi::default();
    let _: Router = body_route(ApiRouter::new(), 32).finish_api(&mut document);

    for status in [400, 413, 415, 422, 500] {
        assert!(
            is_problem_response(documented(
                &document,
                "/subject",
                |item| item.post.as_ref(),
                status
            )),
            "the operation should document {status} as a problem document"
        );
    }
}

#[tokio::test]
async fn path_documents_parameter_rejection() {
    let mut document = OpenApi::default();
    let _: Router = ApiRouter::new()
        .api_route(
            "/limit/{limit}",
            get(async |Path(Limit { limit }): Path<Limit>| limit.to_string()),
        )
        .finish_api(&mut document);

    assert!(
        is_problem_response(documented(
            &document,
            "/limit/{limit}",
            |item| item.get.as_ref(),
            400
        )),
        "the operation should document 400 as a problem document"
    );
}

#[tokio::test]
async fn query_documents_parameter_rejection() {
    let mut document = OpenApi::default();
    let _: Router = ApiRouter::new()
        .api_route(
            "/limit",
            get(async |Query(Limit { limit }): Query<Limit>| limit.to_string()),
        )
        .finish_api(&mut document);

    assert!(
        is_problem_response(documented(
            &document,
            "/limit",
            |item| item.get.as_ref(),
            400
        )),
        "the operation should document 400 as a problem document"
    );
}

/// The label the response repeats.
#[derive(Deserialize, JsonSchema)]
struct EchoPath {
    /// Repeated back as `label`.
    label: String,
}

/// How often the response repeats the value.
#[derive(Deserialize, JsonSchema)]
struct EchoQuery {
    /// How many copies of `value` the response carries. Defaults to one.
    repeat: Option<u8>,
}

/// The value the response repeats.
#[derive(Deserialize, JsonSchema)]
struct EchoRequest {
    /// Repeated back in `values`.
    value: String,
}

/// What the request carried.
#[derive(Serialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
struct EchoResponse {
    label: String,
    values: Vec<String>,
}

async fn echo(
    Path(EchoPath { label }): Path<EchoPath>,
    Query(EchoQuery { repeat }): Query<EchoQuery>,
    Json(EchoRequest { value }): Json<EchoRequest>,
) -> axum::Json<EchoResponse> {
    axum::Json(EchoResponse {
        label,
        values: vec![value; usize::from(repeat.unwrap_or(1))],
    })
}

/// An operation reading every extractor, documented like an operation of the Graph API, so the
/// snapshot shows how its rejections join the responses of the middleware.
#[test]
fn echo_document() {
    let api = openapi::build::<NoCredentials>(
        "/example",
        Info {
            title: "Extractor example".to_owned(),
            version: "1".to_owned(),
            ..Info::default()
        },
        || {
            ApiRouter::new().api_route(
                "/echo/{label}",
                post_with(echo, |operation| {
                    operation.id("echo").summary("Echo a request").description(
                        "Repeats what the request carried in its path, query string and body.",
                    )
                }),
            )
        },
        |document| document,
    );
    let mut document =
        serde_json::to_value(api.document()).expect("the document should be a JSON value");

    assert_eq!(
        document["paths"]["/example/echo/{label}"]["post"]["requestBody"].get("description"),
        None,
        "the body should leave its description to its schema"
    );

    document.sort_all_objects();
    insta::with_settings!({
        prepend_module_to_snapshot => false,
    }, {
        insta::assert_binary_snapshot!(
            "extract-example.json",
            serde_json::to_vec_pretty(&document).expect("the document should serialize")
        );
    });
}
