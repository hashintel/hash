//! Ory Kratos implementation of [`AuthenticationProvider`].

use core::time::Duration;

use cookie::Cookie;
use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::store::error::DetermineActorError;
use http::{HeaderMap, header};
use reqwest::{Client, Url, redirect};
use serde::Deserialize;
use type_system::principal::actor::{ActorEntityUuid, ActorId};
use uuid::Uuid;

use crate::{
    actor::ResolveActor,
    provider::{Authentication, AuthenticationProvider},
    request::AuthenticationError,
};

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
                .change_context(AuthenticationError::MalformedCredential),
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

/// Formats a provider response for report attachments, truncating long bodies.
fn provider_response(status: reqwest::StatusCode, body: Result<String, reqwest::Error>) -> String {
    let Ok(body) = body else {
        return format!("provider response ({status}): <body unavailable>");
    };
    let mut snippet: String = body.chars().take(512).collect();
    if body.chars().nth(512).is_some() {
        snippet.push('\u{2026}');
    }
    format!("provider response ({status}): {snippet}")
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
    metadata_public: Option<WhoamiMetadataPublic>,
}

#[derive(Deserialize)]
struct WhoamiMetadataPublic {
    graph_actor_id: Option<Uuid>,
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
    ) -> Result<ActorId, Report<AuthenticationError>> {
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
            .change_context(AuthenticationError::ProviderUnreachable)?;

        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(Report::new(AuthenticationError::InvalidSession)
                .attach(provider_response(status, response.text().await)));
        }
        if status.is_client_error() {
            return Err(Report::new(AuthenticationError::ProviderRejection)
                .attach(provider_response(status, response.text().await)));
        }
        if !status.is_success() {
            return Err(Report::new(AuthenticationError::ProviderUnreachable)
                .attach(provider_response(status, response.text().await)));
        }

        let body = response
            .text()
            .await
            .change_context(AuthenticationError::ProviderUnreachable)?;
        // A whoami body carries the identity and its traits, so it stays out of the report.
        // Failure bodies above are Kratos error responses without identity data.
        let whoami: WhoamiResponse = serde_json::from_str(&body)
            .change_context(AuthenticationError::InvalidProviderResponse)?;

        // The schema does not require `active`, so only an explicit `true` passes.
        if whoami.active != Some(true) {
            return Err(Report::new(AuthenticationError::InvalidSession)
                .attach(format!("whoami reported active = {:?}", whoami.active)));
        }

        let Some(actor_uuid) = whoami
            .identity
            .metadata_public
            .and_then(|metadata| metadata.graph_actor_id)
        else {
            return Err(Report::new(AuthenticationError::NotProvisioned {
                identity_id: whoami.identity.id,
            }));
        };
        let actor_id = ActorEntityUuid::new(actor_uuid);

        match self.actor_resolver.resolve_actor(actor_id).await {
            Ok(Some(resolved @ ActorId::User(_))) => Ok(resolved),
            Ok(Some(_) | None) => Err(Report::new(AuthenticationError::NotAUser { actor_id })),
            Err(report) => match report.current_context() {
                DetermineActorError::ActorNotFound { .. } => {
                    Err(report.change_context(AuthenticationError::ActorNotFound { actor_id }))
                }
                DetermineActorError::StoreError => {
                    Err(report.change_context(AuthenticationError::StoreError))
                }
            },
        }
    }
}

