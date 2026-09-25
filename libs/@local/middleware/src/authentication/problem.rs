//! The public problems a request that failed authentication is answered with.

use alloc::borrow::Cow;

use error_stack::Report;
use http::StatusCode;
use problematic::{Answer, Expose, Problem, ProblemType, ProblemVariant, Variant};

use super::request::{AuthenticationError, AuthenticationErrorKind};
use crate::problem::InternalServerError;

/// The public problems of a request that failed authentication.
pub struct AuthenticationProblem;

impl Problem for AuthenticationProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<BadRequest<'static>>(),
        Variant::of::<Unauthorized<'static>>(),
        Variant::of::<ServiceUnavailable<'static>>(),
        Variant::of::<InternalServerError>(),
    ];
}

impl Expose<AuthenticationProblem> for Report<AuthenticationError> {
    fn expose(&self) -> Answer<'_, AuthenticationProblem> {
        let kind = self.current_context().kind();
        match kind {
            AuthenticationErrorKind::MalformedCredential
            | AuthenticationErrorKind::InvalidActorIdHeader => Answer::new(BadRequest { kind }),
            AuthenticationErrorKind::MissingCredentials
            | AuthenticationErrorKind::MissingServiceSecret
            | AuthenticationErrorKind::InvalidServiceSecret
            | AuthenticationErrorKind::MissingDelegatedActor
            | AuthenticationErrorKind::InvalidSession
            | AuthenticationErrorKind::InvalidAccessToken
            | AuthenticationErrorKind::IdentityWithoutActor
            | AuthenticationErrorKind::NotProvisioned { .. }
            | AuthenticationErrorKind::ActorNotFound { .. }
            | AuthenticationErrorKind::NotAUser { .. } => Answer::new(Unauthorized { kind }),
            AuthenticationErrorKind::ProviderUnreachable | AuthenticationErrorKind::StoreError => {
                Answer::new(ServiceUnavailable { kind })
            }
            // The service's own exchange with the provider failed, and a retry meets the same
            // fault.
            AuthenticationErrorKind::ProviderRejection
            | AuthenticationErrorKind::InvalidProviderResponse => Answer::new(InternalServerError),
        }
    }
}

/// The `detail` a failure of `kind` is answered with.
///
/// Says nothing about the service's credentials, identities or actors, so several kinds share
/// one message. Only a caller that presented the valid service secret learns that its actor-ID
/// header is missing or malformed. The `Display` of [`AuthenticationErrorKind`], which
/// server-side logs use, tells every kind apart.
const fn detail(kind: &AuthenticationErrorKind) -> &'static str {
    match kind {
        AuthenticationErrorKind::MissingCredentials => "no credentials provided",
        AuthenticationErrorKind::MalformedCredential => "credentials are malformed",
        AuthenticationErrorKind::InvalidActorIdHeader => {
            "`X-Authenticated-User-Actor-Id` header is not a valid UUID"
        }
        AuthenticationErrorKind::MissingDelegatedActor => {
            "the service credential carries no delegated actor"
        }
        AuthenticationErrorKind::InvalidSession => "session is invalid or expired",
        AuthenticationErrorKind::InvalidAccessToken => "access token is invalid or expired",
        AuthenticationErrorKind::MissingServiceSecret
        | AuthenticationErrorKind::InvalidServiceSecret
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
    use error_stack::Report;
    use http::StatusCode;
    use problematic::Expose;
    use type_system::principal::actor::ActorEntityUuid;
    use uuid::Uuid;

    use super::AuthenticationProblem;
    use crate::authentication::request::{AuthenticationErrorKind, every_error};

    #[test]
    fn expose_failed_exchange_internal() {
        for error in every_error("identity-id", ActorEntityUuid::new(Uuid::new_v4())) {
            let exchange_failed = matches!(
                error.kind(),
                AuthenticationErrorKind::ProviderRejection
                    | AuthenticationErrorKind::InvalidProviderResponse
            );
            let message = error.to_string();
            let report = Report::new(error);
            assert_eq!(
                Expose::<AuthenticationProblem>::expose(&report)
                    .details()
                    .status
                    == StatusCode::INTERNAL_SERVER_ERROR,
                exchange_failed,
                "`{message}` should be internal only if the exchange with the provider failed"
            );
        }
    }
}
