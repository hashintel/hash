use alloc::sync::Arc;
use core::{num::NonZeroU32, ops::ControlFlow, pin::pin};
use std::collections::HashMap;

use aide::openapi::{Info, ReferenceOr, SecurityScheme};
use axum::{Router, body::Body};
use error_stack::Report;
use hash_crypto::Secret;
use hash_graph_authentication::{
    actor::tests::FixedActorResolver,
    api_token::{
        ApiTokenEncryptionKey, ApiTokenIssuer, ApiTokenProvider, ApiTokenRejection,
        AuthenticateApiToken, Environment,
    },
    cloudflare::ACCESS_JWT_HEADER,
    delegation::ServiceDelegationProvider,
    kratos::SESSION_TOKEN_HEADER,
};
use hash_graph_store::api_token::{
    ApiTokenAuthenticationError, ApiTokenCredential, ApiTokenEncryptionKeyId, ApiTokenId,
    ApiTokenName, ApiTokenVerificationError,
};
use hash_middleware::{
    authentication::{
        AuthenticationMetrics,
        provider::{AuthenticationProvider, Caller},
        request::{ACTOR_ID_HEADER, AuthenticationError},
    },
    rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode, RateLimiters},
};
use http::{
    HeaderMap, Request, StatusCode,
    header::{CONTENT_TYPE, WWW_AUTHENTICATE},
};
use serde_json::json;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, ActorType, UserId};
use uuid::Uuid;

use super::{echo_caller, response_json};
use crate::rest::{
    credentials::{API_TOKEN, Actor, AdmitsAnonymous, Credentials, MaybeActor},
    middleware::Middleware,
    openapi,
    routing::{self, Route, Routes},
};

const SERVICE_SECRET: &str = "hash-svc-test-secret";

/// Resolves `actor` for any request carrying the session token header.
struct SessionProvider {
    actor: ActorId,
}

impl<C: Caller> AuthenticationProvider<C> for SessionProvider {
    fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<C, Arc<Report<AuthenticationError>>>>> + Send {
        core::future::ready(if headers.contains_key(SESSION_TOKEN_HEADER) {
            ControlFlow::Break(Ok(C::from_actor(self.actor)))
        } else {
            ControlFlow::Continue(())
        })
    }
}

/// Answers every lookup as if the store could not be read.
struct UnreadableTokens;

impl AuthenticateApiToken for UnreadableTokens {
    fn authenticate_api_token<F>(
        &self,
        _token_id: ApiTokenId,
        _verify: F,
    ) -> impl Future<Output = Result<UserId, Report<ApiTokenAuthenticationError>>> + Send
    where
        F: FnOnce(&ApiTokenCredential) -> Result<(), ApiTokenVerificationError> + Send,
    {
        core::future::ready(Err(Report::new(ApiTokenAuthenticationError::Store)))
    }
}

fn issuer() -> ApiTokenIssuer {
    let mut key = pin!(Secret::<[u8; 32]>::zeroed());
    key.as_mut().expose_mut().fill(7);
    ApiTokenIssuer::new(
        ApiTokenEncryptionKey::new(ApiTokenEncryptionKeyId::new(Uuid::nil()), &key),
        Environment::Local,
    )
}

/// A well-formed local API token.
fn api_token() -> String {
    issuer()
        .issue(
            UserId::new(Uuid::new_v4()),
            ApiTokenName::new("ci".to_owned()).expect("the name should be valid"),
            None,
        )
        .expect("the API token should be issued")
        .token
        .to_secret()
        .expose()
        .to_owned()
}

/// The schemes a generated document advertises.
struct Advertised {
    session: bool,
    api_token: bool,
}

/// A `GET` route answering with the caller it reads through [`Actor`].
fn required_route<C: Credentials>() -> Route<()> {
    routing::get(
        async |actor: Actor<C>| echo_caller(Some(actor.into())).await,
        |operation| {
            operation
                .id("getRequiredCaller")
                .summary("Get the authenticated caller")
        },
    )
}

