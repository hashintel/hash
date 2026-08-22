use error_stack::{Report, ResultExt as _};
use hash_graph_authentication::kratos::MetadataPublic;
use hash_graph_store::identity_provider::{IdentityProvider, IdentityProviderError};
use reqwest::{Client, Url, redirect};
use serde::Deserialize;
use type_system::principal::actor::UserId;

/// Errors returned by [`KratosIdentityProvider::find_user_by_email`].
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum EmailLookupError {
    #[display("failed to look up the identity by email")]
    LookupFailed,
    #[display("identity `{identity_id}` has no Graph actor provisioned")]
    NotProvisioned { identity_id: String },
    #[display("{count} identities hold the email as a credentials identifier")]
    AmbiguousEmail { count: usize },
}

/// Deserialized subset of a Kratos admin identity.
#[derive(Deserialize)]
struct AdminIdentity {
    id: String,
    metadata_public: Option<MetadataPublic>,
    #[serde(default)]
    traits: IdentityTraits,
}

/// The identity traits the Graph reads.
///
/// An identity created outside the registration flow may carry no traits at all, so the addresses
/// default to none rather than failing the read.
#[derive(Default, Deserialize)]
struct IdentityTraits {
    #[serde(default)]
    emails: Vec<String>,
}

/// A Kratos identity resolved to its provisioned Graph actor.
#[derive(Debug)]
pub(crate) struct ResolvedUser {
    pub user_id: UserId,
    pub kratos_identity_id: String,
}

/// Ory Kratos implementation of [`IdentityProvider`].
pub(crate) struct KratosIdentityProvider {
    client: Client,
    admin_url: Url,
}

impl KratosIdentityProvider {
    /// Creates a new identity provider for the given Kratos admin URL.
    ///
    /// # Panics
    ///
    /// Panics if the HTTP client cannot be built.
    #[must_use]
    pub(crate) fn new(admin_url: Url) -> Self {
        Self {
            // The admin endpoints never redirect. Following a redirect would forward the request
            // — and the identity data it returns — to the redirect target.
            client: Client::builder()
                .redirect(redirect::Policy::none())
                .build()
                .expect("the HTTP client should build with default TLS configuration"),
            admin_url,
        }
    }

    /// Resolves the user actor owning the given email address.
    ///
    /// The identity is looked up by credentials identifier and the actor is read from the
    /// `graph_actor_id` field in its `metadata_public`. Unlike authentication, the lookup does not
    /// require the address to be verified: deletion must reach accounts that never completed
    /// verification.
    ///
    /// The resolved identity ID travels with the actor so that deletion does not have to read it
    /// back from the graph — the graph entity may already be gone from an earlier partial
    /// deletion.
    ///
    /// Returns `None` when no identity holds the email.
    ///
    /// # Errors
    ///
    /// - [`LookupFailed`] if the Kratos request fails or the response cannot be read
    /// - [`NotProvisioned`] if the identity carries no Graph actor
    /// - [`AmbiguousEmail`] if several identities hold the email
    ///
    /// [`LookupFailed`]: EmailLookupError::LookupFailed
    /// [`NotProvisioned`]: EmailLookupError::NotProvisioned
    /// [`AmbiguousEmail`]: EmailLookupError::AmbiguousEmail
    #[tracing::instrument(level = "debug", skip_all, fields(kratos_url = %self.admin_url))]
    pub(crate) async fn find_user_by_email(
        &self,
        email: &str,
    ) -> Result<Option<ResolvedUser>, Report<EmailLookupError>> {
        let mut url = self.admin_url.clone();
        url.path_segments_mut()
            .expect("admin URL is not a cannot-be-a-base URL")
            .extend(["admin", "identities"]);
        url.query_pairs_mut()
            .append_pair("credentials_identifier", email);

        // A `reqwest::Error` renders the URL it failed on, and the query string carries the
        // looked-up address. Dropping the URL keeps the address out of the report; the span
        // already carries the base URL.
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(EmailLookupError::LookupFailed)?;

        // `error_for_status` only covers 4xx/5xx — with redirects disabled, a 3xx has to be
        // rejected here as well.
        let status = response.status();
        if !status.is_success() {
            return Err(Report::new(EmailLookupError::LookupFailed)
                .attach(format!("Kratos responded with status {status}")));
        }

        let mut identities: Vec<AdminIdentity> = response
            .json()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(EmailLookupError::LookupFailed)?;

        let Some(identity) = identities.pop() else {
            return Ok(None);
        };
        if !identities.is_empty() {
            // Several identities hold the same address while one account claims an email it does
            // not own. Deleting either account on an ambiguous address is unsafe, so the operator
            // has to fall back to deletion by user ID.
            return Err(Report::new(EmailLookupError::AmbiguousEmail {
                count: identities.len() + 1,
            })
            .attach(format!(
                "identity ids: {}",
                identities
                    .iter()
                    .chain(core::iter::once(&identity))
                    .map(|identity| identity.id.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            )));
        }

        match identity
            .metadata_public
            .and_then(|metadata| metadata.graph_actor_id)
        {
            Some(user_id) => Ok(Some(ResolvedUser {
                user_id,
                kratos_identity_id: identity.id,
            })),
            None => Err(Report::new(EmailLookupError::NotProvisioned {
                identity_id: identity.id,
            })),
        }
    }
}

impl IdentityProvider for KratosIdentityProvider {
    #[tracing::instrument(level = "debug", skip(self), fields(kratos_url = %self.admin_url))]
    async fn delete_identity(
        &self,
        identity_id: &str,
    ) -> Result<(), Report<IdentityProviderError>> {
        let mut url = self.admin_url.clone();
        url.path_segments_mut()
            .expect("admin URL is not a cannot-be-a-base URL")
            .extend(["admin", "identities", identity_id]);

        let response = self
            .client
            .delete(url)
            .send()
            .await
            .change_context(IdentityProviderError::DeletionFailed)?;

        // 404 means the identity was already deleted — treat as success for idempotency
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            tracing::info!(%identity_id, "Kratos identity already deleted");
            return Ok(());
        }

