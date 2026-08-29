//! Kratos identity lookup against the admin API.

use core::time::Duration;

use error_stack::Report;
use hash_middleware::authentication::request::AuthenticationError;
use reqwest::Url;
use type_system::principal::actor::{ActorEntityUuid, UserId};

use super::{KratosAdminClient, KratosAdminError};
use crate::{
    actor::{ResolveActor, resolve_user_actor},
    cloudflare::ResolveEmailActor,
};

/// Configuration for [`KratosEmailActorResolver`].
#[derive(Debug, Clone)]
pub struct KratosAdminConfig {
    /// Base URL of the Kratos admin API.
    pub kratos_admin_url: Url,
    /// HTTP client timeout for identity lookups.
    pub http_timeout: Duration,
}

/// Resolves verified email addresses to Graph actors via the Kratos admin API.
///
/// Identities are looked up by credentials identifier. Only an identity whose matching address
/// is verified resolves. The actor is read from the `graph_actor_id` field in the identity's
/// `metadata_public` and checked to be an existing user actor in the principal store.
pub struct KratosEmailActorResolver<R> {
    admin_client: KratosAdminClient,
    actor_resolver: R,
}

impl<R> KratosEmailActorResolver<R> {
    /// Creates a new email resolver from the given configuration.
    ///
    /// # Panics
    ///
    /// Panics if the HTTP client cannot be built or the Kratos admin URL cannot be extended with
    /// the identities path.
    #[must_use]
    pub fn new(config: KratosAdminConfig, actor_resolver: R) -> Self {
        Self {
            admin_client: KratosAdminClient::new(config.kratos_admin_url, config.http_timeout),
            actor_resolver,
        }
    }
}

/// Restates an admin API failure as a failure to authenticate.
fn authentication_error(report: Report<KratosAdminError>) -> Report<AuthenticationError> {
    let context = match report.current_context() {
        KratosAdminError::Rejected => AuthenticationError::ProviderRejection,
        KratosAdminError::InvalidResponse => AuthenticationError::InvalidProviderResponse,
        // An empty claim names no address to resolve, which is the token's fault rather than the
        // provider's.
        KratosAdminError::EmptyIdentifier => AuthenticationError::InvalidAccessToken,
        KratosAdminError::Unreachable => AuthenticationError::ProviderUnreachable,
    };
    report.change_context(context)
}

/// Looks up the identity owning the given email as a verified address.
async fn verified_identity(
    admin_client: &KratosAdminClient,
    email: &str,
) -> Result<ActorEntityUuid, Report<AuthenticationError>> {
    let identities = admin_client
        .list_by_credential(email)
        .await
        .map_err(authentication_error)?;

    // A credentials-identifier lookup also returns identities whose matching address is still
    // unverified, so requiring `verified` here is what keeps an unverified address from
    // authenticating as its owner.
    let mut matching = identities.into_iter().filter(|identity| {
        identity
            .verifiable_addresses
            .iter()
            .any(|address| address.verified && address.value.eq_ignore_ascii_case(email))
    });
    let Some(identity) = matching.next() else {
        return Err(Report::new(AuthenticationError::IdentityWithoutActor));
    };
    // The address is the identity's credentials identifier, which the provider keeps unique —
    // several identities holding it as verified violate that invariant, and picking one would
    // authenticate an arbitrary account.
    if matching.next().is_some() {
        return Err(Report::new(AuthenticationError::InvalidProviderResponse));
    }

    let Some(actor_uuid) = identity
        .metadata_public
        .and_then(|metadata| metadata.graph_actor_id)
    else {
        return Err(Report::new(AuthenticationError::NotProvisioned {
            identity_id: identity.id,
        }));
    };

    Ok(ActorEntityUuid::new(actor_uuid))
}

impl<R> ResolveEmailActor for KratosEmailActorResolver<R>
where
    R: ResolveActor,
{
    #[tracing::instrument(
        level = "debug",
        skip_all,
        fields(identities_url = %self.admin_client.identities_url())
    )]
    async fn resolve_email_actor(
        &self,
        email: &str,
    ) -> Result<UserId, Report<AuthenticationError>> {
        let actor_uuid = verified_identity(&self.admin_client, email).await?;
        resolve_user_actor(&self.actor_resolver, actor_uuid).await
    }
}

#[cfg(test)]
mod tests {
    use core::time::Duration;
    use std::collections::HashMap;

    use axum::{Json, Router, extract::Query, response::IntoResponse as _, routing::get};
    use hash_middleware::authentication::request::AuthenticationError;
    use http::StatusCode;
    use reqwest::Url;
    use rstest::rstest;
    use serde_json::{Value as JsonValue, json};
    use type_system::principal::actor::{ActorEntityUuid, ActorId, MachineId};
    use uuid::Uuid;