/// A `GET` route answering with the caller it reads through [`MaybeActor`].
fn optional_route<C: AdmitsAnonymous>() -> Route<()> {
    routing::get(echo_caller::<MaybeActor<C>>, |operation| {
        operation.id("getOptionalCaller").summary("Get the caller")
    })
}

/// Assembles the routes `build_routes` returns under `/test` behind the credentials `C`, with the
/// provider chains the router composes.
///
/// Returns the router and the schemes the generated document advertises.
fn caller_router<C: Credentials>(
    operator: ActorId,
    session_actor: ActorId,
    build_routes: impl FnOnce() -> Routes,
) -> (Router, Advertised) {
    let public_provider = Arc::new(ApiTokenProvider::new(
        UnreadableTokens,
        Some(Arc::new(issuer())),
    ));
    let internal_provider = Arc::new((
        ApiTokenRejection,
        SessionProvider {
            actor: session_actor,
        },
    ));
    let legacy_provider = Arc::new((
        ApiTokenRejection,
        ServiceDelegationProvider::new(
            Secret::from_string(SERVICE_SECRET.to_owned()).to_arc(),
            FixedActorResolver::new(HashMap::from([(operator.into(), operator)])),
        ),
    ));
    let meter = opentelemetry::global::meter("test");
    let config = RateLimitConfig {
        rate_limit_mode: RateLimitMode::Enforce,
        client_ip_source: ClientIpSource::ConnectInfo,
        rate_limit_gate_per_second: NonZeroU32::MAX,
        rate_limit_gate_burst: NonZeroU32::MAX,
        rate_limit_anonymous_per_hour: NonZeroU32::MAX,
        rate_limit_anonymous_burst: NonZeroU32::MAX,
        rate_limit_actor_per_hour: NonZeroU32::MAX,
        rate_limit_actor_burst: NonZeroU32::MAX,
    };
    let api = openapi::build::<C, _>("/test", Info::default(), build_routes, |document| document);
    let schemes = api
        .document()
        .components
        .as_ref()
        .map(|components| &components.security_schemes);
    let advertised = Advertised {
        session: schemes.is_some_and(|schemes| {
            schemes.values().any(|scheme| {
                matches!(
                    scheme,
                    ReferenceOr::Item(SecurityScheme::ApiKey { name, .. })
                        if name == SESSION_TOKEN_HEADER
                )
            })
        }),
        api_token: schemes.is_some_and(|schemes| schemes.contains_key(API_TOKEN)),
    };
    let middleware = Middleware {
        public_provider,
        internal_provider,
        legacy_provider,
        service_secret: Secret::from_string(SERVICE_SECRET.to_owned()).to_arc(),
        authentication_metrics: Arc::new(AuthenticationMetrics::new(&meter)),
        rate_limiters: RateLimiters::start(&config, &meter),
    };
    (
        middleware.assemble(Router::new(), [api], Router::new()),
        advertised,
    )
}

/// What a request to the caller routes of a credential set resolves to.
#[derive(Debug, Copy, Clone)]
enum Outcome {
    /// The caller is this actor, or anonymous.
    Caller(Option<ActorId>),
    /// The request fails with this status.
    Rejected(StatusCode),
}

/// Checks the resolved actor of each credential on `/test/required`, which reads it through
/// [`Actor`].
pub(in crate::rest) async fn assert_authentication<C: Credentials>() {
    assert_routes::<C>(&["/test/required"], || {
        Routes::new().route("/required", required_route::<C>())
    })
    .await;
}

/// Checks the resolved actor of each credential on `/test/optional`, which reads it through
/// [`MaybeActor`], and on `/test/required`.
pub(in crate::rest) async fn assert_anonymous_authentication<C: AdmitsAnonymous>() {
    assert_routes::<C>(&["/test/optional", "/test/required"], || {
        Routes::new()
            .route("/optional", optional_route::<C>())
            .route("/required", required_route::<C>())
    })
    .await;
}

