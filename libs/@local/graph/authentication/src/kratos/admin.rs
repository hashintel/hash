//! Transport for the Kratos admin identity API.
//!
//! Carries the URL construction, the redirect policy and the response handling every admin
//! identity call shares. Which identity a lookup accepts is policy and stays with the caller.

use core::time::Duration;

use error_stack::{Report, ResultExt as _};
use reqwest::{Client, Response, StatusCode, Url, redirect};
use serde::Deserialize;

use super::{MetadataPublic, ProviderFailure, read_provider_body};

/// Errors returned by the Kratos admin API calls.
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub enum KratosAdminError {
    /// The identifier to look up is empty.
    ///
    /// Kratos reads an empty `credentials_identifier` as no filter at all and answers with every
    /// identity it holds, so a lookup would resolve an arbitrary one.
    #[display("the identifier to look up is empty")]
    EmptyIdentifier,
    /// The admin API could not be reached, redirected, or answered with a server error.
    #[display("failed to reach the Kratos admin API")]
    Unreachable,
    /// The admin API rejected the request.
    #[display("the Kratos admin API rejected the request")]
    Rejected,
    /// The admin API answered with a body that could not be deserialized.
    #[display("the Kratos admin API returned an invalid response")]
    InvalidResponse,
}

/// The subset of a Kratos admin identity the Graph reads.
///
/// Deliberately not `Debug`: a rendered identity carries its addresses.
#[derive(Deserialize)]
pub struct AdminIdentity {
    /// The identity's own ID.
    pub id: String,
    /// The metadata the Graph provisions, carrying the actor.
    pub metadata_public: Option<MetadataPublic>,
    /// The addresses the identity may sign in with, and whether each is verified.
    #[serde(default)]
    pub verifiable_addresses: Vec<VerifiableAddress>,
}

/// The subset of a Kratos admin identity the by-ID read yields.
///
/// The traits live here rather than on [`AdminIdentity`], so a malformed traits object fails
/// this read alone and can never fail an identity listing.
///
/// Deliberately not `Debug`: a rendered identity carries its addresses.
#[derive(Deserialize)]
pub struct IdentityRecord {
    /// The identity's own ID.
    pub id: String,
    /// The traits the registration flow writes.
    ///
    /// The identity schema does not require the traits object itself, so a missing `traits`
    /// yields no addresses rather than failing the read.
    #[serde(default)]
    pub traits: IdentityTraits,
}

/// The observable outcome of an identity deletion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IdentityDeletion {
    /// The API held the identity and deleted it.
    Deleted,
    /// The API held no such identity.
    AlreadyAbsent,
}

/// An address of an identity, and whether the owner proved they hold it.
#[derive(Deserialize)]
pub struct VerifiableAddress {
    /// The address itself.
    pub value: String,
    /// Whether the owner completed verification for it.
    pub verified: bool,
}

/// The identity traits the Graph reads.
///
/// The identity schema requires the addresses, so a `traits` object without them fails the read
/// rather than reading as an identity without addresses.
#[derive(Default, Deserialize)]
pub struct IdentityTraits {
    /// The addresses the registration flow recorded.
    pub emails: Vec<String>,
}

/// Client for the Kratos admin identity API.
pub struct KratosAdminClient {
    http_client: Client,
    identities_url: Url,
}

impl KratosAdminClient {
    /// Creates a client against the given admin API base URL.
    ///
    /// # Panics
    ///
    /// Panics if the HTTP client cannot be built, or if the admin URL cannot carry a path.
    #[must_use]
    pub fn new(admin_url: Url, http_timeout: Duration) -> Self {
        // A base URL whose path ends in a slash keeps a trailing empty segment, which extending
        // would turn into a doubled separator: `/kratos/` + `admin` gives `/kratos//admin`.
        let mut identities_url = admin_url;
        identities_url
            .path_segments_mut()
            .expect("the Kratos admin URL should be a valid base URL")
            .pop_if_empty()
            .extend(["admin", "identities"]);

        // The admin endpoints never redirect. Following one would send the request — the
        // identifier in the query string and any credential — to the redirect target.
        Self {
            http_client: Client::builder()
                .redirect(redirect::Policy::none())
                .timeout(http_timeout)
                .build()
                .expect("the HTTP client should build with default TLS configuration"),
            identities_url,
        }
    }

    /// The identities endpoint the client addresses.
    #[must_use]
    pub const fn identities_url(&self) -> &Url {
        &self.identities_url
    }

