//! Service delegation implementation of [`AuthenticationProvider`].

use core::ops::ControlFlow;

use error_stack::Report;
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use http::HeaderMap;
use subtle::ConstantTimeEq as _;

use crate::{
    provider::{Authentication, AuthenticationProvider},
    request::{ACTOR_ID_HEADER, AuthenticationError, actor_id_from_header},
};

/// Name of the header carrying the service secret.
pub const SERVICE_SECRET_HEADER: &str = "X-HASH-Service-Secret";

/// Returns whether the request carries the expected service secret.
///
/// Compares the value in constant time, the length is not hidden. An empty secret never
/// matches, since empty header values are legal HTTP.
#[must_use]
pub fn presents_service_secret(headers: &HeaderMap, secret: &str) -> bool {
    !secret.is_empty()
        && headers
            .get(SERVICE_SECRET_HEADER)
            .is_some_and(|value| value.as_bytes().ct_eq(secret.as_bytes()).into())
}

/// Authenticates internal services acting on behalf of an actor.
///
/// Recognizes the pair of the service secret and the actor-ID header as one credential: the
/// secret authenticates the calling service, and the named actor is taken as claimed without
/// validation against the principal store. An actor-ID header without the secret is rejected,
/// never ignored.
pub struct ServiceDelegationProvider {
    secret: String,
}

impl ServiceDelegationProvider {
    #[must_use]
    pub const fn new(secret: String) -> Self {
        Self { secret }
    }
}

impl AuthenticationProvider for ServiceDelegationProvider {
    fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Authentication>> + Send {
        let decision = if headers.get(ACTOR_ID_HEADER).is_none() {
            // A secret without a named actor requests no delegation.
            ControlFlow::Continue(())
        } else if headers.get(SERVICE_SECRET_HEADER).is_none() {
            ControlFlow::Break(Authentication::Rejected(Report::new(
                AuthenticationError::MissingServiceSecret,
            )))
        } else if !presents_service_secret(headers, &self.secret) {
            ControlFlow::Break(Authentication::Rejected(Report::new(
                AuthenticationError::InvalidServiceSecret,
            )))
        } else {
            ControlFlow::Break(match actor_id_from_header(headers) {
                Ok(actor_id) => Authentication::Verified(AuthenticatedActor::Uuid(actor_id)),
                Err(error) => Authentication::Rejected(Report::new(error)),
            })
        };

        core::future::ready(decision)
    }
}

#[cfg(test)]
mod tests {
    use core::ops::ControlFlow;

    use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
    use http::HeaderMap;
    use type_system::principal::actor::ActorEntityUuid;
    use uuid::Uuid;

    use super::{SERVICE_SECRET_HEADER, ServiceDelegationProvider};
    use crate::{
        provider::{Authentication, AuthenticationProvider as _},
        request::{ACTOR_ID_HEADER, AuthenticationError},
    };

    const SERVICE_SECRET: &str = "hash-svc-test-secret";

    fn provider() -> ServiceDelegationProvider {
        ServiceDelegationProvider::new(SERVICE_SECRET.to_owned())
    }

    fn random_actor() -> ActorEntityUuid {
        ActorEntityUuid::new(Uuid::new_v4())
    }

    fn headers(secret: Option<&str>, actor_id: Option<ActorEntityUuid>) -> HeaderMap {
        let mut headers = HeaderMap::new();
        if let Some(secret) = secret {
            headers.insert(
                SERVICE_SECRET_HEADER,
                secret
                    .parse()
                    .expect("the secret should be a valid header value"),
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

    #[track_caller]
    fn expect_rejection(decision: ControlFlow<Authentication>) -> AuthenticationError {
        match decision {
            ControlFlow::Break(Authentication::Rejected(report)) => {
                report.current_context().clone()
            }
            ControlFlow::Break(Authentication::Verified(_)) | ControlFlow::Continue(()) => {
                panic!("the credential should be rejected, got {decision:?}")
            }
        }
    }

    #[tokio::test]
    async fn secret_and_actor_header_delegate_to_named_actor() {
        let actor_id = random_actor();

        let decision = provider()
            .authenticate(&headers(Some(SERVICE_SECRET), Some(actor_id)))
            .await;

        assert!(
            matches!(
                decision,
                ControlFlow::Break(Authentication::Verified(AuthenticatedActor::Uuid(resolved)))
                    if resolved == actor_id
            ),
            "the service secret with an actor-ID header should delegate to the named actor"
        );
    }

    #[tokio::test]
    async fn empty_secret_never_authenticates() {
        let provider = ServiceDelegationProvider::new(String::new());

        let decision = provider
            .authenticate(&headers(Some(""), Some(random_actor())))
            .await;

        assert!(
            matches!(decision, ControlFlow::Break(Authentication::Rejected(_))),
            "an empty configured secret should never match, even an empty header value"
        );
    }

    #[tokio::test]
    async fn wrong_secret_fails_authentication() {
        let error = expect_rejection(
            provider()
                .authenticate(&headers(Some("hash-svc-wrong"), Some(random_actor())))
                .await,
        );
        assert!(
            matches!(error, AuthenticationError::InvalidServiceSecret),
            "a wrong service secret should be rejected"
        );
    }

    #[tokio::test]
    async fn actor_header_without_secret_fails_authentication() {
        let error = expect_rejection(
            provider()
                .authenticate(&headers(None, Some(random_actor())))
                .await,
        );
        assert!(
            matches!(error, AuthenticationError::MissingServiceSecret),
            "an actor-ID header without the service secret should be rejected, never honored"
        );
    }

    #[tokio::test]
    async fn secret_without_actor_header_carries_no_credential() {
        assert!(
            matches!(
                provider()
                    .authenticate(&headers(Some(SERVICE_SECRET), None))
                    .await,
                ControlFlow::Continue(())
            ),
            "the service secret without an actor-ID header should not be recognized"
        );
    }

    #[tokio::test]
    async fn requests_without_credentials_carry_no_credential() {
        assert!(
            matches!(
                provider().authenticate(&HeaderMap::new()).await,
                ControlFlow::Continue(())
            ),
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

        let error = expect_rejection(provider().authenticate(&request_headers).await);
        assert!(
            matches!(error, AuthenticationError::InvalidActorIdHeader),
            "a malformed actor-ID header should be rejected as invalid"
        );
    }
}
