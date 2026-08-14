//! Resolution of a request's credentials to the acting principal.

use core::str::FromStr as _;

use hash_status::StatusCode;
use http::HeaderMap;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use crate::provider::{Authentication, AuthenticationProvider};

/// Name of the header carrying an unverified actor ID.
pub const ACTOR_ID_HEADER: &str = "X-Authenticated-User-Actor-Id";

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
    /// The identity has no Graph actor provisioned.
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
            Self::InvalidActorIdHeader | Self::MalformedCredential => StatusCode::InvalidArgument,
            Self::ProviderUnreachable | Self::ProviderRejection | Self::StoreError => {
                StatusCode::Unavailable
            }
            Self::InvalidProviderResponse => StatusCode::Internal,
            Self::MissingCredentials
            | Self::InvalidSession
            | Self::NotProvisioned { .. }
            | Self::ActorNotFound { .. }
            | Self::NotAUser { .. } => StatusCode::Unauthenticated,
        }
    }
}

/// The result of resolving a request's credentials.
#[derive(Debug, Clone)]
pub enum AuthenticationOutcome {
    /// The request carries accepted credentials for this actor.
    Authenticated(ActorEntityUuid),
    /// The request carries no or invalid credentials.
    Failed(AuthenticationError),
}

/// Resolves the acting principal from the request headers.
///
/// Credentials are considered in order: a provider credential first, the unverified
/// `X-Authenticated-User-Actor-Id` header second. A request carrying a recognized provider
/// credential never falls back to the actor-ID header: a rejected credential fails even if the
/// header is present.
pub async fn resolve_request_actor<P>(provider: &P, headers: &HeaderMap) -> AuthenticationOutcome
where
    P: AuthenticationProvider,
{
    // TODO(BE-755): cache verified credentials so repeated requests do not re-verify against the
    //               provider and the principal store each time
    match provider.authenticate(headers).await {
        Authentication::Verified(actor_id) => {
            AuthenticationOutcome::Authenticated(ActorEntityUuid::new(actor_id))
        }
        Authentication::Rejected(report) => {
            let error = report.current_context().clone();
            if matches!(
                error.status_code(),
                StatusCode::Unavailable | StatusCode::Internal
            ) {
                tracing::error!(error = ?report, "credential verification failed");
            } else {
                tracing::debug!(error = ?report, "credential rejected");
            }
            AuthenticationOutcome::Failed(error)
        }
        Authentication::NotRecognized => match actor_id_from_header(headers) {
            Ok(actor_id) => AuthenticationOutcome::Authenticated(actor_id),
            Err(error) => AuthenticationOutcome::Failed(error),
        },
    }
}

/// Parses the actor from the unverified actor-ID header.
///
/// # Errors
///
/// - [`MissingCredentials`] if the header is absent
/// - [`InvalidActorIdHeader`] if the header is not a valid UUID
///
/// [`MissingCredentials`]: AuthenticationError::MissingCredentials
/// [`InvalidActorIdHeader`]: AuthenticationError::InvalidActorIdHeader
pub fn actor_id_from_header(headers: &HeaderMap) -> Result<ActorEntityUuid, AuthenticationError> {
    let header_value = headers
        .get(ACTOR_ID_HEADER)
        .ok_or(AuthenticationError::MissingCredentials)?;

    header_value
        .to_str()
        .ok()
        .and_then(|header_string| Uuid::from_str(header_string).ok())
        .map(ActorEntityUuid::new)
        .ok_or(AuthenticationError::InvalidActorIdHeader)
}

#[cfg(test)]
mod tests {
    use http::HeaderMap;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{AuthenticationError, AuthenticationOutcome, resolve_request_actor};
    use crate::provider::StaticAuthenticationProvider;

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

        let outcome = resolve_request_actor(&provider, &HeaderMap::new()).await;

        assert!(
            matches!(
                outcome,
                AuthenticationOutcome::Authenticated(resolved)
                    if resolved == ActorEntityUuid::new(actor_id)
            ),
            "a verified credential should authenticate its actor"
        );
    }

    #[tokio::test]
    async fn rejected_credential_does_not_fall_back_to_actor_id_header() {
        let provider = StaticAuthenticationProvider::Rejected;
        let headers = actor_id_header(ActorEntityUuid::new(Uuid::new_v4()));

        let outcome = resolve_request_actor(&provider, &headers).await;

        assert!(
            matches!(
                outcome,
                AuthenticationOutcome::Failed(AuthenticationError::InvalidSession)
            ),
            "a rejected credential should fail even when an actor-ID header is present"
        );
    }

    #[tokio::test]
    async fn actor_id_header_resolves_without_provider_credential() {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        let provider = StaticAuthenticationProvider::NotRecognized;
        let headers = actor_id_header(actor_id);

        let outcome = resolve_request_actor(&provider, &headers).await;

        assert!(
            matches!(outcome, AuthenticationOutcome::Authenticated(resolved) if resolved == actor_id),
            "the actor-ID header should resolve when no provider credential is recognized"
        );
    }

    #[tokio::test]
    async fn missing_credentials_fail_authentication() {
        let provider = StaticAuthenticationProvider::NotRecognized;

        let outcome = resolve_request_actor(&provider, &HeaderMap::new()).await;

        assert!(
            matches!(
                outcome,
                AuthenticationOutcome::Failed(AuthenticationError::MissingCredentials)
            ),
            "a request without credentials should fail authentication"
        );
    }

    #[tokio::test]
    async fn malformed_actor_id_header_fails_authentication() {
        let provider = StaticAuthenticationProvider::NotRecognized;
        let mut headers = HeaderMap::new();
        headers.insert(
            super::ACTOR_ID_HEADER,
            "not-a-uuid".parse().expect("the header value should parse"),
        );

        let outcome = resolve_request_actor(&provider, &headers).await;

        assert!(
            matches!(
                outcome,
                AuthenticationOutcome::Failed(AuthenticationError::InvalidActorIdHeader)
            ),
            "a malformed actor-ID header should fail authentication"
        );
    }
}