        // `error_for_status` only covers 4xx/5xx — with redirects disabled, a 3xx has to be
        // rejected here as well.
        if !status.is_success() {
            return Err(Report::new(IdentityProviderError::DeletionFailed)
                .attach(format!("Kratos responded with status {status}")));
        }

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self), fields(kratos_url = %self.admin_url))]
    async fn get_identity_emails(
        &self,
        identity_id: &str,
    ) -> Result<Vec<String>, Report<IdentityProviderError>> {
        let mut url = self.admin_url.clone();
        url.path_segments_mut()
            .expect("admin URL is not a cannot-be-a-base URL")
            .extend(["admin", "identities", identity_id]);

        let response = self
            .client
            .get(url)
            .send()
            .await
            .change_context(IdentityProviderError::LookupFailed)?;

        // An identity deleted between resolution and this read holds no addresses.
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND {
            tracing::info!(%identity_id, "Kratos identity no longer exists");
            return Ok(Vec::new());
        }

        // `error_for_status` only covers 4xx/5xx — with redirects disabled, a 3xx has to be
        // rejected here as well.
        if !status.is_success() {
            return Err(Report::new(IdentityProviderError::LookupFailed)
                .attach(format!("Kratos responded with status {status}")));
        }

        // A `reqwest::Error` renders the URL it failed on, which carries the identity ID. The
        // span already records the base URL.
        let identity: AdminIdentity = response
            .json()
            .await
            .map_err(reqwest::Error::without_url)
            .change_context(IdentityProviderError::LookupFailed)?;

        Ok(identity.traits.emails)
    }
}

#[cfg(test)]
mod tests {
    use core::net::SocketAddr;
    use std::collections::HashMap;

    use axum::{Json, Router, extract::Query, response::IntoResponse as _, routing::get};
    use reqwest::Url;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use super::{EmailLookupError, KratosIdentityProvider};

    const EMAIL: &str = "user@example.com";

    /// Binds a fake Kratos admin API on an ephemeral port and returns its base URL.
    ///
    /// The fake only serves the identities when the request carries the expected email as
    /// credentials identifier, so any test that reaches an identity also verifies the lookup
    /// query.
    async fn spawn_fake_kratos(identities: JsonValue) -> Url {
        let router = Router::new().route(
            "/admin/identities",
            get(
                move |Query(params): Query<HashMap<String, String>>| async move {
                    let matches_email = params
                        .get("credentials_identifier")
                        .is_some_and(|identifier| identifier.eq_ignore_ascii_case(EMAIL));
                    if matches_email {
                        Json(identities).into_response()
                    } else {
                        Json(json!([])).into_response()
                    }
                },
            ),
        );

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

    async fn provider_for(identities: JsonValue) -> KratosIdentityProvider {
        KratosIdentityProvider::new(spawn_fake_kratos(identities).await)
    }

    /// Builds the wire format of a Kratos admin identity.
    fn identity_json(identity_id: Uuid, actor_id: Option<Uuid>) -> JsonValue {
        let mut identity = json!({ "id": identity_id });
        if let Some(actor_id) = actor_id {
            identity["metadata_public"] = json!({ "graph_actor_id": actor_id });
        }
        identity
    }

    #[tokio::test]
    async fn provisioned_identity_resolves() {
        let identity_id = Uuid::new_v4();
        let actor_id = Uuid::new_v4();
        let provider = provider_for(json!([identity_json(identity_id, Some(actor_id))])).await;

        let resolved = provider
            .find_user_by_email(EMAIL)
            .await
            .expect("a provisioned identity should resolve")
            .expect("the email should belong to an identity");
        assert_eq!(
            Uuid::from(resolved.user_id),
            actor_id,
            "the resolved user should be the provisioned actor"
        );
        assert_eq!(
            resolved.kratos_identity_id,
            identity_id.to_string(),
            "the resolved identity should be the one holding the email"
        );
    }

    #[tokio::test]
    async fn unknown_email_resolves_to_none() {
        let provider = provider_for(json!([])).await;

        let resolved = provider
            .find_user_by_email(EMAIL)
            .await
            .expect("an unknown email should not fail the lookup");
        assert!(
            resolved.is_none(),
            "an unknown email should resolve to none"
        );
    }

    #[tokio::test]
    async fn unprovisioned_identity_fails() {
        let provider = provider_for(json!([identity_json(Uuid::new_v4(), None)])).await;

        let report = provider
            .find_user_by_email(EMAIL)
            .await
            .expect_err("an identity without a Graph actor should fail the lookup");
        assert!(
            matches!(
                report.current_context(),
                EmailLookupError::NotProvisioned { .. }
            ),
            "the lookup should report the identity as not provisioned, got {:?}",
            report.current_context()
        );
    }

    #[tokio::test]
    async fn multiple_identities_fail() {
        let provider = provider_for(json!([
            identity_json(Uuid::new_v4(), Some(Uuid::new_v4())),
            identity_json(Uuid::new_v4(), Some(Uuid::new_v4())),
        ]))
        .await;

        let report = provider
            .find_user_by_email(EMAIL)
            .await
            .expect_err("an email held by several identities should fail the lookup");
        assert!(
            matches!(
                report.current_context(),
                EmailLookupError::AmbiguousEmail { count: 2 }
            ),
            "the lookup should report the email as ambiguous, got {:?}",
            report.current_context()
        );
    }
}
