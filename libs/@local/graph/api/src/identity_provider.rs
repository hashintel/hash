use core::time::Duration;

use error_stack::{Report, ResultExt as _};
use hash_graph_authentication::kratos::{
    IdentityDeletion as AdminIdentityDeletion, KratosAdminClient, KratosAdminError,
};
use hash_graph_store::identity_provider::{
    IdentityDeletion, IdentityProvider, IdentityProviderError,
};
use reqwest::Url;
use type_system::principal::actor::UserId;

/// Errors returned by [`KratosIdentityProvider::find_user_by_email`].
#[derive(Debug, derive_more::Display, derive_more::Error)]
pub(crate) enum EmailLookupError {
    #[display("failed to look up the identity by email")]
    LookupFailed,
    #[display("the email to look up is empty")]
    EmptyEmail,
    #[display("identity `{identity_id}` has no Graph actor provisioned")]
    NotProvisioned { identity_id: String },
    #[display(
        "{count} identities hold the email as a credentials identifier; delete by user ID instead"
    )]
    AmbiguousEmail { count: usize },
}

/// Restates an admin API failure as a failure of the email lookup.
fn lookup_error(report: Report<KratosAdminError>) -> Report<EmailLookupError> {
    let context = match report.current_context() {
        KratosAdminError::EmptyIdentifier => EmailLookupError::EmptyEmail,
        KratosAdminError::Unreachable
        | KratosAdminError::Rejected
        | KratosAdminError::InvalidResponse => EmailLookupError::LookupFailed,
    };
    report.change_context(context)
}

/// A Kratos identity resolved to its provisioned Graph actor.
#[derive(Debug)]
pub(crate) struct ResolvedUser {
    pub user_id: UserId,
    pub kratos_identity_id: String,
}

/// Ory Kratos implementation of [`IdentityProvider`].
pub(crate) struct KratosIdentityProvider {
    admin_client: KratosAdminClient,
}

impl KratosIdentityProvider {
    /// Creates a new identity provider for the given Kratos admin URL.
    ///
    /// # Panics
    ///
    /// Panics if the HTTP client cannot be built, or if the admin URL cannot carry a path.
    #[must_use]
    pub(crate) fn new(admin_url: Url, http_timeout: Duration) -> Self {
        Self {
            admin_client: KratosAdminClient::new(admin_url, http_timeout),
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
    /// - [`EmptyEmail`] if `email` is empty, which Kratos would read as no filter at all
    /// - [`LookupFailed`] if the Kratos request fails or the response cannot be read
    /// - [`NotProvisioned`] if the identity carries no Graph actor
    /// - [`AmbiguousEmail`] if several identities hold the email
    ///
    /// [`EmptyEmail`]: EmailLookupError::EmptyEmail
    /// [`LookupFailed`]: EmailLookupError::LookupFailed
    /// [`NotProvisioned`]: EmailLookupError::NotProvisioned
    /// [`AmbiguousEmail`]: EmailLookupError::AmbiguousEmail
    #[tracing::instrument(
        level = "debug",
        skip_all,
        fields(kratos_url = %self.admin_client.identities_url())
    )]
    pub(crate) async fn find_user_by_email(
        &self,
        email: &str,
    ) -> Result<Option<ResolvedUser>, Report<EmailLookupError>> {
        let mut identities = self
            .admin_client
            .list_by_credential(email)
            .await
            .map_err(lookup_error)?;

        let Some(identity) = identities.pop() else {
            return Ok(None);
        };
        if !identities.is_empty() {
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
    #[tracing::instrument(
        level = "debug",
        skip(self),
        fields(kratos_url = %self.admin_client.identities_url())
    )]
    async fn delete_identity(
        &self,
        identity_id: &str,
    ) -> Result<IdentityDeletion, Report<IdentityProviderError>> {
        self.admin_client
            .delete_by_id(identity_id)
            .await
            .map(|deletion| match deletion {
                AdminIdentityDeletion::Deleted => IdentityDeletion::Deleted,
                AdminIdentityDeletion::AlreadyAbsent => IdentityDeletion::AlreadyAbsent,
            })
            .change_context(IdentityProviderError::DeletionFailed)
    }

