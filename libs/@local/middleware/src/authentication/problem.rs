//! The public problems a request that failed authentication is answered with.

use alloc::borrow::Cow;

use error_stack::Report;
use http::{HeaderMap, StatusCode, header::WWW_AUTHENTICATE};
use problematic::{Answer, Header, Problem, ProblemType, ProblemVariant, Variant};

use super::{
    challenge::Challenge,
    request::{AuthenticationError, AuthenticationErrorKind},
};
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

/// The public problems of a request that failed authentication against a chain without service
/// delegation, which reads no actor header.
#[cfg(feature = "aide")]
pub(crate) struct UndelegatedAuthenticationProblem;

#[cfg(feature = "aide")]
impl Problem for UndelegatedAuthenticationProblem {
    const VARIANTS: &'static [Variant] = &[
        Variant::of::<Unauthorized<'static>>(),
        Variant::of::<ServiceUnavailable<'static>>(),
        Variant::of::<InternalServerError>(),
    ];
}

impl AuthenticationProblem {
    /// The answer to a request rejected with `report`.
    ///
    /// A `401` answer carries `challenge` in its `WWW-Authenticate` header.
    #[must_use]
    pub fn answer(report: &Report<AuthenticationError>, challenge: Challenge) -> Answer<'_, Self> {
        let kind = report.current_context().kind();
        match kind {
            AuthenticationErrorKind::InvalidActorIdHeader => Answer::new(BadRequest { kind }),
            AuthenticationErrorKind::MissingCredentials
            | AuthenticationErrorKind::MissingServiceSecret
            | AuthenticationErrorKind::InvalidServiceSecret
            | AuthenticationErrorKind::MissingDelegatedActor
            | AuthenticationErrorKind::InvalidSession
            | AuthenticationErrorKind::InvalidAccessToken
            | AuthenticationErrorKind::InvalidApiToken
            | AuthenticationErrorKind::ApiTokenOtherEnvironment
            | AuthenticationErrorKind::NonBearerApiToken
            | AuthenticationErrorKind::UnverifiableApiToken
            | AuthenticationErrorKind::ApiTokenNotAccepted
            | AuthenticationErrorKind::IdentityWithoutActor
            | AuthenticationErrorKind::NotProvisioned { .. }
            | AuthenticationErrorKind::ActorNotFound { .. }
            | AuthenticationErrorKind::NotAUser { .. } => {
                Answer::new(Unauthorized { kind, challenge })
            }
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
        AuthenticationErrorKind::InvalidActorIdHeader => {
            "`X-Authenticated-User-Actor-Id` header is not a valid UUID"
        }
        AuthenticationErrorKind::MissingDelegatedActor => {
            "the service credential carries no delegated actor"
        }
        AuthenticationErrorKind::InvalidSession => "session is invalid or expired",
        AuthenticationErrorKind::InvalidAccessToken => "access token is invalid or expired",
        AuthenticationErrorKind::InvalidApiToken => "API token is invalid, expired or revoked",
        AuthenticationErrorKind::ApiTokenOtherEnvironment => {
            "API token belongs to another environment"
        }
        AuthenticationErrorKind::NonBearerApiToken => "API tokens use the `Bearer` scheme",
        AuthenticationErrorKind::ApiTokenNotAccepted => "this API does not accept API tokens",
        AuthenticationErrorKind::MissingServiceSecret
        | AuthenticationErrorKind::InvalidServiceSecret
        | AuthenticationErrorKind::IdentityWithoutActor
        | AuthenticationErrorKind::NotProvisioned { .. }
        | AuthenticationErrorKind::ActorNotFound { .. }
        | AuthenticationErrorKind::NotAUser { .. }
        | AuthenticationErrorKind::UnverifiableApiToken => "credentials are not accepted",
        AuthenticationErrorKind::ProviderUnreachable
        | AuthenticationErrorKind::ProviderRejection
        | AuthenticationErrorKind::InvalidProviderResponse
        | AuthenticationErrorKind::StoreError => "authentication is temporarily unavailable",
    }
}

/// The `X-Authenticated-User-Actor-Id` header is not a valid UUID.
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
            kind: &AuthenticationErrorKind::InvalidActorIdHeader,
        })
    }
}

/// The request carries no credentials, or they do not identify a permitted caller.
#[derive(derive_more::Display, serde::Serialize, schemars::JsonSchema)]
#[display("{}", detail(kind))]
struct Unauthorized<'r> {
    #[serde(skip)]
    kind: &'r AuthenticationErrorKind,
    #[serde(skip)]
    challenge: Challenge,
}

impl ProblemVariant for Unauthorized<'_> {
    const HEADERS: &'static [Header] = &[Header::new::<String>(
        "WWW-Authenticate",
        "The scheme to authenticate with.",
    )];
    const TYPE: ProblemType = ProblemType {
        type_uri: Cow::Borrowed("about:blank"),
        title: Cow::Borrowed("Unauthorized"),
        status: StatusCode::UNAUTHORIZED,
    };

    fn headers(&self, headers: &mut HeaderMap) {
        headers.insert(
            WWW_AUTHENTICATE,
            self.challenge
                .header_value(self.kind, detail(self.kind), &Self::TYPE.type_uri),
        );
    }

    fn example() -> Option<Self> {
        Some(Self {
            kind: &AuthenticationErrorKind::MissingCredentials,
            challenge: Challenge::Bearer,
        })
    }
}

