//! Provider-based request authentication.

use alloc::sync::Arc;
use core::ops::ControlFlow;

use error_stack::Report;
use http::HeaderMap;
use type_system::principal::actor::ActorId;

use super::request::AuthenticationErrorKind;
use crate::authentication::request::AuthenticationError;

mod sealed {
    use type_system::principal::actor::ActorId;

    pub trait Sealed {}

    impl Sealed for ActorId {}
    impl Sealed for Option<ActorId> {}
}

/// The principal a provider chain resolves a request to.
///
/// Exactly two caller types exist: [`ActorId`] for chains that require an actor, and
/// `Option<ActorId>` for chains that also serve anonymous callers. What a request without a
/// recognized credential resolves to follows from [`anonymous`].
///
/// [`anonymous`]: Self::anonymous
pub trait Caller: Send + Sized + sealed::Sealed {
    /// Returns the caller for an actor a credential verified to.
    fn from_actor(actor: ActorId) -> Self;

    /// Returns the caller for a request that names no actor.
    ///
    /// # Errors
    ///
    /// - [`MissingCredentials`] if the caller type requires an actor
    ///
    /// [`MissingCredentials`]: AuthenticationErrorKind::MissingCredentials
    fn anonymous() -> Result<Self, AuthenticationError>;

    /// Returns the actor, or [`None`] for an anonymous caller.
    fn into_actor(self) -> Option<ActorId>;
}

impl Caller for ActorId {
    fn from_actor(actor: ActorId) -> Self {
        actor
    }

    fn anonymous() -> Result<Self, AuthenticationError> {
        Err(AuthenticationError::new(
            AuthenticationErrorKind::MissingCredentials,
        ))
    }

    fn into_actor(self) -> Option<ActorId> {
        Some(self)
    }
}

impl Caller for Option<ActorId> {
    fn from_actor(actor: ActorId) -> Self {
        Some(actor)
    }

    fn anonymous() -> Result<Self, AuthenticationError> {
        Ok(None)
    }

    fn into_actor(self) -> Option<ActorId> {
        self
    }
}

/// Authenticates requests against a credential verifier.
///
/// A provider owns both the recognition of its credentials in the request headers and their
/// verification. `Continue(())` means the request carries no credential this provider handles
/// and the chain moves on. Breaking with `Ok` carries the caller the credential verified to, with
/// `Err` the reason it did not — either way the chain stops, so a rejected credential never falls
/// through to another provider.
///
/// A rejection is handed out shared: one verification may answer several concurrent requests,
/// and [`Report`] is not [`Clone`], so the [`Arc`] carries the one report to every request it
/// rejected.
pub trait AuthenticationProvider<C: Caller>: Send + Sync {
    /// Resolves the credential of a request.
    fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<C, Arc<Report<AuthenticationError>>>>> + Send;
}

/// An absent provider recognizes no credential, so the chain moves on.
impl<C, P> AuthenticationProvider<C> for Option<P>
where
    C: Caller,
    P: AuthenticationProvider<C>,
{
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
        match self {
            Some(provider) => provider.authenticate(headers).await,
            None => ControlFlow::Continue(()),
        }
    }
}

/// Chains two providers: the second is consulted only when the first recognizes no credential.
impl<C, A, B> AuthenticationProvider<C> for (A, B)
where
    C: Caller,
    A: AuthenticationProvider<C>,
    B: AuthenticationProvider<C>,
{
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
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
    Verified(ActorId),
    /// Rejects every request as carrying an invalid session.
    Rejected,
    /// Fails to verify every request.
    Unreachable,
}

#[cfg(any(test, feature = "test-utils"))]
impl<C> AuthenticationProvider<C> for StaticAuthenticationProvider
where
    C: Caller,
{
    fn authenticate(
        &self,
        _headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<C, Arc<Report<AuthenticationError>>>>> + Send {
        core::future::ready(match self {
            Self::NotRecognized => ControlFlow::Continue(()),
            Self::Verified(actor) => ControlFlow::Break(Ok(C::from_actor(*actor))),
            Self::Rejected => ControlFlow::Break(Err(Arc::new(Report::new(
                AuthenticationError::new(AuthenticationErrorKind::InvalidSession),
            )))),
            Self::Unreachable => ControlFlow::Break(Err(Arc::new(Report::new(
                AuthenticationError::new(AuthenticationErrorKind::ProviderUnreachable),
            )))),
        })
    }
}

/// Returns the report of a rejected decision, panicking on any other outcome.
///
/// # Panics
///
/// Panics when the decision verified a caller or recognized no credential.
#[cfg(any(test, feature = "test-utils"))]
#[track_caller]
pub fn expect_rejection<C: core::fmt::Debug>(
    authentication: ControlFlow<Result<C, Arc<Report<AuthenticationError>>>>,
) -> Arc<Report<AuthenticationError>> {
    match authentication {
        ControlFlow::Break(Err(report)) => report,
        ControlFlow::Break(Ok(_)) | ControlFlow::Continue(()) => {
            panic!("the credential should be rejected, got {authentication:?}")
        }
    }
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, ops::ControlFlow};

    use http::HeaderMap;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{AuthenticationProvider as _, Caller, StaticAuthenticationProvider};
    use crate::authentication::request::AuthenticationErrorKind;

    fn random_user() -> ActorId {
        ActorId::User(UserId::new(ActorEntityUuid::new(Uuid::new_v4())))
    }

    #[test]
    fn anonymous_caller_names_no_actor_where_one_is_optional() {
        assert!(
            matches!(<Option<ActorId>>::anonymous(), Ok(None)),
            "an optional caller should resolve anonymity to no actor"
        );
    }

    #[test]
    fn anonymous_caller_fails_where_an_actor_is_required() {
        assert_matches!(
            <ActorId as Caller>::anonymous(),
            Err(error) if *error.kind() == AuthenticationErrorKind::MissingCredentials,
            "a required caller should reject anonymity"
        );
    }

    #[tokio::test]
    async fn chain_consults_second_provider_when_first_recognizes_nothing() {
        let actor = random_user();
        let chain = (
            StaticAuthenticationProvider::NotRecognized,
            StaticAuthenticationProvider::Verified(actor),
        );

        let decision: ControlFlow<Result<ActorId, _>> = chain.authenticate(&HeaderMap::new()).await;
        assert_matches!(
            decision,
            ControlFlow::Break(Ok(resolved)) if resolved == actor,
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

        let decision: ControlFlow<Result<ActorId, _>> = chain.authenticate(&HeaderMap::new()).await;
        assert_matches!(
            decision,
            ControlFlow::Break(Ok(resolved)) if resolved == actor,
            "the chain should stop at the first verified credential"
        );
    }

    #[tokio::test]
    async fn chain_stops_at_first_rejected_credential() {
        let chain = (
            StaticAuthenticationProvider::Rejected,
            StaticAuthenticationProvider::Verified(random_user()),
        );

        let decision: ControlFlow<Result<ActorId, _>> = chain.authenticate(&HeaderMap::new()).await;
        assert_matches!(
            decision,
            ControlFlow::Break(Err(_)),
            "a rejection by the first provider should never fall through to the second"
        );
    }

    #[tokio::test]
    async fn chain_recognizes_nothing_when_no_provider_does() {
        let chain = (
            StaticAuthenticationProvider::NotRecognized,
            StaticAuthenticationProvider::NotRecognized,
        );

        let decision: ControlFlow<Result<ActorId, _>> = chain.authenticate(&HeaderMap::new()).await;
        assert_matches!(
            decision,
            ControlFlow::Continue(()),
            "the chain should recognize nothing when no provider does"
        );
    }
}
