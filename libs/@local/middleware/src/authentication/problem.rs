//! The public problems a request that failed authentication is answered with.

use alloc::borrow::Cow;

use error_stack::Report;
use http::StatusCode;
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Variant};

use super::request::{AuthenticationError, AuthenticationErrorKind};

/// The public problems of a request that failed authentication.
pub struct AuthenticationProblem;

impl Problem for AuthenticationProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<BadRequest<'static>>(),
        Variant::of::<Unauthorized<'static>>(),
        Variant::of::<ServiceUnavailable<'static>>(),
    ];
}

impl Expose<AuthenticationProblem> for Report<AuthenticationError> {
    fn expose(&self) -> Option<Answer<'_, AuthenticationProblem>> {
        let kind = self.current_context().kind();
        match kind {
            AuthenticationErrorKind::MalformedCredential
            | AuthenticationErrorKind::InvalidActorIdHeader => {
                Some(Answer::new(BadRequest { kind }))
            }
            AuthenticationErrorKind::MissingCredentials
            | AuthenticationErrorKind::MissingServiceSecret
            | AuthenticationErrorKind::InvalidServiceSecret
            | AuthenticationErrorKind::MissingDelegatedActor
            | AuthenticationErrorKind::InvalidSession
            | AuthenticationErrorKind::InvalidAccessToken
            | AuthenticationErrorKind::IdentityWithoutActor
            | AuthenticationErrorKind::NotProvisioned { .. }
            | AuthenticationErrorKind::ActorNotFound { .. }
            | AuthenticationErrorKind::NotAUser { .. } => Some(Answer::new(Unauthorized { kind })),
            AuthenticationErrorKind::ProviderUnreachable | AuthenticationErrorKind::StoreError => {
                Some(Answer::new(ServiceUnavailable { kind }))
            }
            // The service's own exchange with the provider failed, and a retry meets the same
            // fault.
            AuthenticationErrorKind::ProviderRejection
            | AuthenticationErrorKind::InvalidProviderResponse => None,
        }
    }
}

/// The `detail` a failure of `kind` is answered with.
///
/// Says nothing about the service's credentials, identities or actors, so several kinds share
/// one message. [`Display`], used for server-side logs, tells them apart.
///
/// [`Display`]: core::fmt::Display
const fn detail(kind: &AuthenticationErrorKind) -> &'static str {
    match kind {
        AuthenticationErrorKind::MissingCredentials => "no credentials provided",
        AuthenticationErrorKind::MalformedCredential
        | AuthenticationErrorKind::InvalidActorIdHeader => "credentials are malformed",
        AuthenticationErrorKind::InvalidSession => "session is invalid or expired",
        AuthenticationErrorKind::InvalidAccessToken => "access token is invalid or expired",
        AuthenticationErrorKind::MissingServiceSecret
        | AuthenticationErrorKind::InvalidServiceSecret
        | AuthenticationErrorKind::MissingDelegatedActor
        | AuthenticationErrorKind::IdentityWithoutActor
        | AuthenticationErrorKind::NotProvisioned { .. }
        | AuthenticationErrorKind::ActorNotFound { .. }
        | AuthenticationErrorKind::NotAUser { .. } => "credentials are not accepted",
        AuthenticationErrorKind::ProviderUnreachable
        | AuthenticationErrorKind::ProviderRejection
        | AuthenticationErrorKind::InvalidProviderResponse
        | AuthenticationErrorKind::StoreError => "authentication is temporarily unavailable",
    }
}

/// The credentials are malformed.
#[derive(derive_more::Display, serde::Serialize, schemars::JsonSchema)]
#[display("{}", detail(kind))]
struct BadRequest<'r> {
    #[serde(skip)]
    kind: &'r AuthenticationErrorKind,
}

impl ProblemVariant for BadRequest<'_> {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Bad Request"),
        status: StatusCode::BAD_REQUEST,
    };

    fn example() -> Option<Self> {
        Some(Self {
            kind: &AuthenticationErrorKind::MalformedCredential,
        })
    }
}

/// The request carries no credentials, or they do not identify a permitted caller.
#[derive(derive_more::Display, serde::Serialize, schemars::JsonSchema)]
#[display("{}", detail(kind))]
struct Unauthorized<'r> {
    #[serde(skip)]
    kind: &'r AuthenticationErrorKind,
}

impl ProblemVariant for Unauthorized<'_> {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unauthorized"),
        status: StatusCode::UNAUTHORIZED,
    };

    fn example() -> Option<Self> {
        Some(Self {
            kind: &AuthenticationErrorKind::MissingCredentials,
        })
    }
}

/// Authentication is temporarily unavailable. Retry later.
#[derive(derive_more::Display, serde::Serialize, schemars::JsonSchema)]
#[display("{}", detail(kind))]
struct ServiceUnavailable<'r> {
    #[serde(skip)]
    kind: &'r AuthenticationErrorKind,
}

impl ProblemVariant for ServiceUnavailable<'_> {
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Service Unavailable"),
        status: StatusCode::SERVICE_UNAVAILABLE,
    };

    fn example() -> Option<Self> {
        Some(Self {
            kind: &AuthenticationErrorKind::ProviderUnreachable,
        })
    }
}

#[cfg(test)]
mod tests {
    use type_system::principal::actor::ActorEntityUuid;
    use uuid::Uuid;

    use super::detail;
    use crate::authentication::request::every_error;

    /// Every error the client can reach reports something.
    #[test]
    fn detail_every_kind() {
        for error in every_error("identity-id", ActorEntityUuid::new(Uuid::new_v4())) {
            assert!(
                !detail(error.kind()).is_empty(),
                "`{error}` should report a detail"
            );
        }
    }
}
