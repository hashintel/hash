//! Service delegation implementation of [`AuthenticationProvider`].

use alloc::sync::Arc;
use core::ops::ControlFlow;

use error_stack::Report;
use hash_middleware::authentication::{
    provider::{AuthenticationProvider, Caller},
    request::{AuthenticationError, actor_id_from_header},
    service_secret::{presents_service_secret, service_credential},
};
use http::HeaderMap;
use type_system::principal::actor::ActorId;
use uuid::Uuid;

use crate::actor::{ResolveActor, resolve_actor};

/// Authenticates internal services acting on behalf of an actor.
///
/// Recognizes the service secret as its credential: the secret authenticates the calling service,
/// and the actor-ID header names the actor the service acts for, resolved against the principal
/// store to its typed [`ActorId`]. Within the flow the actor header is mandatory — a chain serving
/// anonymous callers reads the nil UUID as acting for nobody, a chain requiring an actor rejects
/// it.
pub struct ServiceDelegationProvider<R> {
    secret: String,
    actor_resolver: R,
}

impl<R> ServiceDelegationProvider<R> {
    #[must_use]
    pub const fn new(secret: String, actor_resolver: R) -> Self {
        Self {
            secret,
            actor_resolver,
        }
    }
}

impl<R> ServiceDelegationProvider<R>
where
    R: ResolveActor,
{
    /// Runs the delegation flow up to the actor the service acts for.
    ///
    /// `Ok(None)` means the actor header carried the nil UUID, its encoding for acting for
    /// nobody. `Continue` means the request carries no service credential.
    async fn delegated_actor(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<Option<ActorId>, Report<AuthenticationError>>> {
        if service_credential(headers).is_none() {
            return ControlFlow::Continue(());
        }
        if !presents_service_secret(headers, &self.secret) {
            return ControlFlow::Break(Err(Report::new(
                AuthenticationError::invalid_service_secret(),
            )));
        }

        let actor_uuid = match actor_id_from_header(headers) {
            Ok(actor_uuid) => actor_uuid,
            Err(error) => return ControlFlow::Break(Err(Report::new(error))),
        };

        if Uuid::from(actor_uuid).is_nil() {
            return ControlFlow::Break(Ok(None));
        }

        ControlFlow::Break(
            resolve_actor(&self.actor_resolver, actor_uuid)
                .await
                .map(Some),
        )
    }
}

impl<C, R> AuthenticationProvider<C> for ServiceDelegationProvider<R>
where
    C: Caller,
    R: ResolveActor,
{
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
        match self.delegated_actor(headers).await {
            ControlFlow::Continue(()) => ControlFlow::Continue(()),
            ControlFlow::Break(Ok(Some(actor_id))) => {
                ControlFlow::Break(Ok(C::from_actor(actor_id)))
            }
            // The nil UUID names no actor, so the request resolves as an anonymous one does. A
            // chain requiring an actor is missing the delegated actor, not the credential.
            ControlFlow::Break(Ok(None)) => ControlFlow::Break(C::anonymous().map_err(|_error| {
                Arc::new(Report::new(AuthenticationError::missing_delegated_actor()))
            })),
            ControlFlow::Break(Err(report)) => ControlFlow::Break(Err(Arc::new(report))),
        }
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::{assert_matches, ops::ControlFlow};
    use std::collections::HashMap;

    use error_stack::Report;
    use hash_middleware::authentication::{
        provider::{AuthenticationProvider as _, Caller, expect_rejection},
        request::{ACTOR_ID_HEADER, AuthenticationError, AuthenticationErrorKind},
        service_secret::SERVICE_AUTH_SCHEME,
    };
    use http::HeaderMap;
    use type_system::principal::actor::{ActorEntityUuid, ActorId};
    use uuid::Uuid;

    use super::ServiceDelegationProvider;
    use crate::actor::tests::{FixedActorResolver, known_user, random_actor};

    const SERVICE_SECRET: &str = "hash-svc-test-secret";

    fn provider_for(
        actors: HashMap<ActorEntityUuid, ActorId>,
    ) -> ServiceDelegationProvider<FixedActorResolver> {
        ServiceDelegationProvider::new(SERVICE_SECRET.to_owned(), FixedActorResolver::new(actors))
    }

    /// A provider whose store knows no actor.
    fn provider() -> ServiceDelegationProvider<FixedActorResolver> {
        provider_for(HashMap::new())
    }

    fn headers(secret: Option<&str>, actor_id: Option<ActorEntityUuid>) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Some(secret) = secret {
            headers.insert(
                http::header::AUTHORIZATION,
                format!("{SERVICE_AUTH_SCHEME} {secret}")
                    .parse()
                    .expect("the credential should be a valid header value"),
            );
        }
        if let Some(actor_id) = actor_id {
            headers.insert(
                ACTOR_ID_HEADER,
                actor_id
                    .to_string()
                    .parse()
                    .expect("a UUID should be a valid header value"),
            );
        }
        headers
    }

    /// Pins the caller type `C` the provider authenticates as.
    async fn authenticate<C: Caller>(
        provider: &ServiceDelegationProvider<FixedActorResolver>,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
        provider.authenticate(headers).await
    }

    #[tokio::test]
    async fn secret_and_actor_header_delegate_to_named_actor() {
        let actor_id = random_actor();

        let decision = authenticate::<ActorId>(
            &provider_for(known_user(actor_id)),
            &headers(Some(SERVICE_SECRET), Some(actor_id)),
        )
        .await;

        assert!(
            matches!(
                decision,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                    if ActorEntityUuid::new(user_id) == actor_id
            ),
            "the service secret with an actor-ID header should delegate to the named actor"
        );
    }

    #[tokio::test]
    async fn bearer_credential_is_not_read_as_the_service_secret() {
        // The token equals the configured secret, so only the scheme separates the two.
        let mut request_headers = headers(None, Some(random_actor()));
        request_headers.insert(
            http::header::AUTHORIZATION,
            format!("Bearer {SERVICE_SECRET}")
                .parse()
                .expect("the credential should be a valid header value"),
        );

        let decision = authenticate::<ActorId>(&provider(), &request_headers).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "a credential of another scheme should not be read as the service secret"
        );
    }

    #[tokio::test]
    async fn service_scheme_matches_case_insensitively() {
        let actor_id = random_actor();
        let mut request_headers = headers(None, Some(actor_id));
        request_headers.insert(
            http::header::AUTHORIZATION,
            format!("hash-service {SERVICE_SECRET}")
                .parse()
                .expect("the credential should be a valid header value"),
        );

        let decision =
            authenticate::<ActorId>(&provider_for(known_user(actor_id)), &request_headers).await;
        assert!(
            matches!(
                decision,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                    if ActorEntityUuid::new(user_id) == actor_id
            ),
            "the authorization scheme should match case-insensitively"
        );
    }

    #[tokio::test]
    async fn delegation_to_an_unknown_actor_fails_authentication() {
        let report = expect_rejection(
            authenticate::<ActorId>(
                &provider(),
                &headers(Some(SERVICE_SECRET), Some(random_actor())),
            )
            .await,
        );
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::ActorNotFound { .. },
            "a delegated actor that does not exist should be rejected"
        );
    }

    #[tokio::test]
    async fn empty_secret_never_authenticates() {
        let provider =
            ServiceDelegationProvider::new(String::new(), FixedActorResolver::new(HashMap::new()));

        let decision =
            authenticate::<ActorId>(&provider, &headers(Some(""), Some(random_actor()))).await;

        assert!(
            matches!(decision, ControlFlow::Break(Err(_))),
            "an empty configured secret should never match, even an empty header value"
        );
    }

    #[tokio::test]
    async fn wrong_secret_fails_authentication() {
        let report = expect_rejection(
            authenticate::<ActorId>(
                &provider(),
                &headers(Some("hash-svc-wrong"), Some(random_actor())),
            )
            .await,
        );
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidServiceSecret,
            "a wrong service secret should be rejected"
        );
    }

    #[tokio::test]
    async fn actor_header_without_secret_carries_no_credential() {
        let decision =
            authenticate::<ActorId>(&provider(), &headers(None, Some(random_actor()))).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "an actor-ID header without the service secret should not be recognized"
        );
    }

    #[tokio::test]
    async fn secret_without_actor_header_fails_authentication() {
        let report = expect_rejection(
            authenticate::<ActorId>(&provider(), &headers(Some(SERVICE_SECRET), None)).await,
        );
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::MissingDelegatedActor,
            "the service secret should require the actor-ID header"
        );
    }

    #[tokio::test]
    async fn delegation_to_an_unknown_actor_fails_where_anonymity_is_allowed() {
        let report = expect_rejection(
            authenticate::<Option<ActorId>>(
                &provider(),
                &headers(Some(SERVICE_SECRET), Some(random_actor())),
            )
            .await,
        );
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::ActorNotFound { .. },
            "an unknown delegated actor should never degrade to the public actor"
        );
    }

    #[tokio::test]
    async fn nil_actor_header_resolves_to_no_actor() {
        // The resolver knows no actor, so resolving the nil UUID would fail — reaching `None`
        // proves it is read as "acting for nobody" instead.
        let decision = authenticate::<Option<ActorId>>(
            &provider(),
            &headers(
                Some(SERVICE_SECRET),
                Some(ActorEntityUuid::new(Uuid::nil())),
            ),
        )
        .await;

        assert!(
            matches!(decision, ControlFlow::Break(Ok(None))),
            "the nil actor header should resolve to no actor, got {decision:?}"
        );
    }

    #[tokio::test]
    async fn nil_actor_header_fails_where_an_actor_is_required() {
        let report = expect_rejection(
            authenticate::<ActorId>(
                &provider(),
                &headers(
                    Some(SERVICE_SECRET),
                    Some(ActorEntityUuid::new(Uuid::nil())),
                ),
            )
            .await,
        );
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::MissingDelegatedActor,
            "the nil actor header should be rejected where an actor is required"
        );
    }

    #[tokio::test]
    async fn requests_without_credentials_carry_no_credential() {
        let decision = authenticate::<ActorId>(&provider(), &HeaderMap::new()).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "a request without either header should not be recognized"
        );
    }

    #[tokio::test]
    async fn malformed_actor_header_fails_authentication() {
        let mut request_headers = headers(Some(SERVICE_SECRET), None);
        request_headers.insert(
            ACTOR_ID_HEADER,
            "not-a-uuid".parse().expect("the header value should parse"),
        );

        let report = expect_rejection(authenticate::<ActorId>(&provider(), &request_headers).await);
        assert_matches!(
            report.current_context().kind(),
            AuthenticationErrorKind::InvalidActorIdHeader,
            "a malformed actor-ID header should be rejected as invalid"
        );
    }
}