    /// Returns every identity holding `identifier` as a credentials identifier.
    ///
    /// # Errors
    ///
    /// - [`EmptyIdentifier`] if `identifier` is empty
    /// - [`Unreachable`], [`Rejected`] or [`InvalidResponse`] from the request
    ///
    /// [`EmptyIdentifier`]: KratosAdminError::EmptyIdentifier
    /// [`Unreachable`]: KratosAdminError::Unreachable
    /// [`Rejected`]: KratosAdminError::Rejected
    /// [`InvalidResponse`]: KratosAdminError::InvalidResponse
    pub async fn list_by_credential(
        &self,
        identifier: &str,
    ) -> Result<Vec<AdminIdentity>, Report<KratosAdminError>> {
        if identifier.is_empty() {
            return Err(Report::new(KratosAdminError::EmptyIdentifier));
        }

        let mut url = self.identities_url.clone();
        url.query_pairs_mut()
            .append_pair("credentials_identifier", identifier);

        // The looked-up address travels in the query string, and a `reqwest::Error` renders the
        // URL it failed on. Dropping the URL keeps the address out of the report.
        let response = self
            .http_client
            .get(url)
            .send()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(KratosAdminError::Unreachable)?;

        let body = Self::read_body(response).await?;
        // An identity listing carries addresses and traits, so it stays out of the report.
        serde_json::from_str(&body).change_context(KratosAdminError::InvalidResponse)
    }

    /// Returns the identity with the given ID, or [`None`] where the API holds no such identity.
    ///
    /// # Errors
    ///
    /// [`Unreachable`], [`Rejected`] or [`InvalidResponse`] from the request.
    ///
    /// [`Unreachable`]: KratosAdminError::Unreachable
    /// [`Rejected`]: KratosAdminError::Rejected
    /// [`InvalidResponse`]: KratosAdminError::InvalidResponse
    pub async fn get_by_id(
        &self,
        identity_id: &str,
    ) -> Result<Option<IdentityRecord>, Report<KratosAdminError>> {
        let response = self
            .http_client
            .get(self.identity_url(identity_id))
            .send()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(KratosAdminError::Unreachable)?;

        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }

        let body = Self::read_body(response).await?;
        // An identity body carries addresses and traits, so it stays out of the report.
        serde_json::from_str(&body)
            .map(Some)
            .change_context(KratosAdminError::InvalidResponse)
    }

    /// Deletes the identity with the given ID, reporting whether the API held it.
    ///
    /// # Errors
    ///
    /// [`Unreachable`] or [`Rejected`] from the request.
    ///
    /// [`Unreachable`]: KratosAdminError::Unreachable
    /// [`Rejected`]: KratosAdminError::Rejected
    pub async fn delete_by_id(
        &self,
        identity_id: &str,
    ) -> Result<IdentityDeletion, Report<KratosAdminError>> {
        let response = self
            .http_client
            .delete(self.identity_url(identity_id))
            .send()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(KratosAdminError::Unreachable)?;

        if response.status() == StatusCode::NOT_FOUND {
            return Ok(IdentityDeletion::AlreadyAbsent);
        }

        Self::read_body(response)
            .await
            .map(|_body| IdentityDeletion::Deleted)
    }

    /// The URL of one identity.
    fn identity_url(&self, identity_id: &str) -> Url {
        let mut url = self.identities_url.clone();
        url.path_segments_mut()
            .expect("the identities URL should be a valid base URL")
            .push(identity_id);
        url
    }

    /// Reads a successful response body, restating a failure in the admin vocabulary.
    async fn read_body(response: Response) -> Result<String, Report<KratosAdminError>> {
        read_provider_body(response).await.map_err(|report| {
            let context = match report.current_context() {
                ProviderFailure::Rejected => KratosAdminError::Rejected,
                ProviderFailure::Unavailable => KratosAdminError::Unreachable,
            };
            report.change_context(context)
        })
    }
}

#[cfg(test)]
mod tests {
    use core::time::Duration;

    use axum::{
        Router,
        http::{StatusCode, header::LOCATION},
        response::IntoResponse as _,
        routing::get,
    };
    use rstest::rstest;

    use super::{IdentityDeletion, KratosAdminClient, KratosAdminError};
    use crate::kratos::tests::spawn_fake_kratos;

    /// A client against a fake whose by-ID endpoints answer with the given status.
    async fn client_answering(status: StatusCode) -> KratosAdminClient {
        let router = Router::new().route(
            "/admin/identities/{identity_id}",
            get(move || async move { (status, "{}") })
                .delete(move || async move { (status, "{}") }),
        );
        KratosAdminClient::new(spawn_fake_kratos(router).await, Duration::from_secs(5))
    }

    /// Each case covers a rung of the status ladder that must not read as an absent identity.
    #[rstest]
    #[case::unauthorized(StatusCode::UNAUTHORIZED, KratosAdminError::Rejected)]
    #[case::forbidden(StatusCode::FORBIDDEN, KratosAdminError::Rejected)]
    #[case::server_error(StatusCode::INTERNAL_SERVER_ERROR, KratosAdminError::Unreachable)]
    #[case::bad_gateway(StatusCode::BAD_GATEWAY, KratosAdminError::Unreachable)]
    #[case::redirect(StatusCode::FOUND, KratosAdminError::Unreachable)]
    #[tokio::test]
    async fn failure_statuses_fail_the_identity_read(
        #[case] status: StatusCode,
        #[case] expected: KratosAdminError,
    ) {
        let client = client_answering(status).await;

        // `expect_err` would ask `AdminIdentity` for a `Debug` it deliberately does not have:
        // a debug-rendered identity carries its addresses.
        let Err(report) = client.get_by_id("some-identity").await else {
            panic!("a failure status should fail the read rather than read as absent");
        };
        assert!(
            core::mem::discriminant(report.current_context()) == core::mem::discriminant(&expected),
            "a {status} should fail the read as {expected}, got {}",
            report.current_context()
        );
    }

