//! Resolution of a request's credentials to the acting principal.

use core::{ops::ControlFlow, str::FromStr as _};

use hash_status::StatusCode;
use http::HeaderMap;
use type_system::principal::actor::ActorEntityUuid;
use uuid::Uuid;

use crate::provider::AuthenticationProvider;

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
    /// The request requires the service secret but does not carry it.
    #[display("the request requires the service credential")]
    MissingServiceSecret,
    /// The service secret does not match.
    #[display("service credential is invalid")]
    InvalidServiceSecret,
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
            | Self::MissingServiceSecret
            | Self::InvalidServiceSecret
            | Self::InvalidSession
            | Self::NotProvisioned { .. }
            | Self::ActorNotFound { .. }
            | Self::NotAUser { .. } => StatusCode::Unauthenticated,
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
            Self::ProviderUnreachable => "failed to verify the credential against the provider",
            Self::ProviderRejection => "the credential provider rejected the verification request",
            Self::InvalidProviderResponse => "the credential provider returned an invalid response",
            Self::InvalidSession => "session is invalid or expired",
            Self::NotProvisioned { .. } => "identity has no Graph actor provisioned",
            Self::ActorNotFound { .. } => "actor does not exist",
            Self::NotAUser { .. } => "actor is not a user actor",
            Self::StoreError => "failed to validate actor against the principal store",
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
/// The provider is the only credential path: a request whose credential is rejected fails, and a
/// request without a recognized credential fails as [`MissingCredentials`]. Chain providers as
/// pairs, nested for more than two, to accept several credential kinds.
///
/// [`MissingCredentials`]: AuthenticationError::MissingCredentials
pub async fn resolve_request_actor<P>(provider: &P, headers: &HeaderMap) -> AuthenticationOutcome
where
    P: AuthenticationProvider,
{
    // TODO(BE-755): cache verified credentials so repeated requests do not re-verify against the
    //               provider and the principal store each time
    match provider.authenticate(headers).await {
        ControlFlow::Break(Ok(actor)) => AuthenticationOutcome::Authenticated(actor.into()),
        ControlFlow::Break(Err(report)) => {
            let error = report.current_context().clone();
            if matches!(
                error.status_code(),
                StatusCode::Unavailable | StatusCode::Internal
            ) {
                tracing::error!(error = ?report, "credential verification failed");
            } else if matches!(
                error,
                AuthenticationError::NotProvisioned { .. }
                    | AuthenticationError::ActorNotFound { .. }
                    | AuthenticationError::NotAUser { .. }
            ) {
                // A verified credential pointing at a missing or non-user actor is broken
                // provisioning. The client cannot resolve this on its own.
                tracing::warn!(error = ?report, "credential rejected due to broken actor provisioning");
            } else if matches!(
                error,
                AuthenticationError::MissingServiceSecret
                    | AuthenticationError::InvalidServiceSecret
            ) {
                // Legitimate senders of this credential pair are internal services, so a
                // mismatch points at deployment configuration.
                tracing::warn!(error = ?report, "credential rejected due to a service credential mismatch");
            } else {
                tracing::debug!(error = ?report, "credential rejected");
            }
            AuthenticationOutcome::Failed(error)
        }
        ControlFlow::Continue(()) => {
            AuthenticationOutcome::Failed(AuthenticationError::MissingCredentials)
        }
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
    use core::mem;

    use hash_graph_authorization::policies::principal::actor::AuthenticatedActor;
    use http::HeaderMap;
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{AuthenticationError, AuthenticationOutcome, resolve_request_actor};
    use crate::provider::StaticAuthenticationProvider;

    fn random_user() -> AuthenticatedActor {
        AuthenticatedActor::Id(ActorId::User(UserId::new(ActorEntityUuid::new(
            Uuid::new_v4(),
        ))))
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
                    if resolved == ActorEntityUuid::from(actor_id)
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
    async fn actor_id_header_alone_fails_authentication() {
        let provider = StaticAuthenticationProvider::NotRecognized;
        let headers = actor_id_header(ActorEntityUuid::new(Uuid::new_v4()));

        let outcome = resolve_request_actor(&provider, &headers).await;

        assert!(
            matches!(
                outcome,
                AuthenticationOutcome::Failed(AuthenticationError::MissingCredentials)
            ),
            "the actor-ID header should not resolve without a provider recognizing it"
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
            AuthenticationError::ProviderUnreachable,
            AuthenticationError::ProviderRejection,
            AuthenticationError::InvalidProviderResponse,
            AuthenticationError::InvalidSession,
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
