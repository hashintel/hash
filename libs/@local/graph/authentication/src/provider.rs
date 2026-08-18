//! Provider-based request authentication.

use core::ops::ControlFlow;

use error_stack::Report;
use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
use http::HeaderMap;

use crate::request::AuthenticationError;

/// Authenticates requests against a credential verifier.
///
/// A provider owns both the recognition of its credentials in the request headers and their
/// verification. `Continue(())` means the request carries no credential this provider handles
/// and the chain moves on. Breaking with `Ok` carries the actor the credential verified to, with
/// `Err` the reason it did not — either way the chain stops, so a rejected credential never falls
/// through to another provider.
pub trait AuthenticationProvider: Send + Sync {
    /// Resolves the credential of a request.
    fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<AuthenticatedActor, Report<AuthenticationError>>>> + Send;
}

/// An absent provider recognizes no credential, so the chain moves on.
impl<P> AuthenticationProvider for Option<P>
where
    P: AuthenticationProvider,
{
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<AuthenticatedActor, Report<AuthenticationError>>> {
        match self {
            Some(provider) => provider.authenticate(headers).await,
            None => ControlFlow::Continue(()),
        }
    }
}

/// Chains two providers: the second is consulted only when the first recognizes no credential.
impl<A, B> AuthenticationProvider for (A, B)
where
    A: AuthenticationProvider,
    B: AuthenticationProvider,
{
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<AuthenticatedActor, Report<AuthenticationError>>> {
        self.0.authenticate(headers).await?;
        self.1.authenticate(headers).await
    }
}

/// Authentication provider serving a fixed result.
#[cfg(any(test, feature = "test-utils"))]
pub enum StaticAuthenticationProvider {
    /// Recognizes no credentials.
    NotRecognized,
    /// Verifies every request to this actor.
    Verified(AuthenticatedActor),
    /// Rejects every request.
    Rejected,
}

#[cfg(any(test, feature = "test-utils"))]
impl AuthenticationProvider for StaticAuthenticationProvider {
    fn authenticate(
        &self,
        _headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<AuthenticatedActor, Report<AuthenticationError>>>> + Send
    {
        core::future::ready(match self {
            Self::NotRecognized => ControlFlow::Continue(()),
            Self::Verified(actor) => ControlFlow::Break(Ok(*actor)),
            Self::Rejected => {
                ControlFlow::Break(Err(Report::new(AuthenticationError::InvalidSession)))
            }
        })
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use core::ops::ControlFlow;

    use error_stack::Report;
    use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
    use http::HeaderMap;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{AuthenticationProvider as _, StaticAuthenticationProvider};
    use crate::request::AuthenticationError;

    /// Returns the report of a rejected decision, panicking on any other outcome.
    #[track_caller]
    pub(crate) fn expect_rejection(
        authentication: ControlFlow<Result<AuthenticatedActor, Report<AuthenticationError>>>,
    ) -> Report<AuthenticationError> {
        match authentication {
            ControlFlow::Break(Err(report)) => report,
            ControlFlow::Break(Ok(_)) | ControlFlow::Continue(()) => {
                panic!("the credential should be rejected, got {authentication:?}")
            }
        }
    }

    fn random_user() -> AuthenticatedActor {
        AuthenticatedActor::Id(ActorId::User(UserId::new(ActorEntityUuid::new(
            Uuid::new_v4(),
        ))))
    }

    #[tokio::test]
    async fn chain_consults_second_provider_when_first_recognizes_nothing() {
        let actor = random_user();
        let chain = (
            StaticAuthenticationProvider::NotRecognized,
            StaticAuthenticationProvider::Verified(actor),
        );

        assert!(
            matches!(
                chain.authenticate(&HeaderMap::new()).await,
                ControlFlow::Break(Ok(resolved)) if resolved == actor
            ),
            "the chain should fall through to the second provider"
        );
    }

    #[tokio::test]
    async fn chain_stops_at_first_verified_credential() {
        let actor = random_user();
        let chain = (
            StaticAuthenticationProvider::Verified(actor),
            StaticAuthenticationProvider::Rejected,
        );

        assert!(
            matches!(
                chain.authenticate(&HeaderMap::new()).await,
                ControlFlow::Break(Ok(resolved)) if resolved == actor
            ),
            "the chain should stop at the first verified credential"
        );
    }

    #[tokio::test]
    async fn chain_stops_at_first_rejected_credential() {
        let chain = (
            StaticAuthenticationProvider::Rejected,
            StaticAuthenticationProvider::Verified(random_user()),
        );

        assert!(
            matches!(
                chain.authenticate(&HeaderMap::new()).await,
                ControlFlow::Break(Err(_))
            ),
            "a rejection by the first provider should never fall through to the second"
        );
    }

    #[tokio::test]
    async fn chain_recognizes_nothing_when_no_provider_does() {
        let chain = (
            StaticAuthenticationProvider::NotRecognized,
            StaticAuthenticationProvider::NotRecognized,
        );

        assert!(
            matches!(
                chain.authenticate(&HeaderMap::new()).await,
                ControlFlow::Continue(())
            ),
            "the chain should recognize nothing when no provider does"
        );
    }
}
