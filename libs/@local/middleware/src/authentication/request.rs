//! Resolution of a request's credentials to the caller.

use alloc::sync::Arc;
use core::{fmt, ops::ControlFlow, str::FromStr as _};

use error_stack::Report;
use http::HeaderMap;
use tracing_opentelemetry::OpenTelemetrySpanExt as _;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use crate::authentication::{
    AuthenticationMetrics, Degradation,
    provider::{AuthenticationProvider, Caller},
    trace_degradation,
};

/// Name of the header carrying an unverified actor ID.
pub const ACTOR_ID_HEADER: &str = "X-Authenticated-User-Actor-Id";

/// Whose fault a rejection is.
///
/// The domain labels the rejection and degradation metrics.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FaultDomain {
    /// The service cannot answer credential questions at all.
    Service,
    /// The credential is intact, but provisioning or deployment configuration is not.
    Operator,
    /// The caller can repair the request on its own.
    Caller,
}

impl FaultDomain {
    /// Returns the domain's name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Service => "service",
            Self::Operator => "operator",
            Self::Caller => "caller",
        }
    }
}

/// Errors that can occur while authenticating a request.
#[derive(Debug, Clone, derive_more::Display, PartialEq, Eq)]
pub enum AuthenticationErrorKind {
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
    /// The credential provider could not be reached, throttled the request, or failed.
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
    /// The API token does not exist, is expired or revoked, or carries the wrong secret.
    #[display("API token is invalid, expired or revoked")]
    InvalidApiToken,
    /// The API token belongs to another environment.
    #[display("API token belongs to another environment")]
    ApiTokenOtherEnvironment,
    /// The API token is sent without the `Bearer` scheme.
    #[display("API token is not sent with the `Bearer` scheme")]
    NonBearerApiToken,
    /// The API token cannot be verified: API tokens are not configured, the key its record names
    /// is not configured, or its record does not decrypt with that key.
    #[display("the API token cannot be verified")]
    UnverifiableApiToken,
    /// The API does not accept API tokens.
    #[display("this API does not accept API tokens")]
    ApiTokenNotAccepted,
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

impl AuthenticationErrorKind {
    /// Returns the metric label shared by all errors of this kind.
    pub(super) const fn metric_reason(&self) -> &'static str {
        match self {
            Self::MissingCredentials => "missing_credentials",
            Self::MalformedCredential => "malformed_credential",
            Self::InvalidActorIdHeader => "invalid_actor_id_header",
            Self::MissingServiceSecret => "missing_service_secret",
            Self::InvalidServiceSecret => "invalid_service_secret",
            Self::MissingDelegatedActor => "missing_delegated_actor",
            Self::ProviderUnreachable => "provider_unreachable",
            Self::ProviderRejection => "provider_rejection",
            Self::InvalidProviderResponse => "invalid_provider_response",
            Self::InvalidSession => "invalid_session",
            Self::InvalidAccessToken => "invalid_access_token",
            Self::InvalidApiToken => "invalid_api_token",
            Self::ApiTokenOtherEnvironment => "api_token_other_environment",
            Self::NonBearerApiToken => "non_bearer_api_token",
            Self::UnverifiableApiToken => "unverifiable_api_token",
            Self::ApiTokenNotAccepted => "api_token_not_accepted",
            Self::IdentityWithoutActor => "identity_without_actor",
            Self::NotProvisioned { .. } => "not_provisioned",
            Self::ActorNotFound { .. } => "actor_not_found",
            Self::NotAUser { .. } => "not_a_user",
            Self::StoreError => "store_error",
        }
    }

