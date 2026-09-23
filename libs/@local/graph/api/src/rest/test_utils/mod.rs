mod authentication;

use aide::{
    OperationInput,
    axum::{ApiRouter, routing::get},
    openapi::{Info, SecurityScheme},
};
use axum::{
    Router,
    body::{Body, to_bytes},
    response::Response,
};
use http::Request;
use serde_json::Value;
use tower::ServiceExt as _;

pub(super) use self::authentication::assert_authentication;
pub(super) use super::caller::caller as echo_caller;
use super::{Api, Audience, credentials::Credentials, openapi};

pub(super) async fn request(router: &Router, path: &str) -> Response {
    router
        .clone()
        .oneshot(
            Request::builder()
                .uri(path)
                .body(Body::empty())
                .expect("the request should build"),
        )
        .await
        .expect("the router should respond")
}

pub(super) async fn response_json(response: Response) -> Value {
    let body = to_bytes(response.into_body(), 16 * 1024 * 1024)
        .await
        .expect("the response body should be readable");
    serde_json::from_slice(&body).expect("the response body should be JSON")
}

pub(crate) fn apis() -> Vec<Api> {
    super::apis().collect()
}

/// A public credential set documenting no security scheme.
pub(super) struct NoCredentials;

impl OperationInput for NoCredentials {}

impl Credentials for NoCredentials {
    const AUDIENCE: Audience = Audience::Public;

    fn schemes() -> impl IntoIterator<Item = (&'static str, SecurityScheme)> {
        core::iter::empty()
    }
}

/// A public API answering `GET {prefix}/test`.
pub(super) fn api(prefix: &'static str) -> Api {
    openapi::build::<NoCredentials>(
        prefix,
        Info::default(),
        || ApiRouter::new().api_route("/test", get(async || String::from("ok"))),
        |document| document,
    )
}
