//! The `WWW-Authenticate` challenge of a `401` response.

use core::fmt::Write as _;

use http::HeaderValue;

use super::{request::AuthenticationErrorKind, service_secret::SERVICE_AUTH_SCHEME};

/// The authentication scheme a request rejected with `401` is told to retry with.
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
pub enum Challenge {
    /// An API token in an `Authorization: Bearer` header.
    ///
    /// When an API token sent with the `Bearer` scheme is refused, the challenge adds
    /// `error="invalid_token"` and the problem's `detail` as `error_description`.
    Bearer,
    /// The service secret in an `Authorization: HASH-Service` header.
    Service,
    /// A Kratos session, in its cookie or the `X-Session-Token` header.
    Session,
}

impl Challenge {
    /// The protection space every challenge names.
    ///
    /// RFC 6750 requires a `Bearer` challenge to carry a parameter even when it may carry no
    /// error, which the realm provides.
    pub const REALM: &str = "HASH";

    /// The authentication scheme the challenge names.
    #[must_use]
    pub const fn scheme(self) -> &'static str {
        match self {
            Self::Bearer => "Bearer",
            Self::Service => SERVICE_AUTH_SCHEME,
            Self::Session => "Session",
        }
    }

    /// Describes the `WWW-Authenticate` header of a `401` answered with this challenge.
    #[must_use]
    pub fn description(self) -> String {
        let mut description = format!(
            "The scheme to authenticate with: `{}`, with `realm=\"{}\"`.",
            self.scheme(),
            Self::REALM
        );
        if self == Self::Bearer {
            description.push_str(
                " A refused API token adds `error=\"invalid_token\"` and the problem's `detail` \
                 as `error_description`.",
            );
        }
        description
    }

    /// The `WWW-Authenticate` value for a request rejected with `kind`, whose problem has `detail`
    /// and `problem_type`.
    ///
    /// A refused `Bearer` API token adds `problem_type` as `error_uri` unless it is `about:blank`,
    /// which names no page.
    pub(crate) fn header_value(
        self,
        kind: &AuthenticationErrorKind,
        detail: &str,
        problem_type: &str,
    ) -> HeaderValue {
        let mut value = format!("{} realm=\"{}\"", self.scheme(), Self::REALM);
        if self == Self::Bearer && refuses_api_token(kind) {
            let _: core::fmt::Result = write!(
                value,
                ", error=\"invalid_token\", error_description=\"{detail}\""
            );
            if problem_type != "about:blank" {
                let _: core::fmt::Result = write!(value, ", error_uri=\"{problem_type}\"");
            }
        }
        HeaderValue::try_from(value)
            .expect("should build the challenge from visible ASCII, as every `detail` is")
    }
}

/// Whether `kind` refuses an API token the request presented.
const fn refuses_api_token(kind: &AuthenticationErrorKind) -> bool {
    match kind {
        AuthenticationErrorKind::InvalidApiToken
        | AuthenticationErrorKind::ApiTokenOtherEnvironment
        | AuthenticationErrorKind::UnverifiableApiToken => true,
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
        | AuthenticationErrorKind::StoreError => false,
    }
}
