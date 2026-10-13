//! The `WWW-Authenticate` challenge of a `401` response.

use http::HeaderValue;

use super::{request::AuthenticationErrorKind, service_secret::SERVICE_AUTH_SCHEME};

/// The authentication scheme a request rejected with `401` is told to retry with.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Challenge {
    /// An API token in an `Authorization: Bearer` header.
    ///
    /// The challenge names `error="invalid_token"` when an API token sent with the `Bearer` scheme
    /// is refused, and no error otherwise.
    Bearer,
    /// The service secret in an `Authorization: HASH-Service` header.
    Service,
}

impl Challenge {
    /// The `WWW-Authenticate` value for a request rejected with `kind`.
    pub(crate) const fn header_value(self, kind: &AuthenticationErrorKind) -> HeaderValue {
        match self {
            Self::Service => HeaderValue::from_static(SERVICE_AUTH_SCHEME),
            Self::Bearer => match kind {
                AuthenticationErrorKind::InvalidApiToken
                | AuthenticationErrorKind::ApiTokenOtherEnvironment
                | AuthenticationErrorKind::UnverifiableApiToken => {
                    HeaderValue::from_static(r#"Bearer error="invalid_token""#)
                }
                AuthenticationErrorKind::MissingCredentials
                | AuthenticationErrorKind::InvalidActorIdHeader
                | AuthenticationErrorKind::MissingServiceSecret
                | AuthenticationErrorKind::InvalidServiceSecret
                | AuthenticationErrorKind::MissingDelegatedActor
                | AuthenticationErrorKind::ProviderUnreachable
                | AuthenticationErrorKind::ProviderRejection
                | AuthenticationErrorKind::InvalidProviderResponse
                | AuthenticationErrorKind::InvalidSession
                | AuthenticationErrorKind::InvalidAccessToken
                | AuthenticationErrorKind::NonBearerApiToken
                | AuthenticationErrorKind::ApiTokenNotAccepted
                | AuthenticationErrorKind::IdentityWithoutActor
                | AuthenticationErrorKind::NotProvisioned { .. }
                | AuthenticationErrorKind::ActorNotFound { .. }
                | AuthenticationErrorKind::NotAUser { .. }
                | AuthenticationErrorKind::StoreError => HeaderValue::from_static("Bearer"),
            },
        }
    }
}
