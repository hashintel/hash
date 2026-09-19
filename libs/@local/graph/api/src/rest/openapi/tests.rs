use core::assert_matches;

use aide::{
    axum::{
        ApiRouter,
        routing::{get, get_with, post},
    },
    openapi::{Info, OpenApi, PathItem, ReferenceOr, Response, StatusCode},
    transform::TransformOperation,
};
use problematic::ProblemDetails;

use super::reference_responses;
use crate::rest::{Api, middleware, openapi, test_utils::NoCredentials};

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
fn shared_response_becomes_component_over_earlier_override() {
    let mut document = OpenApi::default();
    let _: axum::Router = ApiRouter::new()
        .api_route(
            "/custom",
            get_with(
                || async {},
                |operation| {
                    operation.response_with::<400, ProblemDetails<'static>, _>(|response| {
                        response.description("The request uses an unsupported query.")
                    })
                },
            ),
        )
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
    assert_eq!(
        response(&document, "/custom", "get", 400)
            .as_item()
            .expect("the handler's distinct response should remain inline")
            .description,
        "The request uses an unsupported query.",
    );
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
fn build_panics_on_duplicate_response() {
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