    /// Whether the provider verified a session or access token and rejected it, as opposed to
    /// failing to verify it.
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
            // provisioning. Legitimate senders of the service credential are internal services, so
            // a mismatch points at deployment configuration, as does an API token the service
            // cannot verify.
            Self::IdentityWithoutActor
            | Self::NotProvisioned { .. }
            | Self::ActorNotFound { .. }
            | Self::NotAUser { .. }
            | Self::UnverifiableApiToken
            | Self::InvalidServiceSecret => FaultDomain::Operator,
            // A request arriving without the service secret says nothing about the deployment:
            // anyone can send one.
            Self::MissingCredentials
            | Self::MalformedCredential
            | Self::InvalidActorIdHeader
            | Self::MissingServiceSecret
            | Self::MissingDelegatedActor
            | Self::InvalidSession
            | Self::InvalidAccessToken
            | Self::InvalidApiToken
            | Self::ApiTokenOtherEnvironment
            | Self::NonBearerApiToken
            | Self::ApiTokenNotAccepted => FaultDomain::Caller,
        }
    }
}

/// An authentication failure, classified by its [`AuthenticationErrorKind`].
///
/// The kind determines the fault domain and the public problem the failure is answered with.
#[derive(Debug)]
pub struct AuthenticationError {
    /// What failed.
    kind: AuthenticationErrorKind,
}

impl AuthenticationError {
    /// Creates the error for `kind`.
    #[must_use]
    pub const fn new(kind: AuthenticationErrorKind) -> Self {
        Self { kind }
    }

    #[must_use]
    pub const fn kind(&self) -> &AuthenticationErrorKind {
        &self.kind
    }

    #[must_use]
    pub const fn fault_domain(&self) -> FaultDomain {
        self.kind.fault_domain()
    }

    #[must_use]
    pub const fn is_verified_rejection(&self) -> bool {
        self.kind.is_verified_rejection()
    }

    /// Creates an error for [`AuthenticationErrorKind::MissingCredentials`].
    #[must_use]
    pub const fn missing_credentials() -> Self {
        Self::new(AuthenticationErrorKind::MissingCredentials)
    }

    /// Creates an error for [`AuthenticationErrorKind::MalformedCredential`].
    #[must_use]
    pub const fn malformed_credential() -> Self {
        Self::new(AuthenticationErrorKind::MalformedCredential)
    }

    /// Creates an error for [`AuthenticationErrorKind::InvalidActorIdHeader`].
    #[must_use]
    pub const fn invalid_actor_id_header() -> Self {
        Self::new(AuthenticationErrorKind::InvalidActorIdHeader)
    }

    /// Creates an error for [`AuthenticationErrorKind::MissingServiceSecret`].
    #[must_use]
    pub const fn missing_service_secret() -> Self {
        Self::new(AuthenticationErrorKind::MissingServiceSecret)
    }

    /// Creates an error for [`AuthenticationErrorKind::InvalidServiceSecret`].
    #[must_use]
    pub const fn invalid_service_secret() -> Self {
        Self::new(AuthenticationErrorKind::InvalidServiceSecret)
    }

    /// Creates an error for [`AuthenticationErrorKind::MissingDelegatedActor`].
    #[must_use]
    pub const fn missing_delegated_actor() -> Self {
        Self::new(AuthenticationErrorKind::MissingDelegatedActor)
    }

    /// Creates an error for [`AuthenticationErrorKind::ProviderUnreachable`].
    #[must_use]
    pub const fn provider_unreachable() -> Self {
        Self::new(AuthenticationErrorKind::ProviderUnreachable)
    }

    /// Creates an error for [`AuthenticationErrorKind::ProviderRejection`].
    #[must_use]
    pub const fn provider_rejection() -> Self {
        Self::new(AuthenticationErrorKind::ProviderRejection)
    }

    /// Creates an error for [`AuthenticationErrorKind::InvalidProviderResponse`].
    #[must_use]
    pub const fn invalid_provider_response() -> Self {
        Self::new(AuthenticationErrorKind::InvalidProviderResponse)
    }

    /// Creates an error for [`AuthenticationErrorKind::InvalidSession`].
    #[must_use]
    pub const fn invalid_session() -> Self {
        Self::new(AuthenticationErrorKind::InvalidSession)
    }

