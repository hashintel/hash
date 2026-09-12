//! [`AuthorityScope`] and [`Renewal`] extraction with disk-backed generations.
//!
//! Requests prepopulate [`ActorCache`] to isolate authority checks from authentication middleware.

use alloc::sync::Arc;
use core::{
    future::{Future, poll_fn},
    pin::{Pin, pin},
    task::Poll,
    time::Duration,
};
use std::time::SystemTime;

use aide::{openapi::Operation, transform::TransformOperation};
use axum::{
    Extension, Json, Router,
    body::{Body as RequestBody, to_bytes},
    http::{Request, StatusCode},
    routing::get,
};
use camino::Utf8PathBuf;
use hash_graph_postgres_store::store::{
    DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStorePool,
    PostgresStoreSettings,
};
use rand::{
    SeedableRng as _, TryCryptoRng,
    rngs::{StdRng, SysRng},
};
use tokio::time::timeout;
use tokio_postgres::NoTls;
use tokio_util::sync::CancellationToken;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{
    super::{AppState, headers},
    Actor, ActorCache, AuthorityScope, Renewal,
};
use crate::{
    file::{
        generation::{Generation, GenerationId, GenerationRoot, ScratchDirectory},
        repository::Artifact as _,
        salt::artifact,
    },
    math::nz,
    morton::Zoom,
    serve::{
        authorization::authority::{Authority, Issue},
        delta::DeltaReference,
        document::DocumentLimits,
        hydrate::{CachedTypeUrlResolver, GraphDatabaseClient},
        runtime::{
            manager::{GenerationManager, ManagerOptions, source::RuntimeSource},
            registry::UniverseRegistry,
        },
        tests::fixture::{TamperFixture, secret},
        visibility::{
            cache::{FilterDigest, VisibilityLimits},
            resolver::ScopeResolver,
        },
    },
};

const BUDGET: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(5);
const RETENTION: Duration = Duration::from_secs(30);
const AUTH_SECRET: &[u8] = b"atlas-admission-test-authority-secret-material";
const LONG_EXPIRATION: Duration = Duration::from_secs(3600);

#[track_caller]
fn root_of(files: &TamperFixture) -> GenerationRoot {
    GenerationRoot::new(
        files
            .generation()
            .path()
            .parent()
            .expect("the fixture generation has a root"),
    )
    .expect("the fixture root should open")
}

#[track_caller]
fn variant_of(files: &TamperFixture, marker: &[u8]) -> Generation {
    files.tamper(&artifact::Representations::NAME, |path| {
        std::fs::remove_file(path).expect("the staged placeholder should be removable");
        std::fs::write(path, marker).expect("the variant placeholder should write");
    })
}

