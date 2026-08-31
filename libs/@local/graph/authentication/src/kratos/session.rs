//! Kratos session verification against the public API.

use alloc::sync::Arc;
use core::{ops::ControlFlow, time::Duration};

use cookie::Cookie;
use error_stack::{Report, ResultExt as _};
use hash_middleware::authentication::{
    provider::{AuthenticationProvider, Caller},
    request::AuthenticationError,
};
use http::{HeaderMap, header};
use reqwest::{Client, Url, redirect};
use serde::Deserialize;
use type_system::principal::actor::{ActorEntityUuid, ActorId};

use super::{MetadataPublic, provider_response, read_response_body};
use crate::actor::{ResolveActor, resolve_user_actor};

/// Name of the header carrying a Kratos session token.
pub const SESSION_TOKEN_HEADER: &str = "X-Session-Token";
/// Name of the Kratos session cookie within the `Cookie` header.
pub const SESSION_COOKIE_NAME: &str = "ory_kratos_session";

/// A session credential extracted from request headers.
enum SessionCredential<'h> {
    /// A Kratos session token from the `X-Session-Token` header.
    Token(&'h str),
    /// The value of the `ory_kratos_session` cookie.
    Cookie(&'h str),
}

/// Extracts a session credential from request headers.
///
/// A session token takes precedence over the session cookie. Returns `None` when neither an
/// `X-Session-Token` header nor an `ory_kratos_session` cookie is present, and an error when the
/// token is present but not decodable. Cookies are matched by name, and pairs that do not decode
/// or parse are skipped, so unrelated cookies neither trigger session verification nor mask the
/// session cookie.
fn extract_session_credential(
    headers: &HeaderMap,
) -> Option<Result<SessionCredential<'_>, Report<AuthenticationError>>> {
    if let Some(token) = headers.get(SESSION_TOKEN_HEADER) {
        return Some(
            token
                .to_str()
                .map(SessionCredential::Token)
                .change_context(AuthenticationError::malformed_credential()),
        );
    }

    for cookie_header in headers.get_all(header::COOKIE) {
        // Pairs are split on the byte level so a cookie that does not decode leaves its
        // neighbours readable.
        let value = cookie_header
            .as_bytes()
            .split(|&byte| byte == b';')
            .filter_map(|pair| core::str::from_utf8(pair).ok())
            .filter_map(|pair| Cookie::parse(pair).ok())
            .find_map(|cookie| {
                if cookie.name() == SESSION_COOKIE_NAME {
                    cookie.value_raw()
                } else {
                    None
                }
            });
        if let Some(value) = value {
            return Some(Ok(SessionCredential::Cookie(value)));
        }
    }

    None
}

/// Deserialized subset of the Kratos whoami response.
#[derive(Deserialize)]
struct WhoamiResponse {
    active: Option<bool>,
    identity: WhoamiIdentity,
}

#[derive(Deserialize)]
struct WhoamiIdentity {
    id: String,
    metadata_public: Option<MetadataPublic>,
}

/// Configuration for [`KratosSessionProvider`].
#[derive(Debug, Clone)]
pub struct KratosSessionConfig {
    /// Base URL of the Kratos public API.
    pub kratos_public_url: Url,
    /// HTTP client timeout for whoami requests.
    pub http_timeout: Duration,
}

/// Verifies Kratos sessions and maps them to Graph actors.
///
/// Sessions are verified via the Kratos whoami endpoint. The actor is read from the
/// `graph_actor_id` field in the identity's `metadata_public` and checked to be an existing user
/// actor in the principal store.
pub struct KratosSessionProvider<R> {
    http_client: Client,
    whoami_url: Url,
    actor_resolver: R,
}

impl<R> KratosSessionProvider<R> {
    /// Creates a new session provider from the given configuration.
    ///
    /// # Panics
    ///
    /// Panics if the HTTP client cannot be built or the Kratos URL cannot be extended with the
    /// whoami path.
    #[must_use]
    pub fn new(config: KratosSessionConfig, actor_resolver: R) -> Self {
        let mut whoami_url = config.kratos_public_url;
        whoami_url
            .path_segments_mut()
            .expect("the Kratos public URL should be a valid base URL")
            .pop_if_empty()
            .extend(["sessions", "whoami"]);

        Self {
            // The whoami endpoint never redirects. Following a redirect would forward the
            // session token to the redirect target.
            http_client: Client::builder()
                .timeout(config.http_timeout)
                .redirect(redirect::Policy::none())
                .build()
                .expect("the HTTP client should build with default TLS configuration"),
            whoami_url,
            actor_resolver,
        }
    }
}

