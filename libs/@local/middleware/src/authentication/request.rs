//! Resolution of a request's credentials to the acting principal.

use core::{ops::ControlFlow, str::FromStr as _};

use error_stack::Report;
use http::{HeaderMap, StatusCode};
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use crate::authentication::provider::{AuthenticationProvider, Caller};

/// Name of the header carrying an unverified actor ID.
pub const ACTOR_ID_HEADER: &str = "X-Authenticated-User-Actor-Id";

/// Whose fault a rejection is.
///
/// The domain decides how loudly a rejection is reported: an exhaustive set, so a new domain
/// forces every reporting site to take a position rather than defaulting to the quietest one.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FaultDomain {
    /// The service cannot answer credential questions at all.
    Service,
    /// The credential is intact, but provisioning or deployment configuration is not.
    Operator,
    /// The caller can repair the request on its own.
    Caller,
}

/// Errors that can occur while authenticating a request.
#[derive(Debug, Clone, derive_more::Display)]
pub enum AuthenticationError {
    /// No credentials were provided with the request.
    #[display("no credentials provided")]
    MissingCredentials,
    /// A credential is present but not decodable.
    #[display("credential is malformed")]
    MalformedCredential,
    /// The actor-ID header is present but not a valid UUID.
    #[display("`X-Authenticated-User-Actor-Id` header is not a valid UUID")]
    InvalidActorIdHeader,
    /// The request requires the service secret but does not carry it.
    #[display("the request requires the service credential")]
    MissingServiceSecret,
    /// The service secret does not match.
    #[display("service credential is invalid")]
    InvalidServiceSecret,
    /// The service credential is verified but carries no delegated actor.
    #[display("the service credential carries no delegated actor")]
    MissingDelegatedActor,
    /// The credential provider could not be reached.
    #[display("failed to verify the credential against the provider")]
    ProviderUnreachable,
    /// The credential provider rejected the verification request.
    #[display("the credential provider rejected the verification request")]
    ProviderRejection,
    /// The credential provider returned a response that could not be interpreted.
    #[display("the credential provider returned an invalid response")]
    InvalidProviderResponse,
    /// The session is invalid, expired, or revoked.
    #[display("session is invalid or expired")]
    InvalidSession,
    /// The access token is invalid, expired, or not issued for this API.
    #[display("access token is invalid or expired")]
    InvalidAccessToken,
    /// The verified identity has no matching user actor.
    #[display("the authenticated identity has no matching user actor")]
    IdentityWithoutActor,
    /// The identity has no actor provisioned.
    #[display("identity `{identity_id}` has no Graph actor provisioned")]
    NotProvisioned {
        /// The provider-side identity ID lacking the actor provisioning.
        identity_id: String,
    },
    /// The provisioned actor does not exist in the principal store.
    #[display("actor `{actor_id}` does not exist")]
    ActorNotFound {
        /// The actor ID carried by the credential.
        actor_id: ActorEntityUuid,
    },
    /// The provisioned actor exists but is not a user actor.
    #[display("actor `{actor_id}` is not a user actor")]
    NotAUser {
        /// The actor ID carried by the credential.
        actor_id: ActorEntityUuid,
    },
    /// The principal store could not be queried.
    #[display("failed to validate actor against the principal store")]
    StoreError,
}

impl core::error::Error for AuthenticationError {}

impl AuthenticationError {
    /// Returns the status code reported to the client for this error.
    #[must_use]
    pub const fn status_code(&self) -> StatusCode {
        match self {
            Self::InvalidActorIdHeader | Self::MalformedCredential => StatusCode::BAD_REQUEST,
            Self::ProviderUnreachable | Self::ProviderRejection | Self::StoreError => {
                StatusCode::SERVICE_UNAVAILABLE
            }
            Self::InvalidProviderResponse => StatusCode::INTERNAL_SERVER_ERROR,
            Self::MissingCredentials
            | Self::MissingServiceSecret
            | Self::InvalidServiceSecret
            | Self::MissingDelegatedActor
            | Self::InvalidSession
            | Self::InvalidAccessToken
            | Self::IdentityWithoutActor
            | Self::NotProvisioned { .. }
            | Self::ActorNotFound { .. }
            | Self::NotAUser { .. } => StatusCode::UNAUTHORIZED,
        }
    }

    /// Whether the provider verified the credential and rejected it, as opposed to failing to
    /// verify it.
    #[must_use]
    pub const fn is_verified_rejection(&self) -> bool {
        matches!(self, Self::InvalidSession | Self::InvalidAccessToken)
    }

