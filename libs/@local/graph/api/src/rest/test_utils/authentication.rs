use alloc::sync::Arc;
use core::{num::NonZeroU32, ops::ControlFlow};
use std::collections::HashMap;

use aide::{
    OperationInput,
    axum::{ApiRouter, routing::get},
    openapi::OpenApi,
};
use axum::{Router, body::Body, extract::FromRequestParts};
use error_stack::Report;
use hash_graph_authentication::{
    actor::tests::FixedActorResolver,
    cloudflare::ACCESS_JWT_HEADER,
    delegation::ServiceDelegationProvider,
    kratos::{SESSION_COOKIE_NAME, SESSION_TOKEN_HEADER},
};
use hash_middleware::{
    authentication::{
        AuthenticationMetrics,
        provider::{AuthenticationProvider, Caller, StaticAuthenticationProvider},
        request::{ACTOR_ID_HEADER, AuthenticationError},
    },
    rate_limit::{
        ClientIpSource, PrincipalRateLimitConfig, RateLimitConfig, RateLimitMode, RateLimiters,
    },
};
use http::{HeaderMap, Request, StatusCode, header::CONTENT_TYPE};
use serde_json::json;
use tower::ServiceExt as _;
use type_system::principal::actor::{ActorId, ActorType};
use uuid::Uuid;

use super::{echo_caller, response_json};
use crate::rest::{Api, Audience, middleware::Middleware};

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

fn caller_router<Actor, MaybeActor>(
    audience: Audience,
    operator: ActorId,
    session_actor: ActorId,
) -> Router
where
    Actor: FromRequestParts<()> + OperationInput + Into<ActorId> + Send + 'static,
    MaybeActor: FromRequestParts<()> + OperationInput + Into<Option<ActorId>> + Send + 'static,
{
    let operator_provider = || {
        (
            HeaderProvider {
                headers: &[ACCESS_JWT_HEADER],
                actor: operator,
            },
            ServiceDelegationProvider::new(
                SERVICE_SECRET.to_owned(),
                FixedActorResolver::new(HashMap::from([(operator.into(), operator)])),
            ),
        )
    };
    let public_provider = Arc::new(operator_provider());
    let internal_provider = Arc::new((
        HeaderProvider {
            headers: &[SESSION_TOKEN_HEADER, "cookie"],
            actor: session_actor,
        },
        operator_provider(),
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
    let limiters = RateLimiters::start(&config, &meter);
    let mut document = OpenApi::default();
    let router = ApiRouter::new()
        .api_route("/optional", get(echo_caller::<MaybeActor>))
        .api_route(
            "/required",
            get(async |actor: Actor| echo_caller(Some(actor.into())).await),
        )
        .finish_api(&mut document);
    let middleware = Middleware {
        public_provider,
        internal_provider,
        service_secret: Arc::from(SERVICE_SECRET),
        authentication_metrics: Arc::new(AuthenticationMetrics::new(&meter)),
        rate_limiters: limiters,
        meter,
    };
    middleware.assemble(
        Router::new(),
        [Api {
            audience,
            rate_limits: PrincipalRateLimitConfig::from(&config),
            prefix: "/test",
            router,
            document,
        }],
        Router::new(),
    )
}

pub(in crate::rest) async fn assert_authentication<Actor, MaybeActor>(audience: Audience)
where
    Actor: FromRequestParts<()> + OperationInput + Into<ActorId> + Send + 'static,
    MaybeActor: FromRequestParts<()> + OperationInput + Into<Option<ActorId>> + Send + 'static,
{
    let operator = ActorId::new(Uuid::from_u128(1), ActorType::Machine);
    let session_actor = ActorId::new(Uuid::from_u128(2), ActorType::User);
    let session = match audience {
        Audience::Public => None,
        Audience::Internal => Some(session_actor),
    };
    let router = caller_router::<Actor, MaybeActor>(audience, operator, session_actor);

    for (headers, expected_actor, available) in [
        (Vec::new(), None, true),
        (
            vec![(SESSION_TOKEN_HEADER, "session".to_owned())],
            session,
            true,
        ),
        (
            vec![("cookie", format!("{SESSION_COOKIE_NAME}=session"))],
            session,
            true,
        ),
        (
            vec![(ACCESS_JWT_HEADER, "access-token".to_owned())],
            Some(operator),
            true,
        ),
        (
            vec![(ACCESS_JWT_HEADER, "unavailable".to_owned())],
            None,
            false,
        ),
        (vec![(ACTOR_ID_HEADER, operator.to_string())], None, true),
        (
            vec![
                ("authorization", format!("HASH-Service {SERVICE_SECRET}")),
                (ACTOR_ID_HEADER, operator.to_string()),
            ],
            Some(operator),
            true,
        ),
        (
            vec![
                (SESSION_TOKEN_HEADER, "session".to_owned()),
                ("authorization", format!("HASH-Service {SERVICE_SECRET}")),
                (ACTOR_ID_HEADER, operator.to_string()),
            ],
            session.or(Some(operator)),
            true,
        ),
    ] {
        for path in ["/optional", "/required"] {
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
            let expected_status = if !available {
                StatusCode::SERVICE_UNAVAILABLE
            } else if path == "/required" && expected_actor.is_none() {
                StatusCode::UNAUTHORIZED
            } else {
                StatusCode::OK
            };
            assert_eq!(
                response.status(),
                expected_status,
                "{path} should enforce its credential scope for {headers:?}"
            );
            if expected_status == StatusCode::OK {
                assert_eq!(
                    response_json(response).await,
                    json!({"actor": expected_actor})
                );
            } else {
                assert_eq!(response.headers()[CONTENT_TYPE], "application/problem+json");
            }
        }
    }
}
