mod authentication;

use alloc::sync::Arc;
use core::num::NonZero;

use aide::{
    OperationInput,
    openapi::{Info, SecurityScheme},
};
use axum::{
    Router,
    body::{Body, to_bytes},
    response::Response,
};
use hash_crypto::Secret;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hash_middleware::authentication::Challenge;
use http::Request;
use serde_json::Value;
use tokio_postgres::NoTls;
use tower::ServiceExt as _;

pub(super) use self::authentication::{assert_anonymous_authentication, assert_authentication};
pub(super) use super::caller::caller as echo_caller;
use super::{
    Api, ApiState, Audience, PublicApiConfig,
    credentials::Credentials,
    extract::Json,
    openapi,
    routing::{self, Routes},
};

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

/// The public and internal APIs, reading a store whose every `acquire` fails.
pub(crate) fn apis() -> Vec<Api> {
    let state = ApiState::new(
        Arc::new(unconnected_store()),
        None,
        PublicApiConfig {
            query_entity_limit: NonZero::new(100).expect("100 should not be zero"),
        },
    );
    super::apis::<PostgresStorePool>()
        .map(|api| api.with_state(state.clone()))
        .collect()
}

/// A store pool pointed at a Unix socket that does not exist, so every `acquire` fails.
fn unconnected_store() -> PostgresStorePool {
    PostgresStorePool::new(
        &DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            "graph-api-test".to_owned(),
            Secret::from_string(String::new()),
            "/no-graph-api-test-postgres".to_owned(),
            5432,
            "graph-api-test".to_owned(),
        ),
        &DatabasePoolConfig::default(),
        NoTls,
        PostgresStoreSettings::default(),
    )
    .expect("the pool should be built without connecting")
}

/// A public credential set documenting no security scheme.
pub(super) struct NoCredentials;

impl OperationInput for NoCredentials {}

impl Credentials for NoCredentials {
    const AUDIENCE: Audience = Audience::Public;
    const CHALLENGE: Challenge = Challenge::Bearer;

    fn schemes() -> impl IntoIterator<Item = (&'static str, SecurityScheme)> {
        core::iter::empty()
    }
}

/// A public API answering `GET {prefix}/test`.
pub(super) fn api(prefix: &'static str) -> Api {
    openapi::build::<NoCredentials, _>(
        prefix,
        Info::default(),
        || {
            Routes::new().route(
                "/test",
                routing::get(
                    async || Json::<_, 200>(String::from("ok")),
                    |operation| operation.id("test").summary("Answer `ok`"),
                ),
            )
        },
        |document| document,
    )
}