    /// Returns whose fault a rejection with this error is.
    #[must_use]
    pub const fn fault_domain(&self) -> FaultDomain {
        match self {
            Self::ProviderUnreachable
            | Self::ProviderRejection
            | Self::InvalidProviderResponse
            | Self::StoreError => FaultDomain::Service,
            // A verified credential pointing at a missing or non-user actor is broken
            // provisioning, and legitimate senders of the service credential are internal
            // services, so a mismatch points at deployment configuration.
            Self::IdentityWithoutActor
            | Self::NotProvisioned { .. }
            | Self::ActorNotFound { .. }
            | Self::NotAUser { .. }
            | Self::InvalidServiceSecret => FaultDomain::Operator,
            // A request arriving without the service secret says nothing about the deployment —
            // anyone can send one, so reporting it above debug hands a caller the log volume.
            Self::MissingCredentials
            | Self::MalformedCredential
            | Self::InvalidActorIdHeader
            | Self::MissingServiceSecret
            | Self::MissingDelegatedActor
            | Self::InvalidSession
            | Self::InvalidAccessToken => FaultDomain::Caller,
        }
    }

    /// Returns the message reported to the client for this error.
    ///
    /// Never carries identifiers. Those remain in the [`Display`] representation used for
    /// server-side logs.
    ///
    /// [`Display`]: core::fmt::Display
    #[must_use]
    pub const fn client_message(&self) -> &'static str {
        match self {
            Self::MissingCredentials => "no credentials provided",
            Self::MalformedCredential => "credential is malformed",
            Self::InvalidActorIdHeader => {
                "`X-Authenticated-User-Actor-Id` header is not a valid UUID"
            }
            Self::MissingServiceSecret => "the request requires the service credential",
            Self::InvalidServiceSecret => "service credential is invalid",
            Self::MissingDelegatedActor => "the service credential carries no delegated actor",
            Self::ProviderUnreachable => "failed to verify the credential against the provider",
            Self::ProviderRejection => "the credential provider rejected the verification request",
            Self::InvalidProviderResponse => "the credential provider returned an invalid response",
            Self::InvalidSession => "session is invalid or expired",
            Self::InvalidAccessToken => "access token is invalid or expired",
            Self::IdentityWithoutActor => "the authenticated identity has no matching user actor",
            Self::NotProvisioned { .. } => "identity has no Graph actor provisioned",
            Self::ActorNotFound { .. } => "actor does not exist",
            Self::NotAUser { .. } => "actor is not a user actor",
            Self::StoreError => "failed to validate actor against the principal store",
        }
    }
}

/// Reports a rejection at the level its [`FaultDomain`] calls for.
///
/// The one place a rejection is reported, so a report reaching a response has been logged exactly
/// once, wherever it was produced.
pub(crate) fn log_rejection(report: &Report<AuthenticationError>) {
    match report.current_context().fault_domain() {
        FaultDomain::Service => tracing::error!(error = ?report, "credential verification failed"),
        FaultDomain::Operator => tracing::warn!(
            error = ?report,
            "credential rejected, pointing at provisioning or deployment configuration"
        ),
        FaultDomain::Caller => tracing::debug!(error = ?report, "credential rejected"),
    }
}

/// Resolves the acting principal from the request headers.
///
/// The provider is the only credential path: a request without a recognized credential resolves
/// through [`Caller::anonymous`], and so does one whose credential the provider verified and
/// rejected — an expired session reads public data like a request without one. A failure to
/// verify keeps failing the request. Chain providers as pairs, nested for more than two, to
/// accept several credential kinds.
///
/// # Errors
///
/// - the rejection reason of the provider that recognized the credential, where the caller type
///   requires an actor or the credential could not be verified
/// - [`MissingCredentials`] if no provider recognized a credential and the caller type requires an
///   actor
///
/// [`MissingCredentials`]: AuthenticationError::MissingCredentials
pub async fn resolve_request_actor<P, C>(
    provider: &P,
    headers: &HeaderMap,
) -> Result<C, Report<AuthenticationError>>
where
    P: AuthenticationProvider<C>,
    C: Caller,
{
    // TODO(BE-755): cache verified credentials so repeated requests do not re-verify against the
    //               provider and the principal store each time
    match provider.authenticate(headers).await {
        ControlFlow::Break(Ok(caller)) => Ok(caller),
        ControlFlow::Break(Err(report)) => {
            log_rejection(&report);
            // A verified rejection degrades to anonymous where the chain serves anonymous
            // callers — never to another credential: an ambient credential must not take over
            // an expired explicit choice.
            if report.current_context().is_verified_rejection()
                && let Ok(caller) = C::anonymous()
            {
                Ok(caller)
            } else {
                Err(report)
            }
        }
        ControlFlow::Continue(()) => {
            if headers.contains_key(ACTOR_ID_HEADER) {
                // An actor-ID header without its credential says the caller believed it was
                // delegating, so resolving it as anonymous points at a configuration fault.
                tracing::warn!("actor-ID header carried no recognized credential");
            }
            C::anonymous().map_err(|error| {
                let report = Report::new(error);
                log_rejection(&report);
                report
            })
        }
    }
}