impl<R> KratosSessionProvider<R>
where
    R: ResolveActor,
{
    /// Verifies the credential against Kratos and validates the resulting actor.
    #[tracing::instrument(level = "debug", skip_all, fields(whoami_url = %self.whoami_url))]
    async fn verify_session(
        &self,
        credential: SessionCredential<'_>,
    ) -> Result<ActorEntityUuid, Report<AuthenticationError>> {
        let request = match credential {
            SessionCredential::Token(token) => self
                .http_client
                .get(self.whoami_url.clone())
                .header(SESSION_TOKEN_HEADER, token),
            SessionCredential::Cookie(cookie_value) => {
                self.http_client.get(self.whoami_url.clone()).header(
                    header::COOKIE,
                    format!("{SESSION_COOKIE_NAME}={cookie_value}"),
                )
            }
        };

        let response = request
            .send()
            .await
            .change_context(AuthenticationError::provider_unreachable())?;

        // Kratos answers an unknown or expired session with 401 or 403, which is a credential
        // failure rather than a provider fault.
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(Report::new(AuthenticationError::invalid_session())
                .attach(provider_response(status, response.text().await)));
        }

        let body = read_response_body(response).await?;
        // A whoami body carries the identity and its traits, so it stays out of the report. The
        // bodies that do get attached, here and in `read_response_body`, are Kratos error
        // responses without identity data.
        let whoami: WhoamiResponse = serde_json::from_str(&body)
            .change_context(AuthenticationError::invalid_provider_response())?;

        // The schema does not require `active`, so only an explicit `true` passes.
        if whoami.active != Some(true) {
            return Err(Report::new(AuthenticationError::invalid_session())
                .attach(format!("whoami reported active = {:?}", whoami.active)));
        }

        let Some(actor_uuid) = whoami
            .identity
            .metadata_public
            .and_then(|metadata| metadata.graph_actor_id)
        else {
            return Err(Report::new(AuthenticationError::not_provisioned(
                whoami.identity.id,
            )));
        };
        Ok(ActorEntityUuid::new(actor_uuid))
    }
}

