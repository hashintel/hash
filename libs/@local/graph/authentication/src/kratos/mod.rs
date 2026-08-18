//! Ory Kratos implementations of [`AuthenticationProvider`].
//!
//! [`KratosSessionProvider`] verifies end-user sessions against the public API and reads the Graph
//! actor from the identity's `metadata_public`. This module carries the response handling and the
//! metadata the Graph exchanges with an identity.
//!
//! [`AuthenticationProvider`]: crate::provider::AuthenticationProvider

mod identity;
mod session;

use error_stack::{Report, ResultExt as _};
use reqwest::Response;
use serde::Deserialize;
use type_system::principal::actor::UserId;

pub use self::{
    identity::{KratosAdminConfig, KratosEmailActorResolver},
    session::{
        KratosSessionConfig, KratosSessionProvider, SESSION_COOKIE_NAME, SESSION_TOKEN_HEADER,
    },
};
use crate::request::AuthenticationError;

/// The `metadata_public` fields the Graph exchanges with a Kratos identity.
///
/// The Graph provisions this field, and it provisions it for users only.
#[derive(Deserialize)]
struct MetadataPublic {
    graph_actor_id: Option<UserId>,
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

/// Reads the body of a successful Kratos response, mapping failure statuses to errors.
///
/// Client errors report a provider rejection, any other unsuccessful status reports provider
/// unavailability. Callers that treat individual client errors as a credential failure check for
/// those before calling this.
///
/// # Errors
///
/// - [`ProviderRejection`] if Kratos reported a client error
/// - [`ProviderUnreachable`] for any other unsuccessful status, or if the body cannot be read
///
/// [`ProviderRejection`]: AuthenticationError::ProviderRejection
/// [`ProviderUnreachable`]: AuthenticationError::ProviderUnreachable
async fn read_response_body(response: Response) -> Result<String, Report<AuthenticationError>> {
    let status = response.status();
    if status.is_client_error() {
        return Err(Report::new(AuthenticationError::ProviderRejection)
            .attach(provider_response(status, response.text().await)));
    }
    if !status.is_success() {
        return Err(Report::new(AuthenticationError::ProviderUnreachable)
            .attach(provider_response(status, response.text().await)));
    }

    response
        .text()
        .await
        .change_context(AuthenticationError::ProviderUnreachable)
}

#[cfg(test)]
pub(crate) mod tests {
    use core::net::SocketAddr;

    use axum::Router;
    use reqwest::{Response, Url};
    use rstest::rstest;

    use super::{AuthenticationError, read_response_body};

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
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::ProviderRejection
            ),
            "a client error should report a provider rejection, got {:?}",
            report.current_context()
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
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::ProviderUnreachable
            ),
            "an unsuccessful status should report provider unavailability, got {:?}",
            report.current_context()
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
