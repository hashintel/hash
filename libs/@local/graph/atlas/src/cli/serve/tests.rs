//! Request-layer ordering for the serving command.

use alloc::sync::Arc;
use core::{net::SocketAddr, ops::ControlFlow, time::Duration};

use axum::{
    Router,
    body::{Body, to_bytes},
    extract::ConnectInfo,
    http::{HeaderMap, Request, StatusCode, header, request::Builder},
    response::Response,
};
use camino::Utf8PathBuf;
use error_stack::Report;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use hash_middleware::{
    authentication::{
        provider::AuthenticationProvider,
        request::{
            ACTOR_ID_HEADER, AuthenticationError, AuthenticationErrorKind, actor_id_from_header,
        },
    },
    rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode},
};
use tokio::time::timeout;
use tokio_postgres::NoTls;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, UserId};

use super::{Serve, ServeCommand, ServeOptions, args::parse};
use crate::{
    cli::{RootArgs, Storage},
    device::PinnedDevice,
    file::generation::{GenerationRoot, ScratchDirectory},
    integrity::SecretString,
    math::nz,
    serve::visibility::cache::VisibilityLimits,
};

/// A header-only actor provider for isolated route checks.
struct HeaderActor;

impl AuthenticationProvider<ActorId> for HeaderActor {
    fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<ActorId, Arc<Report<AuthenticationError>>>>> + Send
    {
        core::future::ready(match actor_id_from_header(headers) {
            Ok(actor) => ControlFlow::Break(Ok(ActorId::User(UserId::new(actor)))),
            Err(error) if *error.kind() == AuthenticationErrorKind::MissingDelegatedActor => {
                ControlFlow::Continue(())
            }
            Err(error) => ControlFlow::Break(Err(Arc::new(Report::new(error)))),
        })
    }
}

/// Builds serving resources without connecting to the database.
///
/// The returned scratch directory must outlive the serving resources.
///
/// # Panics
///
/// Panics if the temporary directory is not UTF-8, filesystem setup fails, the unconnected pool
/// cannot be constructed, the arguments fail parsing, or serving construction fails.
async fn serving() -> (ScratchDirectory, Serve) {
    let temporary = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temporary directory should be UTF-8");
    let scratch = GenerationRoot::new(temporary)
        .expect("the temporary directory should open")
        .scratch()
        .expect("the scratch directory should create");
    let root = GenerationRoot::new(
        scratch
            .directory("generations")
            .expect("the root should create"),
    )
    .expect("the generation root should open");
    let pool = PostgresStorePool::new(
        &DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            "atlas-layer-test".to_owned(),
            String::new(),
            "/no-atlas-layer-test-postgres".to_owned(),
            5432,
            "atlas-layer-test".to_owned(),
        ),
        &DatabasePoolConfig {
            max_connections: nz!(1),
        },
        NoTls,
        PostgresStoreSettings::default(),
    )
    .await
    .expect("an unconnected pool should construct without reaching a database");
    let serving = ServeCommand::new(
        RootArgs {
            root,
            device: PinnedDevice::host(),
        },
        parse(&[]),
    )
    .run(ServeOptions {
        provider: Arc::new(HeaderActor),
        service_secret: SecretString::from("atlas-layer-test-service-secret"),
        rate_limit: RateLimitConfig {
            rate_limit_mode: RateLimitMode::Enforce,
            client_ip_source: ClientIpSource::ConnectInfo,
            rate_limit_gate_per_second: nz!(10),
            rate_limit_gate_burst: nz!(10),
            rate_limit_anonymous_per_hour: nz!(1),
            rate_limit_anonymous_burst: nz!(1),
            rate_limit_actor_per_hour: nz!(1),
            rate_limit_actor_burst: nz!(1),
        },
        pool: Arc::new(pool),
        visibility: VisibilityLimits {
            bytes: 1 << 30,
            soft: Duration::from_secs(8),
            hard: Duration::from_secs(10),
        },
        workflow: None,
        storage: Storage::in_temp_dir(),
    })
    .expect("serving should construct before a generation exists");

    (scratch, serving)
}

/// Dispatches a request with connection info under a bounded test wait.
///
/// # Panics
///
/// Panics if request construction fails or the router does not respond within five seconds.
async fn send(router: &Router, request: Builder) -> Response {
    timeout(
        Duration::from_secs(5),
        router.clone().oneshot(
            request
                .extension(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 12345))))
                .body(Body::empty())
                .expect("the request should build"),
        ),
    )
    .await
    .expect("the request should finish without store access")
    .expect("the router should respond")
}

/// Checks the problem media type and decodes its JSON body.
///
/// # Panics
///
/// Panics if the media type differs, the body exceeds 4096 bytes or cannot be read, or its bytes
/// are not JSON.
async fn problem(response: Response) -> serde_json::Value {
    assert_eq!(
        response.headers()[header::CONTENT_TYPE],
        "application/problem+json"
    );
    let bytes = to_bytes(response.into_body(), 4096)
        .await
        .expect("the problem body should fit within the limit");
    serde_json::from_slice(&bytes).expect("the problem body should be JSON")
}

#[tokio::test]
async fn layers_actor_budget() {
    let (_scratch, serving) = serving().await;
    let request = || {
        Request::get("/v1/atlas/openapi.json")
            .header(ACTOR_ID_HEADER, "00000000-0000-4000-8000-00000000da7a")
    };

    assert_eq!(
        send(&serving.router, request()).await.status(),
        StatusCode::OK
    );
    let response = send(&serving.router, request()).await;
    assert_eq!(response.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(response.headers().contains_key(header::RETRY_AFTER));
    let document = problem(response).await;
    assert_eq!(document["type"], "/problems/atlas/too-many-requests");
    assert_eq!(document["status"], 429);
}

#[tokio::test]
async fn layers_without_credentials() {
    let (_scratch, serving) = serving().await;
    let response = send(&serving.router, Request::get("/v1/atlas/current")).await;
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    let document = problem(response).await;
    assert_eq!(document["type"], "/problems/atlas/unauthenticated");
    assert_eq!(document["status"], 401);
}

#[tokio::test]
async fn liveness_without_credentials() {
    let (_scratch, serving) = serving().await;
    let response = send(&serving.router, Request::get("/status")).await;
    assert_eq!(response.status(), StatusCode::OK);
}