/// Parses the actor from the unverified actor-ID header.
///
/// # Errors
///
/// - [`MissingDelegatedActor`] if the header is absent
/// - [`InvalidActorIdHeader`] if the header is not a valid UUID
///
/// [`MissingDelegatedActor`]: AuthenticationError::MissingDelegatedActor
/// [`InvalidActorIdHeader`]: AuthenticationError::InvalidActorIdHeader
pub fn actor_id_from_header(headers: &HeaderMap) -> Result<ActorEntityUuid, AuthenticationError> {
    let header_value = headers
        .get(ACTOR_ID_HEADER)
        .ok_or(AuthenticationError::MissingDelegatedActor)?;

    header_value
        .to_str()
        .ok()
        .and_then(|header_string| Uuid::from_str(header_string).ok())
        .map(ActorEntityUuid::new)
        .ok_or(AuthenticationError::InvalidActorIdHeader)
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::{assert_matches, mem, ops::ControlFlow};
    use std::sync::Mutex;

    use error_stack::Report;
    use http::HeaderMap;
    use tracing::instrument::WithSubscriber as _;
    use tracing_subscriber::layer::SubscriberExt as _;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{AuthenticationError, FaultDomain, resolve_request_actor};
    use crate::authentication::provider::{
        AuthenticationProvider, Caller, StaticAuthenticationProvider,
    };

    /// The attachment the rejecting provider adds, standing in for what a real provider records
    /// about the credential it refused.
    const PROVIDER_DETAIL: &str = "provider response (401): session expired";

    /// A provider rejecting every request with the given error, carrying an attachment.
    struct RejectingProvider(fn() -> AuthenticationError);

    impl<C: Caller> AuthenticationProvider<C> for RejectingProvider {
        fn authenticate(
            &self,
            _headers: &HeaderMap,
        ) -> impl Future<Output = ControlFlow<Result<C, Report<AuthenticationError>>>> + Send
        {
            core::future::ready(ControlFlow::Break(Err(
                Report::new((self.0)()).attach(PROVIDER_DETAIL)
            )))
        }
    }

    /// Records the level of every event emitted under the subscriber it is layered onto.
    #[derive(Clone, Default)]
    struct EventLevels(Arc<Mutex<Vec<tracing::Level>>>);

    impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for EventLevels {
        fn on_event(
            &self,
            event: &tracing::Event<'_>,
            _ctx: tracing_subscriber::layer::Context<'_, S>,
        ) {
            self.0
                .lock()
                .expect("the event log should lock")
                .push(*event.metadata().level());
        }
    }

    fn random_user() -> ActorId {
        ActorId::User(UserId::new(ActorEntityUuid::new(Uuid::new_v4())))
    }

    fn actor_id_header(actor_id: ActorEntityUuid) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            super::ACTOR_ID_HEADER,
            actor_id
                .to_string()
                .parse()
                .expect("a UUID should be a valid header value"),
        );
        headers
    }

    #[tokio::test]
    async fn verified_credential_authenticates_actor() {
        let actor_id = random_user();
        let provider = StaticAuthenticationProvider::Verified(actor_id);

        let outcome: Result<ActorId, _> = resolve_request_actor(&provider, &HeaderMap::new()).await;

        assert!(
            matches!(outcome, Ok(resolved) if resolved == actor_id),
            "a verified credential should authenticate its actor"
        );
    }

    #[tokio::test]
    async fn rejected_credential_does_not_fall_back_to_actor_id_header() {
        let provider = StaticAuthenticationProvider::Rejected;
        let headers = actor_id_header(ActorEntityUuid::new(Uuid::new_v4()));

        let outcome: Result<ActorId, _> = resolve_request_actor(&provider, &headers).await;

        assert_matches!(
            outcome
                .expect_err(
                    "a rejected credential should fail even when an actor-ID header is present"
                )
                .current_context(),
            AuthenticationError::InvalidSession,
            "the rejection should carry the provider's reason"
        );
    }

    #[tokio::test]
    async fn actor_id_header_alone_fails_authentication() {
        let provider = StaticAuthenticationProvider::NotRecognized;
        let headers = actor_id_header(ActorEntityUuid::new(Uuid::new_v4()));

        let outcome: Result<ActorId, _> = resolve_request_actor(&provider, &headers).await;

        assert_matches!(
            outcome
                .expect_err(
                    "the actor-ID header should not resolve without a provider recognizing it"
                )
                .current_context(),
            AuthenticationError::MissingCredentials,
            "the rejection should name the missing credentials"
        );
    }

    #[tokio::test]
    async fn verified_rejection_resolves_anonymously_where_no_actor_is_required() {
        let provider = StaticAuthenticationProvider::Rejected;

        let outcome: Result<Option<ActorId>, _> =
            resolve_request_actor(&provider, &HeaderMap::new()).await;

        assert!(
            matches!(outcome, Ok(None)),
            "an expired credential should read as anonymous where the chain serves anonymous \
             callers"
        );
    }

    #[tokio::test]
    async fn failure_to_verify_rejects_even_where_anonymous_is_served() {
        let provider = StaticAuthenticationProvider::Unreachable;

        let outcome: Result<Option<ActorId>, _> =
            resolve_request_actor(&provider, &HeaderMap::new()).await;

        assert!(
            matches!(
                outcome
                    .expect_err("an unverifiable credential should fail the request")
                    .current_context(),
                AuthenticationError::ProviderUnreachable
            ),
            "the rejection should carry the verification failure"
        );
    }

    /// An expired explicit credential must not hand the request to an ambient one further down
    /// the chain.
    #[tokio::test]
    async fn verified_rejection_does_not_fall_through_to_another_credential() {
        let chain = (
            StaticAuthenticationProvider::Rejected,
            StaticAuthenticationProvider::Verified(random_user()),
        );

        let anonymous: Result<Option<ActorId>, _> =
            resolve_request_actor(&chain, &HeaderMap::new()).await;
        assert!(
            matches!(anonymous, Ok(None)),
            "the expired credential should degrade to anonymous, not to the second credential"
        );

        let required: Result<ActorId, _> = resolve_request_actor(&chain, &HeaderMap::new()).await;
        assert!(
            matches!(
                required
                    .expect_err("the expired credential should fail where an actor is required")
                    .current_context(),
                AuthenticationError::InvalidSession
            ),
            "the rejection should carry the expired credential's reason"
        );
    }

    #[tokio::test]
    async fn missing_credentials_fail_authentication() {
        let provider = StaticAuthenticationProvider::NotRecognized;

        let outcome: Result<ActorId, _> = resolve_request_actor(&provider, &HeaderMap::new()).await;

        assert_matches!(
            outcome
                .expect_err("a request without credentials should fail authentication")
                .current_context(),
            AuthenticationError::MissingCredentials,
            "the rejection should name the missing credentials"
        );
    }

    /// One instance of every error variant.
    ///
    /// The array length is the variant count, so adding a variant stops compiling here until an
    /// instance of it is supplied. Distinct discriminants rule out one variant standing in twice
    /// while another goes missing.
    fn every_error(
        identity_id: &str,
        actor_id: ActorEntityUuid,
    ) -> [AuthenticationError; mem::variant_count::<AuthenticationError>()] {
        let errors = [
            AuthenticationError::MissingCredentials,
            AuthenticationError::MalformedCredential,
            AuthenticationError::InvalidActorIdHeader,
            AuthenticationError::MissingServiceSecret,
            AuthenticationError::InvalidServiceSecret,
            AuthenticationError::MissingDelegatedActor,
            AuthenticationError::ProviderUnreachable,
            AuthenticationError::ProviderRejection,
            AuthenticationError::InvalidProviderResponse,
            AuthenticationError::InvalidSession,
            AuthenticationError::InvalidAccessToken,
            AuthenticationError::IdentityWithoutActor,
            AuthenticationError::NotProvisioned {
                identity_id: identity_id.to_owned(),
            },
            AuthenticationError::ActorNotFound { actor_id },
            AuthenticationError::NotAUser { actor_id },
            AuthenticationError::StoreError,
        ];

        for (index, error) in errors.iter().enumerate() {
            let repeated = errors[..index]
                .iter()
                .any(|earlier| mem::discriminant(earlier) == mem::discriminant(error));
            assert!(!repeated, "`{error}` should appear exactly once");
        }

        errors
    }

    /// A status the service reports as its own fault is the service's fault to report.
    ///
    /// Cross-checks the domain against [`status_code`], which classifies the same errors
    /// independently, so the two cannot drift apart unnoticed.
    ///
    /// [`status_code`]: AuthenticationError::status_code
    #[test]
    fn server_errors_are_the_services_fault() {
        for error in every_error("identity-id", ActorEntityUuid::new(Uuid::new_v4())) {
            assert_eq!(
                error.status_code().is_server_error(),
                error.fault_domain() == FaultDomain::Service,
                "`{error}` should report the same fault domain as its status code"
            );
        }
    }

    /// The level a rejection is logged at follows its fault domain.
    ///
    /// Pins the mapping at the logging site: [`fault_domain`] alone says nothing about which
    /// macro the resolver reaches for.
    ///
    /// [`fault_domain`]: AuthenticationError::fault_domain
    #[tokio::test]
    async fn rejections_log_at_their_domains_level() {
        let cases = [
            (
                (|| AuthenticationError::ProviderUnreachable) as fn() -> AuthenticationError,
                tracing::Level::ERROR,
            ),
            (
                || AuthenticationError::IdentityWithoutActor,
                tracing::Level::WARN,
            ),
            (
                || AuthenticationError::InvalidSession,
                tracing::Level::DEBUG,
            ),
        ];

        for (error, expected) in cases {
            let levels = EventLevels::default();
            let subscriber = tracing_subscriber::registry().with(levels.clone());
            let provider = RejectingProvider(error);
            // A test that reached these call sites without a subscriber cached them as
            // uninteresting process-wide, and a scoped subscriber does not invalidate that.
            tracing::callsite::rebuild_interest_cache();

            async {
                let _outcome: Result<ActorId, _> =
                    resolve_request_actor(&provider, &HeaderMap::new()).await;
            }
            .with_subscriber(subscriber)
            .await;

            let recorded = levels.0.lock().expect("the event log should lock");
            assert_eq!(
                recorded.as_slice(),
                [expected],
                "`{}` should be logged once, at its domain's level",
                error()
            );
        }

        // The uncredentialed rejection takes the `Continue` path instead of a provider's
        // rejection, so it has its own logging site to pin. Same test: the event tests share
        // the process-global callsite interest cache and cannot run in parallel.
        let levels = EventLevels::default();
        let subscriber = tracing_subscriber::registry().with(levels.clone());
        tracing::callsite::rebuild_interest_cache();

        async {
            let _outcome: Result<ActorId, _> = resolve_request_actor(
                &StaticAuthenticationProvider::NotRecognized,
                &HeaderMap::new(),
            )
            .await;
        }
        .with_subscriber(subscriber)
        .await;

        let recorded = levels.0.lock().expect("the event log should lock");
        assert_eq!(
            recorded.as_slice(),
            [tracing::Level::DEBUG],
            "the missing credentials should be logged once"
        );
    }

    /// What the provider recorded about the credential has to survive the resolver, or the
    /// rejection cannot be diagnosed from the report alone.
    #[tokio::test]
    async fn rejection_carries_the_providers_attachment() {
        let provider = RejectingProvider(|| AuthenticationError::InvalidSession);

        let report = resolve_request_actor::<_, ActorId>(&provider, &HeaderMap::new())
            .await
            .expect_err("a rejected credential should fail");

        assert!(
            format!("{report:?}").contains(PROVIDER_DETAIL),
            "the provider's attachment should survive the resolver"
        );
    }

    /// Every error the client can reach reports something.
    #[test]
    fn client_messages_are_never_empty() {
        for error in every_error("identity-id", ActorEntityUuid::new(Uuid::new_v4())) {
            assert!(
                !error.client_message().is_empty(),
                "`{error}` should report a client message"
            );
        }
    }

    /// The identifiers the client never sees must still reach the logs.
    #[test]
    fn log_representations_carry_their_identifiers() {
        let identity_id = "d290f1ee-6c54-4b01-90e6-d701748f0851";
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let errors = [
            (
                AuthenticationError::NotProvisioned {
                    identity_id: identity_id.to_owned(),
                },
                identity_id.to_owned(),
            ),
            (
                AuthenticationError::ActorNotFound { actor_id },
                actor_id.to_string(),
            ),
            (
                AuthenticationError::NotAUser { actor_id },
                actor_id.to_string(),
            ),
        ];

        for (error, identifier) in errors {
            assert!(
                error.to_string().contains(&identifier),
                "the log representation of `{error}` should carry the identifier"
            );
        }
    }
}