impl<R> AuthenticationProvider for KratosSessionProvider<R>
where
    R: ResolveActor,
{
    async fn authenticate(&self, headers: &HeaderMap) -> Authentication {
        match extract_session_credential(headers) {
            None => Authentication::NotRecognized,
            Some(Err(report)) => Authentication::Rejected(report),
            Some(Ok(credential)) => match self.verify_session(credential).await {
                Ok(actor_id) => Authentication::Verified(actor_id),
                Err(report) => Authentication::Rejected(report),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use core::{net::SocketAddr, time::Duration};
    use std::collections::HashMap;

    use axum::{Json, Router, response::IntoResponse as _, routing::get};
    use error_stack::Report;
    use hash_graph_authorization::policies::store::error::DetermineActorError;
    use http::{HeaderMap, HeaderValue, StatusCode};
    use reqwest::Url;
    use serde_json::{Value as JsonValue, json};
    use type_system::principal::actor::{ActorEntityUuid, ActorId, MachineId, UserId};
    use uuid::Uuid;

    use super::{KratosSessionConfig, KratosSessionProvider, SESSION_COOKIE_NAME};
    use crate::{
        actor::ResolveActor,
        provider::{Authentication, AuthenticationProvider as _},
        request::AuthenticationError,
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

    /// Actor resolver serving a fixed set of actors.
    ///
    /// A `None` entry resolves to the public actor.
    struct FixedActorResolver {
        actors: HashMap<ActorEntityUuid, Option<ActorId>>,
    }

    impl ResolveActor for FixedActorResolver {
        fn resolve_actor(
            &self,
            actor_entity_uuid: ActorEntityUuid,
        ) -> impl Future<Output = Result<Option<ActorId>, Report<DetermineActorError>>> + Send
        {
            core::future::ready(self.actors.get(&actor_entity_uuid).copied().ok_or_else(|| {
                Report::new(DetermineActorError::ActorNotFound { actor_entity_uuid })
            }))
        }
    }

    fn known_user(actor_id: ActorEntityUuid) -> HashMap<ActorEntityUuid, Option<ActorId>> {
        HashMap::from([(actor_id, Some(ActorId::User(UserId::new(actor_id))))])
    }

    /// Binds a fake Kratos on an ephemeral port and returns its base URL.
    async fn spawn_fake_kratos(router: Router) -> Url {
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("the test server should bind to an ephemeral port");
        let address = listener
            .local_addr()
            .expect("the test listener should report its local address");
        tokio::spawn(async move {
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .expect("the test server should serve requests");
        });

        Url::parse(&format!("http://{address}"))
            .expect("the test server address should parse as a URL")
    }

    fn provider_at(
        url: Url,
        actors: HashMap<ActorEntityUuid, Option<ActorId>>,
    ) -> KratosSessionProvider<FixedActorResolver> {
        KratosSessionProvider::new(
            KratosSessionConfig {
                kratos_public_url: url,
                http_timeout: Duration::from_secs(5),
            },
            FixedActorResolver { actors },
        )
    }

    /// Spawns a fake Kratos serving the given session and returns a provider pointed at it.
    ///
    /// The fake only serves the session when the request carries the expected session token or
    /// session cookie, so any test that reaches verification also verifies credential forwarding.
    async fn provider_for(
        session: FakeSession,
        actors: HashMap<ActorEntityUuid, Option<ActorId>>,
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

    fn random_actor() -> ActorEntityUuid {
        ActorEntityUuid::new(Uuid::new_v4())
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

    #[track_caller]
    fn expect_rejection(authentication: Authentication) -> Report<AuthenticationError> {
        match authentication {
            Authentication::Rejected(report) => report,
            Authentication::NotRecognized | Authentication::Verified(_) => {
                panic!("the credential should be rejected, got {authentication:?}")
            }
        }
    }

    #[tokio::test]
    async fn session_token_resolves_provisioned_actor() {
        let actor_id = random_actor();
        let provider = provider_for(FakeSession::active_for(actor_id), known_user(actor_id)).await;

        let authentication = provider.authenticate(&session_token_header()).await;

        assert!(
            matches!(
                authentication,
                Authentication::Verified(ActorId::User(user_id)) if ActorEntityUuid::new(user_id) == actor_id
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

        let authentication = provider.authenticate(&headers).await;

        assert!(
            matches!(authentication, Authentication::Verified(ActorId::User(_))),
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

        let report = expect_rejection(provider.authenticate(&headers).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::MalformedCredential
            ),
            "a non-ASCII session token should be rejected as malformed, not ignored"
        );
    }

    #[tokio::test]
    async fn unprovisioned_identity_fails_authentication() {
        let provider = provider_for(FakeSession::unprovisioned(), HashMap::new()).await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::NotProvisioned { .. }
            ),
            "an identity without a provisioned actor should fail authentication"
        );
    }

    #[tokio::test]
    async fn unknown_actor_fails_authentication() {
        let provider = provider_for(FakeSession::active_for(random_actor()), HashMap::new()).await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::ActorNotFound { .. }
            ),
            "a session carrying an unknown actor should fail authentication"
        );
    }

    #[tokio::test]
    async fn machine_actor_fails_authentication() {
        let actor_id = random_actor();
        let provider = provider_for(
            FakeSession::active_for(actor_id),
            HashMap::from([(actor_id, Some(ActorId::Machine(MachineId::new(actor_id))))]),
        )
        .await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::NotAUser { .. }
            ),
            "a session resolving to a machine actor should fail authentication"
        );
    }

    #[tokio::test]
    async fn public_actor_fails_authentication() {
        let actor_id = random_actor();
        let provider = provider_for(
            FakeSession::active_for(actor_id),
            HashMap::from([(actor_id, None)]),
        )
        .await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::NotAUser { .. }
            ),
            "a session resolving to the public actor should fail authentication"
        );
    }

    #[tokio::test]
    async fn inactive_session_fails_authentication() {
        let actor_id = random_actor();
        let provider =
            provider_for(FakeSession::inactive_for(actor_id), known_user(actor_id)).await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidSession
            ),
            "an inactive session should fail authentication"
        );
    }

    #[tokio::test]
    async fn session_without_active_flag_fails_authentication() {
        let actor_id = random_actor();
        let provider = provider_for(
            FakeSession::without_active_flag(actor_id),
            known_user(actor_id),
        )
        .await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidSession
            ),
            "a session without an `active` flag should fail authentication"
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

        assert!(
            matches!(
                provider.authenticate(&headers).await,
                Authentication::NotRecognized
            ),
            "unrelated cookies should not be recognized as a session credential"
        );
    }

    #[tokio::test]
    async fn requests_without_credentials_carry_no_session_credential() {
        let provider = provider_for(FakeSession::unprovisioned(), HashMap::new()).await;

        assert!(
            matches!(
                provider.authenticate(&HeaderMap::new()).await,
                Authentication::NotRecognized
            ),
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

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidSession
            ),
            "a forbidden session should fail as an invalid session, not as provider unavailability"
        );
    }

    #[tokio::test]
    async fn rate_limited_provider_fails_verification() {
        let provider = provider_with_static_response(StatusCode::TOO_MANY_REQUESTS, "{}").await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::ProviderRejection
            ),
            "a rate-limited provider should fail as a provider rejection"
        );
    }

    #[tokio::test]
    async fn provider_error_fails_verification() {
        let provider = provider_with_static_response(StatusCode::INTERNAL_SERVER_ERROR, "{}").await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::ProviderUnreachable
            ),
            "a provider-side error should fail as provider unavailability"
        );
    }

    #[tokio::test]
    async fn redirecting_provider_fails_verification() {
        let provider = provider_with_static_response(StatusCode::FOUND, "").await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::ProviderUnreachable
            ),
            "a redirecting provider should fail verification instead of being followed"
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
            FixedActorResolver {
                actors: HashMap::new(),
            },
        );

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::ProviderUnreachable
            ),
            "a provider exceeding the HTTP timeout should fail as provider unavailability"
        );
    }

    #[tokio::test]
    async fn undeserializable_whoami_response_fails_verification() {
        let provider =
            provider_with_static_response(StatusCode::OK, r#"{"identity-like": "body"}"#).await;

        let report = expect_rejection(provider.authenticate(&session_token_header()).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidProviderResponse
            ),
            "an undeserializable whoami response should fail as an invalid provider response"
        );
        assert!(
            !format!("{report:?}").contains("identity-like"),
            "the report should not carry the whoami response body"
        );
    }
}