async fn pool() -> Arc<PostgresStorePool> {
    Arc::new(
        PostgresStorePool::new(
            &DatabaseConnectionInfo::new(
                DatabaseType::Postgres,
                "atlas-admission-test".to_owned(),
                String::new(),
                "/no-atlas-admission-test-postgres".to_owned(),
                5432,
                "atlas-admission-test".to_owned(),
            ),
            &DatabasePoolConfig {
                max_connections: nz!(1),
            },
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .expect("an unconnected pool should construct without reaching a database"),
    )
}

async fn boot(name: &str, retention: Duration) -> (TamperFixture, GenerationManager) {
    let files = TamperFixture::publish(name);
    root_of(&files)
        .activate(files.generation().id())
        .expect("the fixture generation should activate");

    let source = RuntimeSource {
        root: root_of(&files),
        secret: secret(),
        pool: pool().await,
        feed: None,
    };
    let manager = GenerationManager::new(
        source,
        ManagerOptions {
            poll_interval: POLL_INTERVAL,
            ..
        },
        retention,
    )
    .expect("a non-zero polling interval should construct a manager");

    (files, manager)
}

async fn advance<T>(
    mut running: Pin<&mut impl Future<Output = ()>>,
    mut probe: impl FnMut() -> Option<T>,
) -> T {
    timeout(
        BUDGET,
        poll_fn(|context| {
            assert!(
                running.as_mut().poll(context).is_pending(),
                "the run loop should not finish before its shutdown signal"
            );
            probe().map_or(Poll::Pending, Poll::Ready)
        }),
    )
    .await
    .expect("the maintenance pass should not stall")
}

/// A generation root whose scratch directory the returned handle removes.
#[track_caller]
fn scratch_root(name: &str) -> (ScratchDirectory, GenerationRoot) {
    let path = Utf8PathBuf::from_path_buf(std::env::temp_dir())
        .expect("the temp directory is UTF-8")
        .join(format!(
            "hash-graph-atlas-admission-test-{}-{name}",
            std::process::id()
        ));
    if let Err(error) = std::fs::remove_dir_all(&path) {
        assert_eq!(
            error.kind(),
            std::io::ErrorKind::NotFound,
            "the scratch root at {path} should be removable: {error}"
        );
    }
    let scratch = ScratchDirectory::new(path.clone());
    let root = GenerationRoot::new(path).expect("the scratch root should open");

    (scratch, root)
}

async fn test_state<R>(registry: Arc<UniverseRegistry>, tokens: Arc<Authority<R>>) -> AppState<R> {
    let visibility = VisibilityLimits {
        bytes: 1_000_000,
        soft: Duration::from_secs(1),
        hard: Duration::from_secs(60),
    };
    let pool = pool().await;
    let remote = Arc::new(GraphDatabaseClient::new(
        Arc::clone(&pool),
        tokio::runtime::Handle::current(),
    ));
    AppState {
        registry,
        limits: DocumentLimits { .. },
        visibility,
        tokens,
        scopes: Arc::new(ScopeResolver::new(pool, visibility)),
        type_urls: Arc::new(CachedTypeUrlResolver::new(Arc::clone(&remote))),
        remote,
    }
}

fn user_actor(id: u128) -> ActorId {
    ActorId::new(Uuid::from_u128(id), ActorType::User)
}

#[track_caller]
fn issue_token(
    tokens: &Authority<impl TryCryptoRng>,
    registry: &UniverseRegistry,
    generation: GenerationId,
    actor: ActorId,
    filter: Option<FilterDigest>,
    zoom: Zoom,
) -> String {
    let observation = registry
        .observe(Some(generation))
        .expect("the requested generation should observe for token issuance");
    tokens
        .issue(
            observation.requested().epoch(),
            SystemTime::now(),
            Issue {
                actor,
                filter,
                k: zoom,
            },
        )
        .expect("issuing a token should succeed")
        .to_string()
}

#[track_caller]
fn expected_reference(registry: &UniverseRegistry, generation: GenerationId) -> DeltaReference {
    registry
        .observe(Some(generation))
        .expect("the requested generation should observe")
        .requested()
        .epoch()
        .reference()
}

#[derive(Clone, Copy)]
struct ExpectedAdmission {
    generation: GenerationId,
    reference: DeltaReference,
}

#[derive(Clone, Copy)]
struct ExpectedContinuity(Option<(Option<FilterDigest>, Zoom)>);

fn expecting<T: Clone + Send + Sync + 'static>(
    mut req: Request<RequestBody>,
    value: T,
) -> Request<RequestBody> {
    req.extensions_mut().insert(value);
    req
}

async fn admission_probe(
    admission: AuthorityScope,
    Extension(expected): Extension<ExpectedAdmission>,
) -> Json<serde_json::Value> {
    assert_eq!(
        admission.observation.requested().epoch().generation(),
        expected.generation,
        "admission should preserve the captured requested generation",
    );
    assert_eq!(
        admission.observation.requested().epoch().reference(),
        expected.reference,
        "admission should preserve the captured requested delta",
    );
    Json(serde_json::json!({}))
}

async fn renewal_probe(
    renewal: Renewal,
    Extension(ExpectedContinuity(expected)): Extension<ExpectedContinuity>,
) -> Json<serde_json::Value> {
    assert_eq!(
        renewal.carried.map(|carried| (carried.filter, carried.k)),
        expected,
        "renewal should retain the expected continuity",
    );
    Json(serde_json::json!({}))
}

fn router(state: AppState<impl Send + 'static>) -> Router {
    Router::new()
        .route("/admission/{generation}/{variant}", get(admission_probe))
        .route("/renewal/{generation}", get(renewal_probe))
        .with_state(state)
}

fn request(
    prefix: &str,
    generation: &str,
    actor: ActorId,
    token: Option<&str>,
) -> Request<RequestBody> {
    let suffix = if prefix == "admission" { "/plain" } else { "" };
    let mut builder = Request::builder()
        .method("GET")
        .uri(format!("/{prefix}/{generation}{suffix}"))
        .extension(ActorCache(Ok(Actor(actor))));
    if let Some(token) = token {
        builder = builder.header(headers::AUTHORITY, token);
    }
    builder
        .body(RequestBody::empty())
        .expect("the request should build")
}