    /// Creates an error for [`AuthenticationErrorKind::InvalidAccessToken`].
    #[must_use]
    pub const fn invalid_access_token() -> Self {
        Self::new(AuthenticationErrorKind::InvalidAccessToken)
    }

    /// Creates an error for [`AuthenticationErrorKind::InvalidApiToken`].
    #[must_use]
    pub const fn invalid_api_token() -> Self {
        Self::new(AuthenticationErrorKind::InvalidApiToken)
    }

    /// Creates an error for [`AuthenticationErrorKind::ApiTokenOtherEnvironment`].
    #[must_use]
    pub const fn api_token_other_environment() -> Self {
        Self::new(AuthenticationErrorKind::ApiTokenOtherEnvironment)
    }

    /// Creates an error for [`AuthenticationErrorKind::NonBearerApiToken`].
    #[must_use]
    pub const fn non_bearer_api_token() -> Self {
        Self::new(AuthenticationErrorKind::NonBearerApiToken)
    }

    /// Creates an error for [`AuthenticationErrorKind::UnverifiableApiToken`].
    #[must_use]
    pub const fn unverifiable_api_token() -> Self {
        Self::new(AuthenticationErrorKind::UnverifiableApiToken)
    }

    /// Creates an error for [`AuthenticationErrorKind::ApiTokenNotAccepted`].
    #[must_use]
    pub const fn api_token_not_accepted() -> Self {
        Self::new(AuthenticationErrorKind::ApiTokenNotAccepted)
    }

    /// Creates an error for [`AuthenticationErrorKind::IdentityWithoutActor`].
    #[must_use]
    pub const fn identity_without_actor() -> Self {
        Self::new(AuthenticationErrorKind::IdentityWithoutActor)
    }

    /// Creates an error for [`AuthenticationErrorKind::NotProvisioned`].
    #[must_use]
    pub fn not_provisioned(identity_id: impl Into<String>) -> Self {
        Self::new(AuthenticationErrorKind::NotProvisioned {
            identity_id: identity_id.into(),
        })
    }

    /// Creates an error for [`AuthenticationErrorKind::ActorNotFound`].
    #[must_use]
    pub const fn actor_not_found(actor_id: ActorEntityUuid) -> Self {
        Self::new(AuthenticationErrorKind::ActorNotFound { actor_id })
    }

    /// Creates an error for [`AuthenticationErrorKind::NotAUser`].
    #[must_use]
    pub const fn not_a_user(actor_id: ActorEntityUuid) -> Self {
        Self::new(AuthenticationErrorKind::NotAUser { actor_id })
    }

    /// Creates an error for [`AuthenticationErrorKind::StoreError`].
    #[must_use]
    pub const fn store_error() -> Self {
        Self::new(AuthenticationErrorKind::StoreError)
    }
}

impl fmt::Display for AuthenticationError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.kind, fmt)
    }
}

impl core::error::Error for AuthenticationError {}

/// Resolves the caller from the request headers.
///
/// The provider is the only credential path: a request without a recognized credential resolves
/// through [`Caller::anonymous`], and so does one whose session or access token the provider
/// verified and rejected — an expired session reads public data like a request without one. Any
/// other rejection, a rejected API token among them, and a failure to verify keep failing the
/// request. A degrade to anonymous is counted on `metrics` and added to the current span. Chain
/// providers as pairs, nested for more than two, to accept several credential kinds.
///
/// # Errors
///
/// - the rejection reason of the provider that recognized the credential, unless the provider
///   verified and rejected a session or access token and the caller type serves anonymous callers
/// - [`MissingCredentials`] if no provider recognized a credential and the caller type requires an
///   actor
///
/// [`MissingCredentials`]: AuthenticationErrorKind::MissingCredentials
pub async fn resolve_request_actor<P, C>(
    provider: &P,
    headers: &HeaderMap,
    metrics: &AuthenticationMetrics,
) -> Result<C, Arc<Report<AuthenticationError>>>
where
    P: AuthenticationProvider<C>,
    C: Caller,
{
    match provider.authenticate(headers).await {
        ControlFlow::Break(Ok(caller)) => Ok(caller),
        ControlFlow::Break(Err(report)) => {
            // A verified rejection degrades to anonymous where the chain serves anonymous
            // callers — never to another credential: an ambient credential must not take over
            // an expired explicit choice.
            if report.current_context().is_verified_rejection()
                && let Ok(caller) = C::anonymous()
            {
                metrics.record_degradation(report.current_context(), Degradation::Anonymous);
                trace_degradation(&report, Degradation::Anonymous);
                Ok(caller)
            } else {
                Err(report)
            }
        }
        ControlFlow::Continue(()) => {
            if headers.contains_key(ACTOR_ID_HEADER) {
                // An actor-ID header without its credential says the caller believed it was
                // delegating, so resolving it as anonymous points at a configuration fault.
                tracing::Span::current().add_event(
                    "actor-ID header carried no recognized credential",
                    Vec::new(),
                );
            }
            C::anonymous().map_err(|error| Arc::new(Report::new(error)))
        }
    }
}

