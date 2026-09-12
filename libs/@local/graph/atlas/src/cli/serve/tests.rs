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
use clap::{Args as _, FromArgMatches as _};
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

use super::{ServeArgs, ServeCommand, ServeOptions, Serving};
use crate::{
    cli::RootArgs,
    device::PinnedDevice,
    file::generation::{GenerationRoot, ScratchDirectory},
    integrity::SecretString,
    math::nz,
    serve::{
        delta::DeltaTaskOptions, document::DocumentLimits, runtime::manager::ManagerOptions,
        visibility::cache::VisibilityLimits,
    },
};

/// A key in uppercase hex, the form most key exports and `hexdump` emit.
const UPPERCASE: &str = "6AD599A5C17E1FC4D7E2988BD4F3E0367F3C4A35D6DAE135F9A1E0EFC775CE55";

/// Parses `ServeArgs` from `arguments` and returns the rendered refusal.
fn refusal(arguments: &[&str]) -> String {
    ServeArgs::augment_args(clap::Command::new("serve"))
        .try_get_matches_from(arguments)
        .expect_err("an invalid secret refuses")
        .render()
        .to_string()
}

/// The rendered refusal names a position and none of the secret's characters.
#[track_caller]
fn assert_redacted(rendered: &str, secret: &str) {
    assert!(
        !rendered.contains(secret),
        "the whole secret reached the refusal:\n{rendered}"
    );
    for character in secret.chars() {
        assert!(
            !rendered.contains(&format!("'{character}'")),
            "a character of the secret reached the refusal:\n{rendered}"
        );
    }
}

fn parse(arguments: &[&str]) -> ServeArgs {
    let secret = UPPERCASE.to_ascii_lowercase();
    let mut invocation = vec!["serve", "--secret", secret.as_str()];
    invocation.extend_from_slice(arguments);
    let matches = ServeArgs::augment_args(clap::Command::new("serve"))
        .try_get_matches_from(invocation)
        .expect("valid serving arguments should parse");
    ServeArgs::from_arg_matches(&matches)
        .expect("parsed arguments should construct serving settings")
}

#[test]
fn options_mapping() {
    let args = parse(&[
        "--delta-poll-interval",
        "7",
        "--delta-safety-lag",
        "11",
        "--delta-retry-polls",
        "3",
        "--delta-placement-backlog",
        "19",
        "--delta-minimum-projection-interval",
        "4",
        "--generation-poll-interval",
        "2",
        "--unlink-expired-generations",
    ]);
    let delta = DeltaTaskOptions::from(args.delta);
    assert_eq!(delta.feed.tick_rate, Duration::from_secs(7));
    assert_eq!(delta.placement.tick_rate, delta.feed.tick_rate);
    assert_eq!(delta.feed.safety_lag, Duration::from_secs(11));
    assert_eq!(
        (
            delta.placement.tries_database,
            delta.placement.tries_workflow
        ),
        (3, 3)
    );
    assert_eq!(delta.placement.max_pending.get(), 19);
    assert_eq!(delta.placement.minimum_projection_interval, 4);

    let manager = ManagerOptions::from(args.manager);
    assert_eq!(manager.poll_interval, Duration::from_secs(2));
    assert!(
        manager.unlink,
        "the explicit unlink flag should enable removal"
    );
}

#[test]
fn limits_mapping() {
    let args = parse(&[
        "--colored-type-ids",
        "5",
        "--locate-edges",
        "9",
        "--edges",
        "11",
    ]);
    let limits = DocumentLimits::from(args.limits);
    assert_eq!(
        (limits.tile.colored_type_ids, limits.locate.colored_type_ids),
        (5, 5)
    );
    assert_eq!(limits.locate.edges, 9);
    assert_eq!(limits.edges.edges, 11);

    let defaults = parse(&[]);
    assert!(
        !ManagerOptions::from(defaults.manager).unlink,
        "removal should remain opt-in"
    );
}

#[test]
fn secret_uppercase() {
    assert_redacted(&refusal(&["serve", "--secret", UPPERCASE]), UPPERCASE);
}

#[test]
fn secret_trailing_newline() {
    let secret = format!("{}\n", UPPERCASE.to_ascii_lowercase());
    assert_redacted(&refusal(&["serve", "--secret", &secret]), &secret);
}

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

async fn serving() -> (ScratchDirectory, Serving) {
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
    })
    .expect("serving should construct before a generation exists");

    (scratch, serving)
}

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
