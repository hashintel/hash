//! Service delegation implementation of [`AuthenticationProvider`].

use core::ops::ControlFlow;

use error_stack::Report;
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use http::{HeaderMap, header};
use subtle::ConstantTimeEq as _;

use crate::{
    provider::AuthenticationProvider,
    request::{ACTOR_ID_HEADER, AuthenticationError, actor_id_from_header},
};

/// The `Authorization` scheme carrying the service secret.
pub const SERVICE_AUTH_SCHEME: &str = "HASH-Service";

/// Returns the service secret carried in the `Authorization` header.
///
/// Returns [`None`] when the header is absent, does not decode, or names a different scheme, so
/// credentials of other schemes pass through unrecognized. The scheme is matched
/// case-insensitively.
#[must_use]
pub fn service_credential(headers: &HeaderMap) -> Option<&str> {
    let credentials = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = credentials.split_once(' ').unwrap_or((credentials, ""));
    scheme
        .eq_ignore_ascii_case(SERVICE_AUTH_SCHEME)
        .then(|| token.trim_ascii())
}

/// Returns whether the request carries the expected service secret.
///
/// Compares the value in constant time, the length is not hidden. An empty secret never
/// matches, since an empty credential is legal HTTP.
#[must_use]
pub fn presents_service_secret(headers: &HeaderMap, secret: &str) -> bool {
    !secret.is_empty()
        && service_credential(headers)
            .is_some_and(|token| token.as_bytes().ct_eq(secret.as_bytes()).into())
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
    ) -> impl Future<Output = ControlFlow<Result<AuthenticatedActor, Report<AuthenticationError>>>> + Send
    {
        let decision = if headers.get(ACTOR_ID_HEADER).is_none() {
            // A secret without a named actor requests no delegation.
            ControlFlow::Continue(())
        } else if service_credential(headers).is_none() {
            ControlFlow::Break(Err(Report::new(AuthenticationError::MissingServiceSecret)))
        } else if !presents_service_secret(headers, &self.secret) {
            ControlFlow::Break(Err(Report::new(AuthenticationError::InvalidServiceSecret)))
        } else {
            ControlFlow::Break(
                actor_id_from_header(headers)
                    .map(AuthenticatedActor::Uuid)
                    .map_err(Report::new),
            )
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

    use super::{SERVICE_AUTH_SCHEME, ServiceDelegationProvider};
    use crate::{
        provider::{AuthenticationProvider as _, tests::expect_rejection},
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

    #[tokio::test]
    async fn secret_and_actor_header_delegate_to_named_actor() {
        let actor_id = random_actor();

        let decision = provider()
            .authenticate(&headers(Some(SERVICE_SECRET), Some(actor_id)))
            .await;

        assert!(
            matches!(
                decision,
                ControlFlow::Break(Ok(AuthenticatedActor::Uuid(resolved)))
                    if resolved == actor_id
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

        let report = expect_rejection(provider().authenticate(&request_headers).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::MissingServiceSecret
            ),
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

        let decision = provider().authenticate(&request_headers).await;
        assert!(
            matches!(
                decision,
                ControlFlow::Break(Ok(AuthenticatedActor::Uuid(resolved)))
                    if resolved == actor_id
            ),
            "the authorization scheme should match case-insensitively"
        );
    }

    #[tokio::test]
    async fn empty_secret_never_authenticates() {
        let provider = ServiceDelegationProvider::new(String::new());

        let decision = provider
            .authenticate(&headers(Some(""), Some(random_actor())))
            .await;

        assert!(
            matches!(decision, ControlFlow::Break(Err(_))),
            "an empty configured secret should never match, even an empty header value"
        );
    }

    #[tokio::test]
    async fn wrong_secret_fails_authentication() {
        let report = expect_rejection(
            provider()
                .authenticate(&headers(Some("hash-svc-wrong"), Some(random_actor())))
                .await,
        );
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidServiceSecret
            ),
            "a wrong service secret should be rejected"
        );
    }

    #[tokio::test]
    async fn actor_header_without_secret_fails_authentication() {
        let report = expect_rejection(
            provider()
                .authenticate(&headers(None, Some(random_actor())))
                .await,
        );
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::MissingServiceSecret
            ),
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

        let report = expect_rejection(provider().authenticate(&request_headers).await);
        assert!(
            matches!(
                report.current_context(),
                AuthenticationError::InvalidActorIdHeader
            ),
            "a malformed actor-ID header should be rejected as invalid"
        );
    }
}
