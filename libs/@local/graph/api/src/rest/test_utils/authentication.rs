use alloc::sync::Arc;
use core::{num::NonZeroU32, ops::ControlFlow};
use std::collections::HashMap;

use aide::{
    axum::{ApiRouter, routing::get},
    openapi::{Info, ReferenceOr, SecurityScheme},
};
use axum::{Router, body::Body};
use error_stack::Report;
use hash_graph_authentication::{
    actor::tests::FixedActorResolver,
    api_token::{
        ApiTokenEncryptionKey, ApiTokenIssuer, ApiTokenProvider, AuthenticateApiToken, Environment,
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
        provider::{AuthenticationProvider, Caller, StaticAuthenticationProvider},
        request::{ACTOR_ID_HEADER, AuthenticationError},
    },
    rate_limit::{ClientIpSource, RateLimitConfig, RateLimitMode, RateLimiters},
};
use http::{HeaderMap, Request, StatusCode, header::CONTENT_TYPE};
use serde_json::json;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, ActorType, UserId};
use uuid::Uuid;

use super::{echo_caller, response_json};
use crate::rest::{
    authentication::{internal_chain, public_chain},
    credentials::{API_TOKEN, Actor, Credentials, MaybeActor},
    middleware::Middleware,
    openapi,
};

const SERVICE_SECRET: &str = "hash-svc-test-secret";

struct HeaderProvider {
    headers: &'static [&'static str],
    actor: ActorId,
}

impl<C: Caller> AuthenticationProvider<C> for HeaderProvider {
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
        let Some(value) = self.headers.iter().find_map(|name| headers.get(*name)) else {
            return ControlFlow::Continue(());
        };
        if value == "unavailable" {
            StaticAuthenticationProvider::Unreachable
                .authenticate(headers)
                .await
        } else {
            ControlFlow::Break(Ok(C::from_actor(self.actor)))
        }
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
    ApiTokenIssuer::new(
        ApiTokenEncryptionKey::new(ApiTokenEncryptionKeyId::new(Uuid::nil()), &[7; 32]),
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
        .token
        .expose()
}

/// The schemes a generated document advertises.
struct Advertised {
    session: bool,
    api_token: bool,
}

/// Assembles `/test/optional` and `/test/required` behind the credentials `C`, with the provider
/// chains the router composes.
///
/// Returns the router and the schemes the generated document advertises.
fn caller_router<C: Credentials>(
    operator: ActorId,
    session_actor: ActorId,
) -> (Router, Advertised) {
    let explicit = || {
        ServiceDelegationProvider::new(
            SERVICE_SECRET.to_owned(),
            FixedActorResolver::new(HashMap::from([(operator.into(), operator)])),
        )
    };
    let environment = || HeaderProvider {
        headers: &[ACCESS_JWT_HEADER],
        actor: operator,
    };
    let public_provider = Arc::new(public_chain(
        ApiTokenProvider::new(UnreadableTokens, Some(Arc::new(issuer()))),
        explicit(),
        environment(),
    ));
    let internal_provider = Arc::new(internal_chain(
        explicit(),
        HeaderProvider {
            headers: &[SESSION_TOKEN_HEADER],
            actor: session_actor,
        },
        environment(),
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
    let api = openapi::build::<C>(
        "/test",
        Info::default(),
        || {
            ApiRouter::new()
                .api_route("/optional", get(echo_caller::<MaybeActor<C>>))
                .api_route(
                    "/required",
                    get(async |actor: Actor<C>| echo_caller(Some(actor.into())).await),
                )
        },
        |document| document,
    );
    let components = api.document().components.as_ref();
    let advertised = Advertised {
        session: components.is_some_and(|components| {
            components.security_schemes.values().any(|scheme| {
                matches!(
                    scheme,
                    ReferenceOr::Item(SecurityScheme::ApiKey { name, .. }) if name == SESSION_TOKEN_HEADER
                )
            })
        }),
        api_token: components
            .is_some_and(|components| components.security_schemes.contains_key(API_TOKEN)),
    };
    let middleware = Middleware {
        public_provider,
        internal_provider,
        service_secret: Arc::from(SERVICE_SECRET),
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

/// Sends each credential to the caller routes of `C` and checks the resolved actor.
///
/// A session token resolves an actor exactly when `C` documents the session token header. Where
/// `C` documents the API token scheme, a bearer API token is looked up, which the unreadable store
/// answers with 503, and one without the `Bearer` scheme is a bad request; elsewhere both are not
/// accepted. Either way an API token fails the request even where anonymous callers are served.
/// This ties the provider chain the audience selects to the schemes the document states.
pub(in crate::rest) async fn assert_authentication<C: Credentials>() {
    let operator = ActorId::new(Uuid::from_u128(1), ActorType::Machine);
    let session_actor = ActorId::new(Uuid::from_u128(2), ActorType::User);
    let (router, advertised) = caller_router::<C>(operator, session_actor);
    let session = Outcome::Caller(advertised.session.then_some(session_actor));
    let api_token = api_token();
    let (bearer_api_token, api_token_without_scheme) = if advertised.api_token {
        (
            Outcome::Rejected(StatusCode::SERVICE_UNAVAILABLE),
            Outcome::Rejected(StatusCode::BAD_REQUEST),
        )
    } else {
        (
            Outcome::Rejected(StatusCode::UNAUTHORIZED),
            Outcome::Rejected(StatusCode::UNAUTHORIZED),
        )
    };

    for (headers, outcome) in [
        (Vec::new(), Outcome::Caller(None)),
        (vec![(SESSION_TOKEN_HEADER, "session".to_owned())], session),
        (
            vec![(ACCESS_JWT_HEADER, "access-token".to_owned())],
            Outcome::Caller(Some(operator)),
        ),
        (
            vec![(ACCESS_JWT_HEADER, "unavailable".to_owned())],
            Outcome::Rejected(StatusCode::SERVICE_UNAVAILABLE),
        ),
        (
            vec![
                ("authorization", format!("HASH-Service {SERVICE_SECRET}")),
                (ACTOR_ID_HEADER, operator.to_string()),
            ],
            Outcome::Caller(Some(operator)),
        ),
        (
            vec![("authorization", format!("Bearer {api_token}"))],
            bearer_api_token,
        ),
        (vec![("authorization", api_token)], api_token_without_scheme),
    ] {
        for path in ["/test/optional", "/test/required"] {
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