#[track_caller]
fn route_request(
    path: &str,
    actor: ActorId,
    token: Option<&str>,
    body: &serde_json::Value,
) -> Request<RequestBody> {
    let mut builder = Request::builder()
        .method("POST")
        .uri(path)
        .header("content-type", "application/json")
        .extension(ActorCache(Ok(Actor(actor))));
    if let Some(token) = token {
        builder = builder.header(headers::AUTHORITY, token);
    }
    builder
        .body(RequestBody::from(
            serde_json::to_vec(body).expect("the request body should serialize"),
        ))
        .expect("the request should build")
}

async fn call(app: &Router, req: Request<RequestBody>) -> (StatusCode, serde_json::Value) {
    let response = app
        .clone()
        .oneshot(req)
        .await
        .expect("the router should answer");
    let status = response.status();
    let bytes = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("the response body should read");
    let document = serde_json::from_slice(&bytes).expect("the response body should be JSON");
    (status, document)
}

#[track_caller]
fn assert_problem(
    status: StatusCode,
    document: &serde_json::Value,
    expected: StatusCode,
    kind: &str,
    message: &str,
) {
    assert_eq!(status, expected, "{message}");
    assert_eq!(
        document["type"],
        serde_json::json!(format!("/problems/atlas/{kind}")),
        "{message}",
    );
}