/// One instance of every error variant.
///
/// The array length is the variant count, so adding a variant stops compiling here until an
/// instance of it is supplied. Distinct discriminants rule out one variant standing in twice
/// while another goes missing.
#[cfg(test)]
pub(crate) fn every_error(
    identity_id: &str,
    actor_id: ActorEntityUuid,
) -> [AuthenticationError; core::mem::variant_count::<AuthenticationErrorKind>()] {
    let errors = [
        AuthenticationErrorKind::MissingCredentials,
        AuthenticationErrorKind::MalformedCredential,
        AuthenticationErrorKind::InvalidActorIdHeader,
        AuthenticationErrorKind::MissingServiceSecret,
        AuthenticationErrorKind::InvalidServiceSecret,
        AuthenticationErrorKind::MissingDelegatedActor,
        AuthenticationErrorKind::ProviderUnreachable,
        AuthenticationErrorKind::ProviderRejection,
        AuthenticationErrorKind::InvalidProviderResponse,
        AuthenticationErrorKind::InvalidSession,
        AuthenticationErrorKind::InvalidAccessToken,
        AuthenticationErrorKind::InvalidApiToken,
        AuthenticationErrorKind::ApiTokenOtherEnvironment,
        AuthenticationErrorKind::NonBearerApiToken,
        AuthenticationErrorKind::UnverifiableApiToken,
        AuthenticationErrorKind::ApiTokenNotAccepted,
        AuthenticationErrorKind::IdentityWithoutActor,
        AuthenticationErrorKind::NotProvisioned {
            identity_id: identity_id.to_owned(),
        },
        AuthenticationErrorKind::ActorNotFound { actor_id },
        AuthenticationErrorKind::NotAUser { actor_id },
        AuthenticationErrorKind::StoreError,
    ];

    for (index, error) in errors.iter().enumerate() {
        let repeated = errors[..index]
            .iter()
            .any(|earlier| core::mem::discriminant(earlier) == core::mem::discriminant(error));
        assert!(!repeated, "`{error}` should appear exactly once");
    }

    errors.map(AuthenticationError::new)
}

