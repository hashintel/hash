mod authentication;
mod caller;

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
use hash_graph_store::filter::protection::PropertyProtectionFilterConfig;
use hash_middleware::authentication::Challenge;
use http::Request;
use serde_json::Value;
use tower::ServiceExt as _;

pub(super) use self::{
    authentication::{assert_anonymous_authentication, assert_authentication},
    caller::caller as echo_caller,
};
use super::{
    Api, ApiState, Audience, CompilerState, PublicApiConfig,
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

/// A state whose store fails every `acquire`.
pub(crate) fn state() -> ApiState<PostgresStorePool> {
    ApiState::new(
        Arc::new(unconnected_store()),
        None,
        PublicApiConfig {
            query_entity_limit: const { NonZero::new(100).unwrap() },
        },
        Arc::new(CompilerState::new(None, NonZero::new(1))),
        Arc::new(PropertyProtectionFilterConfig::new()),
    )
}

/// The public and internal APIs, reading the store of [`state`].
pub(crate) fn apis() -> Vec<Api> {
    let state = state();
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