async fn missing_token_routes(app: &Router, generation_hex: &str, actor: ActorId) {
    let (status, document) = call(app, request("admission", generation_hex, actor, None)).await;
    assert_problem(
        status,
        &document,
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "admission without a token must refuse",
    );

    let (status, _document) = call(
        app,
        expecting(
            request("renewal", generation_hex, actor, None),
            ExpectedContinuity(None),
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "renewal without a token should still admit"
    );

    let (status, document) = call(
        app,
        request("renewal", generation_hex, actor, Some("not-a-hex-token")),
    )
    .await;
    assert_problem(
        status,
        &document,
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "a malformed token must refuse rather than bootstrap",
    );
}

async fn actor_token_routes(
    app: &Router,
    registry: &UniverseRegistry,
    generation_hex: &str,
    generation: GenerationId,
    actor: ActorId,
    other_actor: ActorId,
    token: &str,
) {
    let reference = expected_reference(registry, generation);
    let (status, _document) = call(
        app,
        expecting(
            request("admission", generation_hex, actor, Some(token)),
            ExpectedAdmission {
                generation,
                reference,
            },
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "a valid data token should admit");

    let (status, document) = call(
        app,
        request("admission", generation_hex, other_actor, Some(token)),
    )
    .await;
    assert_problem(
        status,
        &document,
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "a token presented by another actor must refuse",
    );
}

async fn generation_rejections(app: &Router, actor: ActorId, token: &str) {
    let unknown = "f".repeat(64);
    for (generation, expected, kind) in [
        (
            "not-a-generation",
            StatusCode::BAD_REQUEST,
            "invalid-generation",
        ),
        (
            unknown.as_str(),
            StatusCode::NOT_FOUND,
            "unknown-generation",
        ),
    ] {
        for prefix in ["admission", "renewal"] {
            let (status, document) =
                call(app, request(prefix, generation, actor, Some(token))).await;
            assert_problem(
                status,
                &document,
                expected,
                kind,
                "generation failures should retain their problem classification",
            );
        }
    }
}

async fn expired_token_routes(
    registry: Arc<UniverseRegistry>,
    generation: GenerationId,
    generation_hex: &str,
    actor: ActorId,
) {
    let expiring_tokens = Arc::new(
        Authority::new(AUTH_SECRET, Duration::ZERO, StdRng::seed_from_u64(3))
            .expect("the rng should draw a salt"),
    );
    let expiring_state = test_state(Arc::clone(&registry), Arc::clone(&expiring_tokens)).await;
    let expiring_app = router(expiring_state);
    let filter = FilterDigest::of(b"single-generation-expired-filter");
    let zoom = Zoom::new(3).expect("3 should fit the zoom domain");
    let expiring_token = issue_token(
        &expiring_tokens,
        &registry,
        generation,
        actor,
        Some(filter),
        zoom,
    );

    let (status, document) = call(
        &expiring_app,
        request("admission", generation_hex, actor, Some(&expiring_token)),
    )
    .await;
    assert_problem(
        status,
        &document,
        StatusCode::UNAUTHORIZED,
        "unauthorized",
        "an expired token must refuse admission",
    );

    let (status, _document) = call(
        &expiring_app,
        expecting(
            request("renewal", generation_hex, actor, Some(&expiring_token)),
            ExpectedContinuity(Some((Some(filter), zoom))),
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "renewal should still admit an expired token"
    );
}

#[tokio::test]
async fn token_lifecycle() {
    let (_files, mut manager) = boot("single-generation", RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();
    let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));

    let generation = advance(running.as_mut(), || {
        registry
            .observe(None)
            .ok()
            .map(|observation| observation.present().epoch().generation())
    })
    .await;
    let generation_hex = generation.to_string();

    let tokens = Arc::new(
        Authority::new(AUTH_SECRET, LONG_EXPIRATION, StdRng::seed_from_u64(1))
            .expect("the rng should draw a salt"),
    );
    let state = test_state(Arc::clone(&registry), Arc::clone(&tokens)).await;
    let app = router(state);

    let actor = user_actor(1);
    let other_actor = user_actor(2);

    missing_token_routes(&app, &generation_hex, actor).await;

    let token = issue_token(&tokens, &registry, generation, actor, None, Zoom::MIN);
    actor_token_routes(
        &app,
        &registry,
        &generation_hex,
        generation,
        actor,
        other_actor,
        &token,
    )
    .await;

    generation_rejections(&app, actor, &token).await;

    let mut unknown_variant = request("admission", &generation_hex, actor, Some(&token));
    *unknown_variant.uri_mut() = format!("/admission/{generation_hex}/missing")
        .parse()
        .expect("the variant request should build");
    let (status, document) = call(&app, unknown_variant).await;
    assert_problem(
        status,
        &document,
        StatusCode::NOT_FOUND,
        "unknown-variant",
        "an unsupported variant should be rejected before the handler",
    );

    expired_token_routes(registry, generation, &generation_hex, actor).await;

    shutdown.cancel();
    timeout(BUDGET, running.as_mut())
        .await
        .expect("the cancelled run should finish within its budget");
}

async fn generation_routes(
    app: &Router,
    actor: ActorId,
    [(generation_a, token_a), (generation_b, token_b)]: [(GenerationId, &str); 2],
) {
    for (generation, token) in [(generation_a, token_b), (generation_b, token_a)] {
        for (path, body) in [
            (
                format!("/v1/atlas/generation/{generation}/manifest"),
                serde_json::json!(false),
            ),
            (
                format!("/v1/atlas/tile/{generation}/plain/0/0/0"),
                serde_json::json!({}),
            ),
            (
                format!("/v1/atlas/edges/{generation}/plain"),
                serde_json::json!({"tiles": []}),
            ),
            (
                format!("/v1/atlas/locate/{generation}/plain"),
                serde_json::json!({"row": 0}),
            ),
            (
                format!("/v1/atlas/translate/{generation}/plain"),
                serde_json::json!({"entityIds": []}),
            ),
        ] {
            let (status, document) =
                call(app, route_request(&path, actor, Some(token), &body)).await;
            assert_problem(
                status,
                &document,
                StatusCode::UNAUTHORIZED,
                "unauthorized",
                &format!("{path} must reject authority for another generation"),
            );
        }
    }

    for (generation, token) in [(generation_a, token_a), (generation_b, token_b)] {
        let path = format!("/v1/atlas/generation/{generation}/manifest");
        for token in [Some(token), None] {
            let (status, document) = call(
                app,
                route_request(&path, actor, token, &serde_json::json!(false)),
            )
            .await;
            assert_problem(
                status,
                &document,
                StatusCode::BAD_REQUEST,
                "invalid-body",
                "manifest bootstrap and renewal should reach filter parsing without a variant",
            );
        }
    }
}

#[tokio::test]
async fn token_retained() {
    let (files, mut manager) = boot("cross-generation", RETENTION).await;
    let registry = Arc::clone(manager.registry());
    let shutdown = CancellationToken::new();
    let root = root_of(&files);
    let mut running = pin!(manager.run(shutdown.clone().cancelled_owned()));

    let generation_a = advance(running.as_mut(), || {
        registry
            .observe(None)
            .ok()
            .map(|observation| observation.present().epoch().generation())
    })
    .await;

    let tokens = Arc::new(
        Authority::new(AUTH_SECRET, LONG_EXPIRATION, SysRng).expect("the rng should draw a salt"),
    );
    let state = test_state(Arc::clone(&registry), Arc::clone(&tokens)).await;
    let routes = super::super::router(
        Arc::clone(&registry),
        Arc::clone(&tokens),
        state.limits,
        pool().await,
        state.visibility,
    );
    let app = router(state);
    let actor = user_actor(5);

    let token_a = issue_token(&tokens, &registry, generation_a, actor, None, Zoom::MIN);

    let replacement = variant_of(&files, b"token-retained variant");
    root.activate(replacement.id())
        .expect("the replacement generation should activate");
    let generation_b = advance(running.as_mut(), || {
        let observation = registry.observe(None).ok()?;
        let observed = observation.present().epoch().generation();
        (observed != generation_a).then_some(observed)
    })
    .await;

    let token_b = issue_token(&tokens, &registry, generation_b, actor, None, Zoom::MIN);
    generation_routes(
        &routes,
        actor,
        [(generation_a, &token_a), (generation_b, &token_b)],
    )
    .await;

    for (generation, token) in [(generation_a, &token_b), (generation_b, &token_a)] {
        let (status, document) = call(
            &app,
            request("admission", &generation.to_string(), actor, Some(token)),
        )
        .await;
        assert_problem(
            status,
            &document,
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "a token bound to another generation must refuse",
        );
    }

    for (generation, token) in [(generation_a, &token_a), (generation_b, &token_b)] {
        let (status, _document) = call(
            &app,
            expecting(
                request("admission", &generation.to_string(), actor, Some(token)),
                ExpectedAdmission {
                    generation,
                    reference: expected_reference(&registry, generation),
                },
            ),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::OK,
            "present and retained generations should admit their own tokens",
        );
    }

    shutdown.cancel();
    timeout(BUDGET, running.as_mut())
        .await
        .expect("the cancelled run should finish within its budget");
}

#[tokio::test]
async fn renewal_empty() {
    let (_scratch, root) = scratch_root("empty-registry");
    let source = RuntimeSource {
        root,
        secret: secret(),
        pool: pool().await,
        feed: None,
    };
    let mut manager = GenerationManager::new(
        source,
        ManagerOptions {
            poll_interval: POLL_INTERVAL,
            ..
        },
        RETENTION,
    )
    .expect("a non-zero polling interval should construct a manager");
    let registry = Arc::clone(manager.registry());
    let tokens = Arc::new(
        Authority::new(AUTH_SECRET, LONG_EXPIRATION, StdRng::seed_from_u64(6))
            .expect("the rng should draw a salt"),
    );
    let state = test_state(registry, tokens).await;
    let app = router(state);

    let (status, document) = call(
        &app,
        request("renewal", &"0".repeat(64), user_actor(7), None),
    )
    .await;
    assert_problem(
        status,
        &document,
        StatusCode::SERVICE_UNAVAILABLE,
        "visibility-unavailable",
        "an empty registry must refuse renewal with 503 after the actor resolves",
    );

    timeout(BUDGET, manager.shutdown())
        .await
        .expect("the empty manager's shutdown should finish within its budget");
}

#[test]
fn input_authority() {
    let mut admission_operation = Operation::default();
    let _documented = TransformOperation::new(&mut admission_operation).input::<AuthorityScope>();
    let admission =
        serde_json::to_value(admission_operation).expect("the operation should serialize");
    let admission_parameters = admission["parameters"]
        .as_array()
        .expect("admission should document parameters");
    assert_eq!(
        admission_parameters
            .iter()
            .filter(|parameter| parameter["in"] == "path")
            .map(|parameter| parameter["name"]
                .as_str()
                .expect("the name should be a string"))
            .collect::<Vec<_>>(),
        ["generation", "variant"],
        "data admission should document both path parameters exactly once",
    );
    let admission_header = admission_parameters
        .iter()
        .find(|parameter| parameter["name"] == "Atlas-Authority")
        .expect("admission should document the authority header");
    assert_eq!(
        admission_header["required"],
        serde_json::json!(true),
        "admission must require its authority header",
    );

    let mut renewal_operation = Operation::default();
    let _documented = TransformOperation::new(&mut renewal_operation).input::<Renewal>();
    let renewal = serde_json::to_value(renewal_operation).expect("the operation should serialize");
    let renewal_parameters = renewal["parameters"]
        .as_array()
        .expect("renewal should document parameters");
    let renewal_header = renewal_parameters
        .iter()
        .find(|parameter| parameter["name"] == "Atlas-Authority")
        .expect("renewal should document the authority header");
    // omitted `required` and explicit `false` both mean an optional header.
    assert_ne!(
        renewal_header["required"],
        serde_json::json!(true),
        "renewal's authority header must be optional",
    );
    assert_eq!(
        renewal_parameters
            .iter()
            .filter(|parameter| parameter["in"] == "path")
            .map(|parameter| parameter["name"]
                .as_str()
                .expect("the name should be a string"))
            .collect::<Vec<_>>(),
        ["generation"],
        "manifest renewal should document only its generation path parameter",
    );
}
