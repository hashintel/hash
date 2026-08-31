//! Ory Kratos implementations of [`AuthenticationProvider`].
//!
//! [`KratosSessionProvider`] verifies end-user sessions against the public API and reads the Graph
//! actor from the identity's `metadata_public`. [`KratosAdminClient`] carries the transport for
//! the admin identity API. This module carries the response handling and the metadata the Graph
//! exchanges with an identity.
//!
//! [`AuthenticationProvider`]: hash_middleware::authentication::provider::AuthenticationProvider

mod admin;
mod identity;
mod session;

use error_stack::{Report, ResultExt as _};
use hash_middleware::authentication::request::AuthenticationError;
use reqwest::Response;
use serde::Deserialize;
use type_system::principal::actor::UserId;

pub use self::{
    admin::{
        AdminIdentity, IdentityDeletion, IdentityRecord, IdentityTraits, KratosAdminClient,
        KratosAdminError, VerifiableAddress,
    },
    identity::{KratosAdminConfig, KratosEmailActorResolver},
    session::{
        KratosSessionConfig, KratosSessionProvider, SESSION_COOKIE_NAME, SESSION_TOKEN_HEADER,
    },
};

/// The `metadata_public` fields the Graph exchanges with a Kratos identity.
///
/// The Graph provisions this field, and it provisions it for users only.
#[derive(Deserialize)]
pub struct MetadataPublic {
    pub graph_actor_id: Option<UserId>,
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

/// How a Kratos response failed before its body could be used.
///
/// Both Kratos error vocabularies map from this classification, so a status class fails the same
/// way on every path.
#[derive(Debug, derive_more::Display, derive_more::Error)]
enum ProviderFailure {
    /// Kratos rejected the request with a client error.
    #[display("the provider rejected the request")]
    Rejected,
    /// Kratos redirected or answered with a server error.
    ///
    /// A body that cannot be read counts as unavailable as well: the transport failed mid-body.
    #[display("the provider is unavailable")]
    Unavailable,
}

/// Reads the body of a successful Kratos response, classifying failure statuses.
///
/// Failure bodies are attached to the report, truncated by [`provider_response`]. Callers that
/// treat individual client errors as a credential failure check for those before calling this.
///
/// # Errors
///
/// - [`Rejected`] if Kratos reported a client error
/// - [`Unavailable`] for any other unsuccessful status, or if the body cannot be read
///
/// [`Rejected`]: ProviderFailure::Rejected
/// [`Unavailable`]: ProviderFailure::Unavailable
async fn read_provider_body(response: Response) -> Result<String, Report<ProviderFailure>> {
    let status = response.status();
    if status.is_client_error() {
        return Err(Report::new(ProviderFailure::Rejected)
            .attach(provider_response(status, response.text().await)));
    }
    if !status.is_success() {
        // A redirect reaches here because the redirect policy is disabled. Its body is usually
        // empty, so the target is what identifies the answering endpoint. The target is echoed
        // by the server, and a canonicalizing redirect carries the request's query string —
        // which holds the looked-up address — so only the origin and path survive.
        let redirect_target = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|target| target.to_str().ok())
            .and_then(|target| reqwest::Url::parse(target).ok())
            .map(|mut target| {
                target.set_query(None);
                target.set_fragment(None);
                format!("redirect target: {target}")
            });

        let mut report = Report::new(ProviderFailure::Unavailable)
            .attach(provider_response(status, response.text().await));
        if let Some(redirect_target) = redirect_target {
            report = report.attach(redirect_target);
        }
        return Err(report);
    }

    // A `reqwest::Error` renders the URL it failed on, and a lookup URL can carry the address it
    // was looking up. The instrumented span already records the base URL.
    response
        .text()
        .await
        .map_err(reqwest::Error::without_url)
        .change_context(ProviderFailure::Unavailable)
}

/// Reads a Kratos response body, restating a failure as an [`AuthenticationError`].
///
/// # Errors
///
/// - [`ProviderRejection`] if Kratos reported a client error
/// - [`ProviderUnreachable`] for any other unsuccessful status, or if the body cannot be read
///
/// [`ProviderRejection`]: hash_middleware::authentication::request::AuthenticationErrorKind::ProviderRejection
/// [`ProviderUnreachable`]: hash_middleware::authentication::request::AuthenticationErrorKind::ProviderUnreachable
async fn read_response_body(response: Response) -> Result<String, Report<AuthenticationError>> {
    read_provider_body(response).await.map_err(|report| {
        let context = match report.current_context() {
            ProviderFailure::Rejected => AuthenticationError::provider_rejection(),
            ProviderFailure::Unavailable => AuthenticationError::provider_unreachable(),
        };
        report.change_context(context)
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use core::{assert_matches, net::SocketAddr};

    use axum::Router;
    use hash_middleware::authentication::request::AuthenticationErrorKind;
    use reqwest::{Response, Url};
    use rstest::rstest;

    use super::read_response_body;

    /// Binds a fake Kratos on an ephemeral port and returns its base URL.
    pub(crate) async fn spawn_fake_kratos(router: Router) -> Url {
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

    fn response_with(status: http::StatusCode, body: &'static str) -> Response {
        Response::from(
            http::Response::builder()
                .status(status)
                .body(body)
                .expect("the response should build"),
        )
    }

    /// Each case covers a distinct rung of the status ladder.
    #[rstest]
    #[case::unauthorized(http::StatusCode::UNAUTHORIZED)]
    #[case::not_found(http::StatusCode::NOT_FOUND)]
    #[case::rate_limited(http::StatusCode::TOO_MANY_REQUESTS)]
    #[tokio::test]
    async fn client_errors_report_provider_rejection(#[case] status: http::StatusCode) {
        let report = read_response_body(response_with(status, "{}"))
            .await
            .expect_err("a client error should fail");
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::ProviderRejection,
            "a client error should report a provider rejection"
        );
    }

    /// Each case covers a status that reports the provider as unavailable rather than rejecting.
    #[rstest]
    #[case::server_error(http::StatusCode::INTERNAL_SERVER_ERROR)]
    #[case::bad_gateway(http::StatusCode::BAD_GATEWAY)]
    #[case::redirect(http::StatusCode::FOUND)]
    #[tokio::test]
    async fn unsuccessful_statuses_report_provider_unavailability(
        #[case] status: http::StatusCode,
    ) {
        let report = read_response_body(response_with(status, "{}"))
            .await
            .expect_err("an unsuccessful status should fail");
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::ProviderUnreachable,
            "an unsuccessful status should report provider unavailability"
        );
    }

    #[tokio::test]
    async fn successful_response_yields_body() {
        let body = read_response_body(response_with(http::StatusCode::OK, r#"{"ok":true}"#))
            .await
            .expect("a successful response should yield its body");
        assert_eq!(body, r#"{"ok":true}"#, "the body should be returned as-is");
    }

    #[tokio::test]
    async fn failure_body_reaches_the_report() {
        let report = read_response_body(response_with(
            http::StatusCode::TOO_MANY_REQUESTS,
            r#"{"error":"rate limited"}"#,
        ))
        .await
        .expect_err("a client error should fail");
        assert!(
            format!("{report:?}").contains("rate limited"),
            "a Kratos error body should reach the report for diagnosis"
        );
    }
}