    /// Each case covers a rung of the status ladder that must not count as a deletion.
    #[rstest]
    #[case::forbidden(StatusCode::FORBIDDEN, KratosAdminError::Rejected)]
    #[case::server_error(StatusCode::INTERNAL_SERVER_ERROR, KratosAdminError::Unreachable)]
    #[case::redirect(StatusCode::FOUND, KratosAdminError::Unreachable)]
    #[tokio::test]
    async fn failure_statuses_fail_the_deletion(
        #[case] status: StatusCode,
        #[case] expected: KratosAdminError,
    ) {
        let client = client_answering(status).await;

        let report = client
            .delete_by_id("some-identity")
            .await
            .expect_err("a failure status should fail the deletion rather than count as one");
        assert!(
            core::mem::discriminant(report.current_context()) == core::mem::discriminant(&expected),
            "a {status} should fail the deletion as {expected}, got {}",
            report.current_context()
        );
    }

    #[tokio::test]
    async fn successful_deletion_reports_the_identity_as_deleted() {
        let client = client_answering(StatusCode::NO_CONTENT).await;

        let deletion = client
            .delete_by_id("some-identity")
            .await
            .expect("a successful deletion should not fail");
        assert_eq!(
            deletion,
            IdentityDeletion::Deleted,
            "a 204 should report the identity as deleted"
        );
    }

    #[tokio::test]
    async fn absent_identity_reports_the_deletion_as_already_absent() {
        let client = client_answering(StatusCode::NOT_FOUND).await;

        let deletion = client
            .delete_by_id("some-identity")
            .await
            .expect("an absent identity should not fail the deletion");
        assert_eq!(
            deletion,
            IdentityDeletion::AlreadyAbsent,
            "a 404 should report the identity as already absent"
        );
    }

    #[tokio::test]
    async fn redirect_target_reaches_the_report() {
        let router = Router::new().route(
            "/admin/identities/{identity_id}",
            get(|| async {
                (
                    StatusCode::FOUND,
                    [(LOCATION, "http://elsewhere.example/admin/identities")],
                )
            }),
        );
        let client =
            KratosAdminClient::new(spawn_fake_kratos(router).await, Duration::from_secs(5));

        let Err(report) = client.get_by_id("some-identity").await else {
            panic!("a redirect should fail the read");
        };
        assert!(
            format!("{report:?}").contains("elsewhere.example"),
            "the redirect target should reach the report for diagnosis"
        );
    }

    /// A canonicalizing redirect echoes the request's query string, which carries the looked-up
    /// address.
    #[tokio::test]
    async fn redirect_target_query_stays_out_of_the_report() {
        let router = Router::new().route(
            "/admin/identities",
            get(|| async {
                (
                    StatusCode::FOUND,
                    [(
                        LOCATION,
                        "http://elsewhere.example/admin/identities?credentials_identifier=secret@example.com",
                    )],
                )
            }),
        );
        let client =
            KratosAdminClient::new(spawn_fake_kratos(router).await, Duration::from_secs(5));

        // `expect_err` would ask `AdminIdentity` for a `Debug` it deliberately does not have.
        let Err(report) = client.list_by_credential("secret@example.com").await else {
            panic!("a redirect should fail the lookup");
        };
        let rendered = format!("{report:?}");
        assert!(
            rendered.contains("elsewhere.example"),
            "the redirect target should reach the report for diagnosis"
        );
        assert!(
            !rendered.contains("secret@example.com"),
            "the echoed query string should stay out of the report"
        );
    }

    /// A followed redirect would send the request to the target, so the policy must surface the
    /// redirect instead — even when the target would answer with a valid identity.
    #[tokio::test]
    async fn redirect_to_a_serving_route_still_fails_the_read() {
        let router = Router::new()
            .route(
                "/admin/identities/{identity_id}",
                get(|headers: axum::http::HeaderMap| async move {
                    let host = headers
                        .get(axum::http::header::HOST)
                        .and_then(|host| host.to_str().ok())
                        .expect("the test request should carry a host header")
                        .to_owned();
                    (
                        StatusCode::FOUND,
                        [(LOCATION, format!("http://{host}/served"))],
                    )
                        .into_response()
                }),
            )
            .route(
                "/served",
                get(|| async { (StatusCode::OK, r#"{"id": "followed"}"#).into_response() }),
            );
        let client =
            KratosAdminClient::new(spawn_fake_kratos(router).await, Duration::from_secs(5));

        assert!(
            client.get_by_id("some-identity").await.is_err(),
            "the redirect should fail the read rather than be followed to the serving route"
        );
    }
}
