//! Provider-based request authentication.

use error_stack::Report;
use http::HeaderMap;
use type_system::principal::actor::ActorId;

use crate::request::AuthenticationError;

/// The result of a provider inspecting a request's credentials.
#[derive(Debug)]
pub enum Authentication {
    /// The request carries no credential this provider handles.
    NotRecognized,
    /// The credential verified to this actor.
    Verified(ActorId),
    /// A credential is present but does not verify.
    ///
    /// Callers must not fall back to other authentication paths.
    Rejected(Report<AuthenticationError>),
}

/// Authenticates requests against a credential verifier.
///
/// A provider owns both the recognition of its credentials in the request headers and their
/// verification.
pub trait AuthenticationProvider: Send + Sync {
    /// Resolves the credential of a request.
    fn authenticate(&self, headers: &HeaderMap) -> impl Future<Output = Authentication> + Send;
}

/// Authentication provider serving a fixed result.
pub enum StaticAuthenticationProvider {
    /// Recognizes no credentials.
    NotRecognized,
    /// Verifies every request to this actor.
    Verified(ActorId),
    /// Rejects every request.
    Rejected,
}

impl AuthenticationProvider for StaticAuthenticationProvider {
    fn authenticate(&self, _headers: &HeaderMap) -> impl Future<Output = Authentication> + Send {
        core::future::ready(match self {
            Self::NotRecognized => Authentication::NotRecognized,
            Self::Verified(actor_id) => Authentication::Verified(*actor_id),
            Self::Rejected => {
                Authentication::Rejected(Report::new(AuthenticationError::InvalidSession))
            }
        })
    }
}
