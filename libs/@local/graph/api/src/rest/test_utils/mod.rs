mod authentication;

use core::num::NonZeroU32;

use axum::{
    Router,
    body::{Body, to_bytes},
    response::Response,
};
use hash_middleware::rate_limit::PrincipalRateLimitConfig;
use http::Request;
use serde_json::Value;
use tower::ServiceExt as _;

pub(super) use self::authentication::assert_authentication;
pub(super) use super::caller::caller as echo_caller;

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

pub(crate) fn apis() -> Vec<super::Api> {
    super::apis(
        &PrincipalRateLimitConfig {
            anonymous_per_hour: NonZeroU32::MAX,
            anonymous_burst: NonZeroU32::MAX,
            actor_per_hour: NonZeroU32::MAX,
            actor_burst: NonZeroU32::MAX,
        }
        .into(),
    )
}