impl<C, R> AuthenticationProvider<C> for KratosSessionProvider<R>
where
    C: Caller,
    R: ResolveActor,
{
    #[tracing::instrument(level = "debug", skip_all, fields(whoami_url = %self.whoami_url))]
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
        let credential = match extract_session_credential(headers) {
            None => return ControlFlow::Continue(()),
            Some(Err(report)) => return ControlFlow::Break(Err(Arc::new(report))),
            Some(Ok(credential)) => credential,
        };

        let resolution = async {
            let actor_uuid = self.verify_session(credential).await?;
            resolve_user_actor(&self.actor_resolver, actor_uuid).await
        };

        ControlFlow::Break(
            resolution
                .await
                .map(|user_id| C::from_actor(ActorId::User(user_id)))
                .map_err(Arc::new),
        )
    }
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, ops::ControlFlow, time::Duration};
    use std::collections::HashMap;

    use axum::{Json, Router, response::IntoResponse as _, routing::get};
    use hash_middleware::authentication::{
        provider::{AuthenticationProvider as _, expect_rejection},
        request::{ACTOR_ID_HEADER, AuthenticationError, AuthenticationErrorKind},
        service_secret::SERVICE_AUTH_SCHEME,
    };
    use http::{HeaderMap, HeaderValue, StatusCode};
    use reqwest::Url;
    use rstest::rstest;
    use serde_json::{Value as JsonValue, json};
    use type_system::principal::actor::{ActorEntityUuid, ActorId, MachineId};
    use uuid::Uuid;

    use super::{KratosSessionConfig, KratosSessionProvider, SESSION_COOKIE_NAME};
    use crate::{
        actor::tests::{FixedActorResolver, known_user, random_actor},
        delegation::ServiceDelegationProvider,
        kratos::tests::spawn_fake_kratos,
    };

    const SESSION_TOKEN: &str = "test-session-token";

    /// The whoami response a fake Kratos serves.
    struct FakeSession {
        active: Option<bool>,
        graph_actor_id: Option<ActorEntityUuid>,
    }

    impl FakeSession {
        /// An active session whose identity is provisioned for the given actor.
        const fn active_for(actor_id: ActorEntityUuid) -> Self {
            Self {
                active: Some(true),
                graph_actor_id: Some(actor_id),
            }
        }

        /// An inactive session whose identity is provisioned for the given actor.
        const fn inactive_for(actor_id: ActorEntityUuid) -> Self {
            Self {
                active: Some(false),
                graph_actor_id: Some(actor_id),
            }
        }

        /// A session response missing the `active` flag entirely.
        const fn without_active_flag(actor_id: ActorEntityUuid) -> Self {
            Self {
                active: None,
                graph_actor_id: Some(actor_id),
            }
        }

        /// An active session whose identity has no Graph actor provisioned.
        const fn unprovisioned() -> Self {
            Self {
                active: Some(true),
                graph_actor_id: None,
            }
        }

        /// Builds the whoami wire format.
        fn into_whoami_json(self) -> JsonValue {
            let mut identity = json!({ "id": Uuid::new_v4() });
            if let Some(actor_id) = self.graph_actor_id {
                identity["metadata_public"] = json!({ "graph_actor_id": actor_id });
            }
            let mut whoami = json!({ "id": Uuid::new_v4(), "identity": identity });
            if let Some(active) = self.active {
                whoami["active"] = json!(active);
            }
            whoami
        }
    }

    fn provider_at(
        url: Url,
        actors: HashMap<ActorEntityUuid, ActorId>,
    ) -> KratosSessionProvider<FixedActorResolver> {
        KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: url,
                http_timeout: Duration::from_secs(5),
            },
            FixedActorResolver::new(actors),
        )
    }

    /// Spawns a fake Kratos serving the given session and returns a provider pointed at it.
    ///
    /// The fake only serves the session when the request carries the expected session token or
    /// session cookie, so any test that reaches verification also verifies credential forwarding.
    async fn provider_for(
        session: FakeSession,
        actors: HashMap<ActorEntityUuid, ActorId>,
    ) -> KratosSessionProvider<FixedActorResolver> {
        let whoami = session.into_whoami_json();
        let router = Router::new().route(
            "/sessions/whoami",
            get(move |request_headers: HeaderMap| {
                let whoami = whoami.clone();
                async move {
                    let token_sent = request_headers
                        .get(super::SESSION_TOKEN_HEADER)
                        .is_some_and(|value| value.as_bytes() == SESSION_TOKEN.as_bytes());
                    let expected_cookie = format!("{SESSION_COOKIE_NAME}={SESSION_TOKEN}");
                    let cookie_sent = request_headers
                        .get_all(http::header::COOKIE)
                        .iter()
                        .any(|value| value.as_bytes() == expected_cookie.as_bytes());
                    if token_sent || cookie_sent {
                        Json(whoami).into_response()
                    } else {
                        StatusCode::UNAUTHORIZED.into_response()
                    }
                }
            }),
        );

        provider_at(spawn_fake_kratos(router).await, actors)
    }

    fn session_token_header() -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            super::SESSION_TOKEN_HEADER,
            SESSION_TOKEN
                .parse()
                .expect("the session token should be a valid header value"),
        );
        headers
    }

    #[tokio::test]
    async fn session_token_resolves_provisioned_actor() {
        let actor_id = random_actor();
        let provider = provider_for(FakeSession::active_for(actor_id), known_user(actor_id)).await;

        let authentication: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&session_token_header()).await;

        assert!(
            matches!(
                authentication,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                if ActorEntityUuid::new(user_id) == actor_id
            ),
            "a valid session should verify to the provisioned user actor"
        );
    }

    #[tokio::test]
    async fn session_cookie_resolves_provisioned_actor() {
        let actor_id = random_actor();
        let provider = provider_for(FakeSession::active_for(actor_id), known_user(actor_id)).await;

        // The unrelated cookie carries a non-ASCII value. It must neither mask the session
        // cookie nor poison the extraction.
        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::COOKIE,
            HeaderValue::from_bytes(
                format!("tracking=caf\u{e9}; {SESSION_COOKIE_NAME}={SESSION_TOKEN}").as_bytes(),
            )
            .expect("the cookie should be a valid header value"),
        );

        let authentication: ControlFlow<Result<ActorId, _>> = provider.authenticate(&headers).await;

        assert!(
            matches!(authentication, ControlFlow::Break(Ok(ActorId::User(_)))),
            "a session cookie next to non-ASCII cookies should verify"
        );
    }

    #[tokio::test]
    async fn malformed_session_token_fails_authentication() {
        let provider = provider_for(FakeSession::unprovisioned(), HashMap::new()).await;

        let mut headers = HeaderMap::new();
        headers.insert(
            super::SESSION_TOKEN_HEADER,
            HeaderValue::from_bytes(b"caf\xc3\xa9")
                .expect("the token should be a valid header value"),
        );

        let report = expect_rejection::<ActorId>(provider.authenticate(&headers).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::MalformedCredential,
            "a non-ASCII session token should be rejected as malformed, not ignored"
        );
    }

    /// A fixed actor, so a case can point the session and the resolver at the same one.
    ///
    /// A real version 4 UUID, because the wire types reject UUIDs without an RFC 4122 version.
    fn case_actor() -> ActorEntityUuid {
        ActorEntityUuid::new(
            Uuid::parse_str("d290f1ee-6c54-4b01-90e6-d701748f0851")
                .expect("the case UUID should parse"),
        )
    }

    /// Each case covers a distinct rejecting branch of session verification.
    #[rstest]
    #[case::unprovisioned_identity(
        FakeSession::unprovisioned(),
        HashMap::new(),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::NotProvisioned { .. })
    )]
    #[case::unknown_actor(
        FakeSession::active_for(case_actor()),
        HashMap::new(),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::ActorNotFound { .. })
    )]
    #[case::machine_actor(
        FakeSession::active_for(case_actor()),
        HashMap::from([(case_actor(), ActorId::Machine(MachineId::new(case_actor())))]),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::NotAUser { .. })
    )]
    #[case::inactive_session(
        FakeSession::inactive_for(case_actor()),
        known_user(case_actor()),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::InvalidSession)
    )]
    #[case::session_without_active_flag(
        FakeSession::without_active_flag(case_actor()),
        known_user(case_actor()),
        |error: &AuthenticationError| matches!(error.kind(), AuthenticationErrorKind::InvalidSession)
    )]
    #[tokio::test]
    async fn invalid_session_fails_authentication(
        #[case] session: FakeSession,
        #[case] actors: HashMap<ActorEntityUuid, ActorId>,
        #[case] expected: fn(&AuthenticationError) -> bool,
    ) {
        let provider = provider_for(session, actors).await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert!(
            expected(report.current_context()),
            "the session should fail authentication, got {:?}",
            report.current_context()
        );
    }

    #[tokio::test]
    async fn unrelated_cookies_carry_no_session_credential() {
        let provider = provider_for(FakeSession::unprovisioned(), HashMap::new()).await;

        let mut headers = HeaderMap::new();
        headers.insert(
            http::header::COOKIE,
            format!("analytics=on; theme=dark; my_{SESSION_COOKIE_NAME}_v2=nope")
                .parse()
                .expect("the cookie should be a valid header value"),
        );

        let decision: ControlFlow<Result<ActorId, _>> = provider.authenticate(&headers).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "unrelated cookies should not be recognized as a session credential"
        );
    }

    #[tokio::test]
    async fn requests_without_credentials_carry_no_session_credential() {
        let provider = provider_for(FakeSession::unprovisioned(), HashMap::new()).await;

        let decision: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&HeaderMap::new()).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "a request without session credentials should not be recognized"
        );
    }

    /// Spawns a fake Kratos serving a fixed response and returns a provider pointed at it.
    async fn provider_with_static_response(
        status: StatusCode,
        body: &'static str,
    ) -> KratosSessionProvider<FixedActorResolver> {
        let router = Router::new().route(
            "/sessions/whoami",
            get(move || async move { (status, body) }),
        );

        provider_at(spawn_fake_kratos(router).await, HashMap::new())
    }

    #[tokio::test]
    async fn forbidden_session_fails_authentication() {
        let provider = provider_with_static_response(StatusCode::FORBIDDEN, "{}").await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidSession,
            "a forbidden session should fail as an invalid session, not as provider unavailability"
        );
    }

    #[tokio::test]
    async fn redirecting_provider_fails_verification() {
        let provider = provider_with_static_response(StatusCode::FOUND, "").await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::ProviderUnreachable,
            "a redirecting provider should fail verification instead of being followed"
        );
    }

    /// A client error that is not 401 or 403 reports the provider, not the session.
    ///
    /// Widening the credential-failure check to every client error would tell a caller its session
    /// is invalid while Kratos is merely throttling.
    #[tokio::test]
    async fn rate_limited_provider_fails_verification() {
        let provider = provider_with_static_response(StatusCode::TOO_MANY_REQUESTS, "{}").await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::ProviderRejection,
            "a rate-limited provider should fail as a provider rejection, not as an invalid \
             session"
        );
    }

    #[tokio::test]
    async fn slow_provider_fails_verification() {
        let url = spawn_fake_kratos(Router::new().route(
            "/sessions/whoami",
            get(|| async {
                tokio::time::sleep(Duration::from_secs(5)).await;
                "{}"
            }),
        ))
        .await;
        let provider = KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: url,
                http_timeout: Duration::from_millis(100),
            },
            FixedActorResolver::new(HashMap::new()),
        );

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::ProviderUnreachable,
            "a provider exceeding the HTTP timeout should fail as provider unavailability"
        );
    }

    #[tokio::test]
    async fn undeserializable_whoami_response_fails_verification() {
        let provider =
            provider_with_static_response(StatusCode::OK, r#"{"identity-like": "body"}"#).await;

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&session_token_header()).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidProviderResponse,
            "an undeserializable whoami response should fail as an invalid provider response"
        );
        assert!(
            !format!("{report:?}").contains("identity-like"),
            "the report should not carry the whoami response body"
        );
    }

    const CHAIN_SERVICE_SECRET: &str = "hash-svc-chain-test-secret";

    fn with_delegation_pair(mut headers: HeaderMap, actor_id: ActorEntityUuid) -> HeaderMap {
        headers.insert(
            http::header::AUTHORIZATION,
            format!("{SERVICE_AUTH_SCHEME} {CHAIN_SERVICE_SECRET}")
                .parse()
                .expect("the credential should be a valid header value"),
        );
        headers.insert(
            ACTOR_ID_HEADER,
            actor_id
                .to_string()
                .parse()
                .expect("a UUID should be a valid header value"),
        );
        headers
    }

    #[tokio::test]
    async fn chain_rejects_invalid_session_despite_delegation_pair() {
        let chain = (
            provider_with_static_response(StatusCode::UNAUTHORIZED, "{}").await,
            ServiceDelegationProvider::new(
                CHAIN_SERVICE_SECRET.to_owned(),
                FixedActorResolver::new(HashMap::new()),
            ),
        );

        let headers = with_delegation_pair(session_token_header(), random_actor());

        let report = expect_rejection::<ActorId>(chain.authenticate(&headers).await);

        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidSession,
            "an invalid session should reject even when a valid delegation pair is present"
        );
    }

    #[tokio::test]
    async fn chain_resolves_session_actor_over_delegated_actor() {
        let session_actor = random_actor();
        let chain = (
            provider_for(
                FakeSession::active_for(session_actor),
                known_user(session_actor),
            )
            .await,
            ServiceDelegationProvider::new(
                CHAIN_SERVICE_SECRET.to_owned(),
                FixedActorResolver::new(HashMap::new()),
            ),
        );

        let headers = with_delegation_pair(session_token_header(), random_actor());

        let decision: ControlFlow<Result<ActorId, _>> = chain.authenticate(&headers).await;
        assert!(
            matches!(
                decision,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                    if ActorEntityUuid::new(user_id) == session_actor
            ),
            "a valid session should act as the session user, not the delegated actor"
        );
    }
}