    use super::{KratosAdminConfig, KratosEmailActorResolver};
    use crate::{
        actor::tests::{FixedActorResolver, known_user, random_actor},
        cloudflare::ResolveEmailActor as _,
        kratos::tests::spawn_fake_kratos,
    };

    const EMAIL: &str = "user@example.com";

    /// Builds the wire format of a Kratos admin identity.
    fn identity_json(actor_id: Option<ActorEntityUuid>, addresses: JsonValue) -> JsonValue {
        let mut identity = json!({ "id": Uuid::new_v4() });
        identity["verifiable_addresses"] = addresses;
        if let Some(actor_id) = actor_id {
            identity["metadata_public"] = json!({ "graph_actor_id": actor_id });
        }
        identity
    }

    fn verified_address(email: &str) -> JsonValue {
        json!({ "value": email, "verified": true })
    }

    fn unverified_address(email: &str) -> JsonValue {
        json!({ "value": email, "verified": false })
    }

    fn resolver_at(
        url: Url,
        actors: HashMap<ActorEntityUuid, ActorId>,
    ) -> KratosEmailActorResolver<FixedActorResolver> {
        KratosEmailActorResolver::new(
            KratosAdminConfig {
                kratos_admin_url: url,
                http_timeout: Duration::from_secs(5),
            },
            FixedActorResolver::new(actors),
        )
    }

    /// Spawns a fake Kratos admin serving the given identities and returns a resolver pointed at
    /// it.
    ///
    /// The fake only serves the identities when the request carries the expected email as
    /// credentials identifier, so any test that reaches an identity also verifies the lookup
    /// query.
    async fn resolver_for(
        identities: JsonValue,
        actors: HashMap<ActorEntityUuid, ActorId>,
    ) -> KratosEmailActorResolver<FixedActorResolver> {
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

        resolver_at(spawn_fake_kratos(router).await, actors)
    }

    #[tokio::test]
    async fn verified_email_resolves_provisioned_actor() {
        let actor_id = random_actor();
        let resolver = resolver_for(
            json!([identity_json(
                Some(actor_id),
                json!([verified_address(EMAIL)])
            )]),
            known_user(actor_id),
        )
        .await;

        let user_id = resolver
            .resolve_email_actor(EMAIL)
            .await
            .expect("a verified email should resolve to the provisioned actor");
        assert_eq!(
            ActorEntityUuid::new(user_id),
            actor_id,
            "the resolved actor should be the provisioned user"
        );
    }

    /// Each case covers a distinct way the lookup can still find the right identity.
    #[rstest]
    #[case::email_differing_in_case("USER@Example.com")]
    #[case::exact_email(EMAIL)]
    #[tokio::test]
    async fn verified_email_resolves_regardless_of_case(#[case] lookup: &str) {
        let actor_id = random_actor();
        let resolver = resolver_for(
            json!([identity_json(
                Some(actor_id),
                json!([verified_address(EMAIL)])
            )]),
            known_user(actor_id),
        )
        .await;

        resolver
            .resolve_email_actor(lookup)
            .await
            .expect("the email should resolve");
    }