/// Authentication is temporarily unavailable.
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
    use http::{HeaderMap, StatusCode, header::WWW_AUTHENTICATE};
    use type_system::principal::actor::ActorEntityUuid;
    use uuid::Uuid;

    use super::{AuthenticationProblem, detail};
    use crate::authentication::{
        challenge::Challenge,
        request::{AuthenticationError, AuthenticationErrorKind, every_error},
    };

    #[test]
    fn answer_failed_exchange_internal() {
        for error in every_error("identity-id", ActorEntityUuid::new(Uuid::now_v7())) {
            let exchange_failed = matches!(
                error.kind(),
                AuthenticationErrorKind::ProviderRejection
                    | AuthenticationErrorKind::InvalidProviderResponse
            );
            let message = error.to_string();
            let report = Report::new(error);
            assert_eq!(
                AuthenticationProblem::answer(&report, Challenge::Service)
                    .details()
                    .status
                    == StatusCode::INTERNAL_SERVER_ERROR,
                exchange_failed,
                "`{message}` should be internal only if the exchange with the provider failed"
            );
        }
    }

    #[test]
    fn answer_unauthorized_challenge() {
        for challenge in [Challenge::Bearer, Challenge::Service] {
            for error in every_error("identity-id", ActorEntityUuid::new(Uuid::now_v7())) {
                let message = error.to_string();
                let report = Report::new(error);
                let answer = AuthenticationProblem::answer(&report, challenge);
                let mut headers = HeaderMap::new();
                answer.headers(&mut headers);

                assert_eq!(
                    headers.contains_key(WWW_AUTHENTICATE),
                    answer.details().status == StatusCode::UNAUTHORIZED,
                    "`{message}` should carry a challenge exactly when it is answered with 401"
                );
            }
        }
    }

    /// Every `detail` is a valid RFC 6750 `error_description`: spaces and visible ASCII, without
    /// `"` or `\`.
    #[test]
    fn detail_fits_error_description() {
        for error in every_error("identity-id", ActorEntityUuid::new(Uuid::now_v7())) {
            let text = detail(error.kind());
            assert!(
                text.bytes()
                    .all(|byte| matches!(byte, 0x20..=0x21 | 0x23..=0x5B | 0x5D..=0x7E)),
                "`{text}` should only hold characters an `error_description` allows"
            );
        }
    }

    /// A refused API token names a problem type other than `about:blank` as `error_uri`.
    #[test]
    fn challenge_error_uri() {
        assert_eq!(
            Challenge::Bearer.header_value(
                &AuthenticationErrorKind::InvalidApiToken,
                "refused",
                "https://example.com/problems/refused",
            ),
            r#"Bearer realm="HASH", error="invalid_token", error_description="refused", error_uri="https://example.com/problems/refused""#,
            "the challenge should link the problem type"
        );
    }

    #[test]
    fn answer_challenge_value() {
        for (challenge, kind, expected) in [
            (
                Challenge::Bearer,
                AuthenticationErrorKind::InvalidApiToken,
                r#"Bearer realm="HASH", error="invalid_token", error_description="API token is invalid, expired or revoked""#,
            ),
            (
                Challenge::Bearer,
                AuthenticationErrorKind::ApiTokenOtherEnvironment,
                r#"Bearer realm="HASH", error="invalid_token", error_description="API token belongs to another environment""#,
            ),
            (
                Challenge::Bearer,
                AuthenticationErrorKind::UnverifiableApiToken,
                r#"Bearer realm="HASH", error="invalid_token", error_description="credentials are not accepted""#,
            ),
            (
                Challenge::Bearer,
                AuthenticationErrorKind::InvalidAccessToken,
                r#"Bearer realm="HASH""#,
            ),
            (
                Challenge::Bearer,
                AuthenticationErrorKind::MissingCredentials,
                r#"Bearer realm="HASH""#,
            ),
            (
                Challenge::Bearer,
                AuthenticationErrorKind::NonBearerApiToken,
                r#"Bearer realm="HASH""#,
            ),
            (
                Challenge::Session,
                AuthenticationErrorKind::InvalidSession,
                r#"Session realm="HASH""#,
            ),
            (
                Challenge::Service,
                AuthenticationErrorKind::InvalidApiToken,
                r#"HASH-Service realm="HASH""#,
            ),
        ] {
            let report = Report::new(AuthenticationError::new(kind.clone()));
            let mut headers = HeaderMap::new();
            AuthenticationProblem::answer(&report, challenge).headers(&mut headers);

            assert_eq!(
                headers
                    .get(WWW_AUTHENTICATE)
                    .and_then(|value| value.to_str().ok()),
                Some(expected),
                "`{kind}` under the {challenge:?} challenge should challenge with `{expected}`"
            );
        }
    }
}