    #[tracing::instrument(
        level = "debug",
        skip(self),
        fields(kratos_url = %self.admin_client.identities_url())
    )]
    async fn get_identity_emails(
        &self,
        identity_id: &str,
    ) -> Result<Option<Vec<String>>, Report<IdentityProviderError>> {
        let Some(identity) = self
            .admin_client
            .get_by_id(identity_id)
            .await
            .change_context(IdentityProviderError::LookupFailed)?
        else {
            tracing::warn!(
                %identity_id,
                "Kratos holds no such identity, so its addresses stay unknown"
            );
            return Ok(None);
        };

        Ok(Some(identity.traits.emails))
    }
}

#[cfg(test)]
mod tests {
    use core::{net::SocketAddr, time::Duration};
    use std::collections::HashMap;

    use axum::{
        Json, Router,
        extract::{Path, Query},
        http::StatusCode,
        response::IntoResponse as _,
        routing::get,
    };
    use reqwest::Url;
    use serde_json::{Value as JsonValue, json};
    use uuid::Uuid;

    use super::{EmailLookupError, IdentityDeletion, KratosIdentityProvider};

    const EMAIL: &str = "user@example.com";
    const HTTP_TIMEOUT: Duration = Duration::from_secs(5);

    /// Picks a served identity by its ID.
    fn identity_with_id(identities: &JsonValue, identity_id: &str) -> Option<JsonValue> {
        identities
            .as_array()
            .expect("the served identities should be an array")
            .iter()
            .find(|identity| identity["id"] == identity_id)
            .cloned()
    }

    /// Builds a fake Kratos admin API serving the given identities.
    ///
    /// The list endpoint only serves the identities when the request carries the expected email as
    /// credentials identifier, so any test that reaches an identity also verifies the lookup
    /// query. The by-ID endpoints match on an identity's `id` and answer 404 for anything else.
    fn kratos_router(identities: JsonValue) -> Router {
        let listed = identities.clone();
        let fetched = identities.clone();
        Router::new()
            .route(
                "/admin/identities",
                get(
                    move |Query(params): Query<HashMap<String, String>>| async move {
                        let matches_email = params
                            .get("credentials_identifier")
                            .is_some_and(|identifier| identifier.eq_ignore_ascii_case(EMAIL));
                        if matches_email {
                            Json(listed).into_response()
                        } else {
                            // Real Kratos answers an ABSENT identifier with every identity it
                            // holds — the fake inverts that, so the empty-email guard is pinned
                            // by its own error variant, never by this fake's leniency.
                            Json(json!([])).into_response()
                        }
                    },
                ),
            )
            .route(
                "/admin/identities/{identity_id}",
                get(move |Path(identity_id): Path<String>| async move {
                    identity_with_id(&fetched, &identity_id).map_or_else(
                        || StatusCode::NOT_FOUND.into_response(),
                        |identity| Json(identity).into_response(),
                    )
                })
                .delete(move |Path(identity_id): Path<String>| async move {
                    if identity_with_id(&identities, &identity_id).is_some() {
                        StatusCode::NO_CONTENT
                    } else {
                        StatusCode::NOT_FOUND
                    }
                }),
            )
    }

    /// Binds the given router on an ephemeral port and returns its base URL.
    async fn spawn(router: Router) -> Url {
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
        KratosIdentityProvider::new(spawn(kratos_router(identities)).await, HTTP_TIMEOUT)
    }

    /// A provider whose admin URL carries a path prefix ending in a slash, which an operator may
    /// configure.
    async fn provider_for_url_with_path_prefix(identities: JsonValue) -> KratosIdentityProvider {
        let base = spawn(Router::new().nest("/kratos", kratos_router(identities))).await;
        let with_prefix = base
            .join("kratos/")
            .expect("the test server address should take a path prefix");
        assert_eq!(
            with_prefix.path(),
            "/kratos/",
            "the fixture should hand the provider a trailing slash to strip"
        );
        KratosIdentityProvider::new(with_prefix, HTTP_TIMEOUT)
    }

    /// Builds the wire format of a Kratos admin identity.
    fn identity_json(identity_id: Uuid, actor_id: Option<Uuid>) -> JsonValue {
        let mut identity = json!({ "id": identity_id });
        if let Some(actor_id) = actor_id {
            identity["metadata_public"] = json!({ "graph_actor_id": actor_id });
        }
        identity
    }