/// Parses the actor from the unverified actor-ID header.
///
/// # Errors
///
/// - [`MissingDelegatedActor`] if the header is absent
/// - [`InvalidActorIdHeader`] if the header is not a valid UUID
///
/// [`MissingDelegatedActor`]: AuthenticationErrorKind::MissingDelegatedActor
/// [`InvalidActorIdHeader`]: AuthenticationErrorKind::InvalidActorIdHeader
pub fn actor_id_from_header(headers: &HeaderMap) -> Result<ActorEntityUuid, AuthenticationError> {
    let header_value = headers
        .get(ACTOR_ID_HEADER)
        .ok_or(AuthenticationError::new(
            AuthenticationErrorKind::MissingDelegatedActor,
        ))?;

    header_value
        .to_str()
        .ok()
        .and_then(|header_string| Uuid::from_str(header_string).ok())
        .map(ActorEntityUuid::new)
        .ok_or(AuthenticationError::new(
            AuthenticationErrorKind::InvalidActorIdHeader,
        ))
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::{assert_matches, ops::ControlFlow};

    use error_stack::Report;
    use http::HeaderMap;
    use problematic::Expose;
    use tracing::{Instrument as _, instrument::WithSubscriber as _};
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{AuthenticationError, FaultDomain, every_error, resolve_request_actor};
    use crate::{
        authentication::{
            AuthenticationMetrics, AuthenticationProblem,
            provider::{AuthenticationProvider, Caller, StaticAuthenticationProvider},
            request::AuthenticationErrorKind,
        },
        test_tracing::RecordedTrace,
    };

    /// The attachment the rejecting provider adds, standing in for what a real provider records
    /// about the credential it refused.
    const PROVIDER_DETAIL: &str = "provider response (401): session expired";

    fn test_metrics() -> AuthenticationMetrics {
        AuthenticationMetrics::new(&crate::test_metrics::noop_meter())
    }

    /// A provider rejecting every request with the given error, carrying an attachment.
    struct RejectingProvider(fn() -> AuthenticationErrorKind);

    impl<C: Caller> AuthenticationProvider<C> for RejectingProvider {
        fn authenticate(
            &self,
            _headers: &HeaderMap,
        ) -> impl Future<Output = ControlFlow<Result<C, Arc<Report<AuthenticationError>>>>> + Send
        {
            core::future::ready(ControlFlow::Break(Err(Arc::new(
                Report::new(AuthenticationError::new((self.0)())).attach(PROVIDER_DETAIL),
            ))))
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

        let outcome: Result<ActorId, _> =
            resolve_request_actor(&provider, &HeaderMap::new(), &test_metrics()).await;

        assert!(
            matches!(outcome, Ok(resolved) if resolved == actor_id),
            "a verified credential should authenticate its actor"
        );
    }

    #[tokio::test]
    async fn rejected_credential_does_not_fall_back_to_actor_id_header() {
        let provider = StaticAuthenticationProvider::Rejected;
        let headers = actor_id_header(ActorEntityUuid::new(Uuid::new_v4()));

        let outcome: Result<ActorId, _> =
            resolve_request_actor(&provider, &headers, &test_metrics()).await;

        assert_matches!(
            outcome
                .expect_err(
                    "a rejected credential should fail even when an actor-ID header is present"
                )
                .current_context()
                .kind,
            AuthenticationErrorKind::InvalidSession,
            "the rejection should carry the provider's reason"
        );
    }

    #[tokio::test]
    async fn actor_id_header_alone_fails_authentication() {
        let provider = StaticAuthenticationProvider::NotRecognized;
        let headers = actor_id_header(ActorEntityUuid::new(Uuid::new_v4()));

        let outcome: Result<ActorId, _> =
            resolve_request_actor(&provider, &headers, &test_metrics()).await;

        assert_matches!(
            outcome
                .expect_err(
                    "the actor-ID header should not resolve without a provider recognizing it"
                )
                .current_context()
                .kind,
            AuthenticationErrorKind::MissingCredentials,
            "the rejection should name the missing credentials"
        );
    }

    #[tokio::test]
    async fn verified_rejection_resolves_anonymously_where_no_actor_is_required() {
        let provider = StaticAuthenticationProvider::Rejected;

        let outcome: Result<Option<ActorId>, _> =
            resolve_request_actor(&provider, &HeaderMap::new(), &test_metrics()).await;

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
            resolve_request_actor(&provider, &HeaderMap::new(), &test_metrics()).await;

        assert!(
            matches!(
                outcome
                    .expect_err("an unverifiable credential should fail the request")
                    .current_context()
                    .kind,
                AuthenticationErrorKind::ProviderUnreachable
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
            resolve_request_actor(&chain, &HeaderMap::new(), &test_metrics()).await;
        assert!(
            matches!(anonymous, Ok(None)),
            "the expired credential should degrade to anonymous, not to the second credential"
        );

        let required: Result<ActorId, _> =
            resolve_request_actor(&chain, &HeaderMap::new(), &test_metrics()).await;
        assert!(
            matches!(
                required
                    .expect_err("the expired credential should fail where an actor is required")
                    .current_context()
                    .kind,
                AuthenticationErrorKind::InvalidSession
            ),
            "the rejection should carry the expired credential's reason"
        );
    }

    #[tokio::test]
    async fn missing_credentials_fail_authentication() {
        let provider = StaticAuthenticationProvider::NotRecognized;

        let outcome: Result<ActorId, _> =
            resolve_request_actor(&provider, &HeaderMap::new(), &test_metrics()).await;

        assert_matches!(
            outcome
                .expect_err("a request without credentials should fail authentication")
                .current_context()
                .kind,
            AuthenticationErrorKind::MissingCredentials,
            "the rejection should name the missing credentials"
        );
    }

    /// A status the service reports as its own fault is the service's fault to report.
    ///
    /// Cross-checks the domain against the status of the public problem, which classifies the
    /// same errors independently, so the two cannot drift apart unnoticed.
    #[test]
    fn server_errors_are_the_services_fault() {
        for error in every_error("identity-id", ActorEntityUuid::new(Uuid::new_v4())) {
            let service_fault = error.fault_domain() == FaultDomain::Service;
            let message = error.to_string();
            let report = Report::new(error);
            let server_error = Expose::<AuthenticationProblem>::expose(&report)
                .details()
                .status
                .is_server_error();
            assert_eq!(
                server_error, service_fault,
                "`{message}` should report the same fault domain as its status code"
            );
        }
    }

    /// A verified rejection that degrades to anonymous reaches the current span with what the
    /// provider recorded, as no rejection carries it to the telemetry layer. It is not logged.
    #[tokio::test]
    async fn resolve_degradation_traced() {
        let trace = RecordedTrace::new();
        let provider = RejectingProvider(|| AuthenticationErrorKind::InvalidSession);

        async {
            let _: Result<Option<ActorId>, _> =
                resolve_request_actor(&provider, &HeaderMap::new(), &test_metrics())
                    .instrument(tracing::info_span!("request"))
                    .await;
        }
        .with_subscriber(trace.dispatch())
        .await;

        assert!(
            trace.traces_error(PROVIDER_DETAIL),
            "the trace should carry what the provider recorded"
        );
        assert!(
            trace.levels().is_empty(),
            "the degradation should not be logged"
        );
    }

    /// What the provider recorded about the credential has to survive the resolver, or the
    /// rejection cannot be diagnosed from the report alone.
    #[tokio::test]
    async fn rejection_carries_the_providers_attachment() {
        let provider = RejectingProvider(|| AuthenticationErrorKind::InvalidSession);

        let report =
            resolve_request_actor::<_, ActorId>(&provider, &HeaderMap::new(), &test_metrics())
                .await
                .expect_err("a rejected credential should fail");

        assert!(
            format!("{report:?}").contains(PROVIDER_DETAIL),
            "the provider's attachment should survive the resolver"
        );
    }

    /// The identifiers the client never sees must still reach the report the telemetry layer
    /// records.
    #[test]
    fn log_representations_carry_their_identifiers() {
        let identity_id = "d290f1ee-6c54-4b01-90e6-d701748f0851";
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let errors = [
            (
                AuthenticationErrorKind::NotProvisioned {
                    identity_id: identity_id.to_owned(),
                },
                identity_id.to_owned(),
            ),
            (
                AuthenticationErrorKind::ActorNotFound { actor_id },
                actor_id.to_string(),
            ),
            (
                AuthenticationErrorKind::NotAUser { actor_id },
                actor_id.to_string(),
            ),
        ];

        for (error, identifier) in errors {
            let report = Report::new(AuthenticationError::new(error));
            assert!(
                format!("{report:?}").contains(&identifier),
                "the log representation of `{report:?}` should carry the identifier"
            );
        }
    }
}