/// Sends each credential to `paths` behind `C` and checks the resolved actor.
///
/// A session token resolves an actor exactly when `C` documents the session token header. Where
/// `C` documents the API token scheme, a bearer API token is looked up, which the unreadable store
/// answers with 503; elsewhere it is not accepted. An API token without the `Bearer` scheme is not
/// accepted either way, and an API token fails the request even where anonymous callers are
/// served. A service delegation and a Cloudflare Access JWT resolve as anonymous everywhere, which
/// `/test/required` answers with `401`. Every `401` challenges with `C::CHALLENGE`. This ties the
/// provider chain the audience selects to the schemes the document states.
async fn assert_routes<C: Credentials>(paths: &[&str], build_routes: impl FnOnce() -> Routes) {
    let operator = ActorId::new(Uuid::from_u128(1), ActorType::Machine);
    let session_actor = ActorId::new(Uuid::from_u128(2), ActorType::User);
    let (router, advertised) = caller_router::<C>(operator, session_actor, build_routes);
    let session = Outcome::Caller(advertised.session.then_some(session_actor));
    let api_token = api_token();
    let bearer_api_token = if advertised.api_token {
        Outcome::Rejected(StatusCode::SERVICE_UNAVAILABLE)
    } else {
        Outcome::Rejected(StatusCode::UNAUTHORIZED)
    };
    let challenge = C::CHALLENGE.scheme();

    for (headers, outcome) in [
        (Vec::new(), Outcome::Caller(None)),
        (vec![(SESSION_TOKEN_HEADER, "session".to_owned())], session),
        (
            vec![(ACCESS_JWT_HEADER, "access-token".to_owned())],
            Outcome::Caller(None),
        ),
        (
            vec![
                ("authorization", format!("HASH-Service {SERVICE_SECRET}")),
                (ACTOR_ID_HEADER, operator.to_string()),
            ],
            Outcome::Caller(None),
        ),
        (
            vec![("authorization", format!("Bearer {api_token}"))],
            bearer_api_token,
        ),
        (
            vec![("authorization", api_token)],
            Outcome::Rejected(StatusCode::UNAUTHORIZED),
        ),
    ] {
        for &path in paths {
            let mut request = Request::builder().uri(path);
            for (name, value) in &headers {
                request = request.header(*name, value);
            }
            let response = router
                .clone()
                .oneshot(
                    request
                        .body(Body::empty())
                        .expect("the request should build"),
                )
                .await
                .expect("the router should respond");
            let expected_status = match outcome {
                Outcome::Rejected(status) => status,
                Outcome::Caller(None) if path == "/test/required" => StatusCode::UNAUTHORIZED,
                Outcome::Caller(_) => StatusCode::OK,
            };
            assert_eq!(
                response.status(),
                expected_status,
                "{path} should enforce its credential scope for {headers:?}"
            );
            if expected_status == StatusCode::UNAUTHORIZED {
                let presented = response
                    .headers()
                    .get(WWW_AUTHENTICATE)
                    .and_then(|value| value.to_str().ok());
                assert!(
                    presented.is_some_and(|presented| presented.starts_with(challenge)),
                    "{path} should challenge {headers:?} with `{challenge}`, not {presented:?}"
                );
            }
            if let (StatusCode::OK, Outcome::Caller(expected_actor)) = (expected_status, outcome) {
                assert_eq!(
                    response_json(response).await,
                    json!({"actor": expected_actor}),
                    "{path} should resolve the caller for {headers:?}"
                );
            } else {
                assert_eq!(
                    response.headers()[CONTENT_TYPE],
                    "application/problem+json",
                    "{path} should reject {headers:?} with a problem document"
                );
            }
        }
    }
}