    /// Adds the traits the registration flow writes to an identity.
    fn with_emails(mut identity: JsonValue, emails: &[&str]) -> JsonValue {
        identity["traits"] = json!({ "emails": emails });
        identity
    }

    #[tokio::test]
    async fn trailing_slash_in_the_admin_url_still_resolves() {
        let actor_id = Uuid::new_v4();
        let provider = provider_for_url_with_path_prefix(json!([identity_json(
            Uuid::new_v4(),
            Some(actor_id)
        )]))
        .await;

        let resolved = provider
            .find_user_by_email(EMAIL)
            .await
            .expect("a trailing slash should not double the path separator")
            .expect("the email should belong to an identity");
        assert_eq!(
            Uuid::from(resolved.user_id),
            actor_id,
            "the resolved user should be the provisioned actor"
        );
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

    /// Kratos reads an empty `credentials_identifier` as no filter and answers with every
    /// identity, so the lookup would resolve an arbitrary user.
    #[tokio::test]
    async fn empty_email_is_rejected_before_the_lookup() {
        let provider =
            provider_for(json!([identity_json(Uuid::new_v4(), Some(Uuid::new_v4()))])).await;

        let outcome = provider.find_user_by_email("").await;
        assert!(
            matches!(
                outcome
                    .expect_err("an empty email should be rejected")
                    .current_context(),
                EmailLookupError::EmptyEmail
            ),
            "an empty email should name its rejection rather than reach Kratos"
        );
    }

    #[tokio::test]
    async fn missing_identity_leaves_the_addresses_unknown() {
        use hash_graph_store::identity_provider::IdentityProvider as _;

        let provider = provider_for(json!([])).await;

        let emails = provider
            .get_identity_emails("no-such-identity")
            .await
            .expect("a missing identity should not fail the read");
        assert!(
            emails.is_none(),
            "a missing identity should leave the addresses unknown rather than empty"
        );
    }

    #[tokio::test]
    async fn identity_yields_its_registered_addresses() {
        use hash_graph_store::identity_provider::IdentityProvider as _;

        let identity_id = Uuid::new_v4();
        let provider = provider_for(json!([with_emails(
            identity_json(identity_id, Some(Uuid::new_v4())),
            &["first@example.com", "second@example.com"]
        )]))
        .await;

        let emails = provider
            .get_identity_emails(&identity_id.to_string())
            .await
            .expect("an existing identity should not fail the read")
            .expect("an existing identity should leave its addresses known");
        assert_eq!(
            emails,
            ["first@example.com", "second@example.com"],
            "the read should yield the addresses the identity holds"
        );
    }

    /// An identity created outside the registration flow carries no traits, which is distinct from
    /// an identity Kratos no longer holds.
    #[tokio::test]
    async fn identity_without_traits_yields_no_addresses() {
        use hash_graph_store::identity_provider::IdentityProvider as _;

        let identity_id = Uuid::new_v4();
        let provider =
            provider_for(json!([identity_json(identity_id, Some(Uuid::new_v4()))])).await;

        let emails = provider
            .get_identity_emails(&identity_id.to_string())
            .await
            .expect("an identity without traits should not fail the read");
        assert_eq!(
            emails,
            Some(Vec::new()),
            "an identity without traits should hold no addresses rather than leave them unknown"
        );
    }

    #[tokio::test]
    async fn deletion_removes_the_identity() {
        use hash_graph_store::identity_provider::IdentityProvider as _;

        let identity_id = Uuid::new_v4();
        let provider =
            provider_for(json!([identity_json(identity_id, Some(Uuid::new_v4()))])).await;

        let deletion = provider
            .delete_identity(&identity_id.to_string())
            .await
            .expect("an existing identity should be deletable");
        assert_eq!(
            deletion,
            IdentityDeletion::Deleted,
            "deleting an existing identity should report it as deleted"
        );
    }

    /// Deletion runs after the identity may already have been deleted by an earlier partial run.
    #[tokio::test]
    async fn missing_identity_counts_as_deleted() {
        use hash_graph_store::identity_provider::IdentityProvider as _;

        let provider = provider_for(json!([])).await;

        let deletion = provider
            .delete_identity("no-such-identity")
            .await
            .expect("an identity that is already gone should not fail the deletion");
        assert_eq!(
            deletion,
            IdentityDeletion::AlreadyAbsent,
            "an identity that is already gone should report as already absent"
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

    /// Deletion must reach accounts that never completed verification, so — unlike
    /// authentication — the lookup accepts an unverified address.
    #[tokio::test]
    async fn unverified_address_still_resolves_for_deletion() {
        let actor_id = Uuid::new_v4();
        let mut identity = identity_json(Uuid::new_v4(), Some(actor_id));
        identity["verifiable_addresses"] = json!([{ "value": EMAIL, "verified": false }]);
        let provider = provider_for(json!([identity])).await;

        let resolved = provider
            .find_user_by_email(EMAIL)
            .await
            .expect("an unverified address should not fail the lookup")
            .expect("an unverified address should still resolve for deletion");
        assert_eq!(
            Uuid::from(resolved.user_id),
            actor_id,
            "the resolved user should be the provisioned actor"
        );
    }

    /// Each status covers a rung of the ladder that must fail the lookup rather than read as an
    /// unknown user.
    #[tokio::test]
    async fn failure_statuses_fail_the_lookup() {
        for status in [
            StatusCode::UNAUTHORIZED,
            StatusCode::INTERNAL_SERVER_ERROR,
            StatusCode::FOUND,
        ] {
            let router =
                Router::new().route("/admin/identities", get(move || async move { status }));
            let provider = KratosIdentityProvider::new(spawn(router).await, HTTP_TIMEOUT);

            let report = provider
                .find_user_by_email(EMAIL)
                .await
                .expect_err("a failure status should fail the lookup rather than read as unknown");
            assert!(
                matches!(report.current_context(), EmailLookupError::LookupFailed),
                "a {status} should fail the lookup, got {:?}",
                report.current_context()
            );
        }
    }

    #[tokio::test]
    async fn undeserializable_list_response_fails_the_lookup() {
        let router = Router::new().route(
            "/admin/identities",
            get(|| async { (StatusCode::OK, r#"{"identity-like": "body"}"#) }),
        );
        let provider = KratosIdentityProvider::new(spawn(router).await, HTTP_TIMEOUT);

        let report = provider
            .find_user_by_email(EMAIL)
            .await
            .expect_err("an undeserializable listing should fail the lookup");
        assert!(
            matches!(report.current_context(), EmailLookupError::LookupFailed),
            "an undeserializable listing should fail the lookup, got {:?}",
            report.current_context()
        );
        assert!(
            !format!("{report:?}").contains("identity-like"),
            "the report should not carry the identity response body"
        );
    }

    /// The identity schema requires the addresses, so a `traits` object without them is a broken
    /// provider contract rather than an identity without addresses.
    #[tokio::test]
    async fn traits_without_addresses_fail_the_read() {
        use hash_graph_store::identity_provider::IdentityProvider as _;

        let identity_id = Uuid::new_v4();
        let mut identity = identity_json(identity_id, None);
        identity["traits"] = json!({});
        let provider = provider_for(json!([identity])).await;

        let report = provider
            .get_identity_emails(&identity_id.to_string())
            .await
            .expect_err(
                "a traits object without addresses should fail the read rather than read as an \
                 identity without addresses",
            );
        assert!(
            matches!(
                report.current_context(),
                super::IdentityProviderError::LookupFailed
            ),
            "the broken contract should fail the read as a lookup failure"
        );
    }

    #[tokio::test]
    async fn undeserializable_identity_response_fails_the_read() {
        use hash_graph_store::identity_provider::IdentityProvider as _;

        let router = Router::new().route(
            "/admin/identities/{identity_id}",
            get(|| async { (StatusCode::OK, r#"{"identity-like": "body"}"#) }),
        );
        let provider = KratosIdentityProvider::new(spawn(router).await, HTTP_TIMEOUT);

        let report = provider
            .get_identity_emails("some-identity")
            .await
            .expect_err(
                "an undeserializable identity should fail the read rather than leave the \
                 addresses unknown",
            );
        assert!(
            matches!(
                report.current_context(),
                super::IdentityProviderError::LookupFailed
            ),
            "the undeserializable identity should fail the read as a lookup failure"
        );
        assert!(
            !format!("{report:?}").contains("identity-like"),
            "the report should not carry the identity response body"
        );
    }
}