    /// The address is the provider's unique credentials identifier, so two identities holding it
    /// as verified violate that invariant — authenticating as either would bind the caller to an
    /// arbitrary account.
    #[tokio::test]
    async fn ambiguous_verified_address_fails_authentication() {
        let first_actor = random_actor();
        let second_actor = random_actor();
        let mut actors = known_user(first_actor);
        actors.extend(known_user(second_actor));
        let resolver = resolver_for(
            json!([
                identity_json(Some(first_actor), json!([verified_address(EMAIL)])),
                identity_json(Some(second_actor), json!([verified_address(EMAIL)])),
            ]),
            actors,
        )
        .await;

        let report = resolver
            .resolve_email_actor(EMAIL)
            .await
            .expect_err("an ambiguous verified address should fail rather than pick an account");
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidProviderResponse
            ),
            "the ambiguity should fail as an invalid provider state, got {:?}",
            report.current_context()
        );
    }

    /// Authentication never reads the traits, so a malformed traits object on a listed identity
    /// must not fail the login.
    #[tokio::test]
    async fn malformed_traits_do_not_fail_authentication() {
        let actor_id = random_actor();
        let mut identity = identity_json(Some(actor_id), json!([verified_address(EMAIL)]));
        identity["traits"] = json!({ "not-the-schema": true });
        let resolver = resolver_for(json!([identity]), known_user(actor_id)).await;

        resolver
            .resolve_email_actor(EMAIL)
            .await
            .expect("a malformed traits object should not fail authentication");
    }

    #[tokio::test]
    async fn verified_identity_resolves_over_unverified_match() {
        let actor_id = random_actor();
        let resolver = resolver_for(
            json!([
                identity_json(None, json!([unverified_address(EMAIL)])),
                identity_json(Some(actor_id), json!([verified_address(EMAIL)])),
            ]),
            known_user(actor_id),
        )
        .await;

        resolver
            .resolve_email_actor(EMAIL)
            .await
            .expect("the identity with the verified address should resolve");
    }

    /// A fixed actor, so a case can point the identity and the resolver at the same one.
    ///
    /// A real version 4 UUID, because the wire types reject UUIDs without an RFC 4122 version.
    fn case_actor() -> ActorEntityUuid {
        ActorEntityUuid::new(
            Uuid::parse_str("d290f1ee-6c54-4b01-90e6-d701748f0851")
                .expect("the case UUID should parse"),
        )
    }

    /// Each case covers a distinct rejecting branch of email resolution.
    #[rstest]
    #[case::unverified_address(
        json!([identity_json(Some(case_actor()), json!([unverified_address(EMAIL)]))]),
        known_user(case_actor()),
        |error: &AuthenticationError| matches!(error, AuthenticationError::IdentityWithoutActor)
    )]
    #[case::no_identity_for_email(
        json!([]),
        HashMap::new(),
        |error: &AuthenticationError| matches!(error, AuthenticationError::IdentityWithoutActor)
    )]
    #[case::identity_without_the_looked_up_address(
        json!([identity_json(
            Some(case_actor()),
            json!([verified_address("other@example.com")]),
        )]),
        known_user(case_actor()),
        |error: &AuthenticationError| matches!(error, AuthenticationError::IdentityWithoutActor)
    )]
    #[case::unprovisioned_identity(
        json!([identity_json(None, json!([verified_address(EMAIL)]))]),
        HashMap::new(),
        |error: &AuthenticationError| matches!(error, AuthenticationError::NotProvisioned { .. })
    )]
    #[case::unknown_actor(
        json!([identity_json(Some(case_actor()), json!([verified_address(EMAIL)]))]),
        HashMap::new(),
        |error: &AuthenticationError| matches!(error, AuthenticationError::ActorNotFound { .. })
    )]
    #[case::machine_actor(
        json!([identity_json(Some(case_actor()), json!([verified_address(EMAIL)]))]),
        HashMap::from([(case_actor(), ActorId::Machine(MachineId::new(case_actor())))]),
        |error: &AuthenticationError| matches!(error, AuthenticationError::NotAUser { .. })
    )]
    #[tokio::test]
    async fn unresolvable_email_fails_resolution(
        #[case] identities: JsonValue,
        #[case] actors: HashMap<ActorEntityUuid, ActorId>,
        #[case] expected: fn(&AuthenticationError) -> bool,
    ) {
        let resolver = resolver_for(identities, actors).await;

        let report = resolver
            .resolve_email_actor(EMAIL)
            .await
            .expect_err("the email should fail resolution");
        assert!(
            expected(report.current_context()),
            "the email should fail resolution, got {:?}",
            report.current_context()
        );
    }

    /// Kratos reads an empty `credentials_identifier` as no filter and answers with every
    /// identity, so an empty claim must not reach the lookup.
    #[tokio::test]
    async fn empty_email_is_rejected_before_the_lookup() {
        let resolver = resolver_for(
            json!([identity_json(
                Some(case_actor()),
                json!([verified_address("")])
            )]),
            known_user(case_actor()),
        )
        .await;

        let report = resolver
            .resolve_email_actor("")
            .await
            .expect_err("an empty email should be rejected");
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidAccessToken
            ),
            "an empty email should fail as an invalid token, got {:?}",
            report.current_context()
        );
    }

    #[tokio::test]
    async fn undeserializable_identity_response_fails_resolution() {
        let router = Router::new().route(
            "/admin/identities",
            get(|| async { (StatusCode::OK, r#"{"identity-like": "body"}"#) }),
        );
        let resolver = resolver_at(spawn_fake_kratos(router).await, HashMap::new());

        let report = resolver
            .resolve_email_actor(EMAIL)
            .await
            .expect_err("an undeserializable identity response should fail resolution");
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidProviderResponse
            ),
            "an undeserializable identity response should fail as an invalid provider response"
        );
        assert!(
            !format!("{report:?}").contains("identity-like"),
            "the report should not carry the identity response body"
        );
    }
}
