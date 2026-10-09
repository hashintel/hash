//! Authentication of requests with API tokens.

use alloc::sync::Arc;
use core::{ops::ControlFlow, str::FromStr as _};

use error_stack::{Report, ResultExt as _};
use hash_graph_store::{
    api_token::{
        ApiTokenAuthenticationError, ApiTokenCredential, ApiTokenId, ApiTokenStore,
        ApiTokenVerificationError,
    },
    pool::StorePool,
};
use hash_middleware::authentication::{
    provider::{AuthenticationProvider, Caller},
    request::AuthenticationError,
};
use http::{HeaderMap, header::AUTHORIZATION};
use type_system::principal::actor::{ActorId, UserId};

use super::{ApiTokenIssuer, HashedApiToken, PREFIX};

/// The `Authorization` scheme carrying an API token.
const API_TOKEN_SCHEME: &str = "Bearer";

/// An API token in the `Authorization` header.
#[cfg_attr(test, derive(Debug, PartialEq, Eq))]
enum PresentedApiToken<'h> {
    /// A token sent with the `Bearer` scheme.
    Bearer(&'h str),
    /// A token sent without a scheme or with another one.
    NonBearer,
}

/// Returns how the first `Authorization` header presents an API token.
///
/// Returns [`None`] when the header is absent, not visible ASCII, or carries no credential that
/// starts with `hsh_`. The scheme is matched case-insensitively.
fn presented_api_token(headers: &HeaderMap) -> Option<PresentedApiToken<'_>> {
    let credentials = headers.get(AUTHORIZATION)?.to_str().ok()?.trim_ascii();
    if credentials.starts_with(PREFIX) {
        return Some(PresentedApiToken::NonBearer);
    }

    let (scheme, token) = credentials.split_once(' ')?;
    let token = token.trim_ascii();
    token.starts_with(PREFIX).then(|| {
        if scheme.eq_ignore_ascii_case(API_TOKEN_SCHEME) {
            PresentedApiToken::Bearer(token)
        } else {
            PresentedApiToken::NonBearer
        }
    })
}

/// Authenticates API tokens against the tokens a store records.
///
/// Indirection over [`ApiTokenStore::authenticate_api_token`].
pub trait AuthenticateApiToken: Send + Sync {
    /// Authenticates the API token `token_id` and returns the user it acts as.
    ///
    /// # Errors
    ///
    /// - [`Invalid`] if no user has a token `token_id` that is neither revoked nor expired
    /// - [`Invalid`] or [`Unverifiable`] if `verify` fails, converted [`From`] its
    ///   [`ApiTokenVerificationError`], which stays in the report
    /// - [`Store`] if no store can be acquired, the token cannot be read, or its use cannot be
    ///   recorded
    ///
    /// [`Invalid`]: ApiTokenAuthenticationError::Invalid
    /// [`Unverifiable`]: ApiTokenAuthenticationError::Unverifiable
    /// [`Store`]: ApiTokenAuthenticationError::Store
    fn authenticate_api_token<F>(
        &self,
        token_id: ApiTokenId,
        verify: F,
    ) -> impl Future<Output = Result<UserId, Report<ApiTokenAuthenticationError>>> + Send
    where
        F: FnOnce(&ApiTokenCredential) -> Result<(), ApiTokenVerificationError> + Send;
}

/// [`AuthenticateApiToken`] implementation backed by a [`StorePool`].
pub struct StorePoolApiTokenAuthenticator<S> {
    pool: Arc<S>,
}

impl<S> StorePoolApiTokenAuthenticator<S> {
    #[must_use]
    pub const fn new(pool: Arc<S>) -> Self {
        Self { pool }
    }
}

impl<S> AuthenticateApiToken for StorePoolApiTokenAuthenticator<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: ApiTokenStore,
{
    async fn authenticate_api_token<F>(
        &self,
        token_id: ApiTokenId,
        verify: F,
    ) -> Result<UserId, Report<ApiTokenAuthenticationError>>
    where
        F: FnOnce(&ApiTokenCredential) -> Result<(), ApiTokenVerificationError> + Send,
    {
        self.pool
            .acquire(None)
            .await
            .change_context(ApiTokenAuthenticationError::Store)?
            .authenticate_api_token(token_id, verify)
            .await
    }
}

/// The error a request fails with when the store does not authenticate its API token.
const fn authentication_error(error: &ApiTokenAuthenticationError) -> AuthenticationError {
    match error {
        ApiTokenAuthenticationError::Invalid => AuthenticationError::invalid_api_token(),
        ApiTokenAuthenticationError::Unverifiable => AuthenticationError::unverifiable_api_token(),
        ApiTokenAuthenticationError::Store => AuthenticationError::store_error(),
    }
}

/// Authenticates requests with the API token in the `Authorization` header.
///
/// Recognizes a credential that starts with `hsh_`. A token sent without the `Bearer` scheme, one
/// that does not parse, one of an environment other than the issuer's, and every token without an
/// issuer are rejected without a store lookup. Otherwise the store reads the token, the issuer
/// verifies it, and the token acts as the user it belongs to. A rejection of a token that parses
/// carries its token ID.
pub struct ApiTokenProvider<A> {
    authenticator: A,
    issuer: Option<Arc<ApiTokenIssuer>>,
}

impl<A> ApiTokenProvider<A> {
    #[must_use]
    pub const fn new(authenticator: A, issuer: Option<Arc<ApiTokenIssuer>>) -> Self {
        Self {
            authenticator,
            issuer,
        }
    }
}

impl<A> ApiTokenProvider<A>
where
    A: AuthenticateApiToken,
{
    async fn authenticate_token(&self, token: &str) -> Result<UserId, Report<AuthenticationError>> {
        let token = HashedApiToken::from_str(token)
            .change_context(AuthenticationError::malformed_credential())?;
        self.verify_token(&token)
            .await
            .attach_with(|| format!("API token {}", token.token_id()))
    }

    async fn verify_token(
        &self,
        token: &HashedApiToken,
    ) -> Result<UserId, Report<AuthenticationError>> {
        let Some(issuer) = &self.issuer else {
            return Err(Report::new(AuthenticationError::unverifiable_api_token())
                .attach("API tokens are not configured"));
        };
        if token.environment() != issuer.environment() {
            return Err(Report::new(
                AuthenticationError::api_token_other_environment(),
            ));
        }

        self.authenticator
            .authenticate_api_token(token.token_id(), |credential| {
                issuer.verify(token, credential)
            })
            .await
            .map_err(|report| {
                let error = authentication_error(report.current_context());
                report.change_context(error)
            })
    }
}

impl<C, A> AuthenticationProvider<C> for ApiTokenProvider<A>
where
    C: Caller,
    A: AuthenticateApiToken,
{
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Arc<Report<AuthenticationError>>>> {
        match presented_api_token(headers) {
            None => ControlFlow::Continue(()),
            Some(PresentedApiToken::NonBearer) => ControlFlow::Break(Err(Arc::new(Report::new(
                AuthenticationError::non_bearer_api_token(),
            )))),
            Some(PresentedApiToken::Bearer(token)) => ControlFlow::Break(
                self.authenticate_token(token)
                    .await
                    .map(|user_id| C::from_actor(ActorId::User(user_id)))
                    .map_err(Arc::new),
            ),
        }
    }
}

/// Rejects every API token without verifying it.
///
/// Recognizes the same credentials as [`ApiTokenProvider`] and answers them with
/// [`ApiTokenNotAccepted`]; other requests pass on.
///
/// [`ApiTokenNotAccepted`]: hash_middleware::authentication::request::AuthenticationErrorKind::ApiTokenNotAccepted
pub struct ApiTokenRejection;

impl<C> AuthenticationProvider<C> for ApiTokenRejection
where
    C: Caller,
{
    fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> impl Future<Output = ControlFlow<Result<C, Arc<Report<AuthenticationError>>>>> + Send {
        core::future::ready(match presented_api_token(headers) {
            Some(_) => ControlFlow::Break(Err(Arc::new(Report::new(
                AuthenticationError::api_token_not_accepted(),
            )))),
            None => ControlFlow::Continue(()),
        })
    }
}

#[cfg(test)]
mod tests {
    use alloc::sync::Arc;
    use core::sync::atomic::{AtomicUsize, Ordering};

    use error_stack::Report;
    use hash_graph_store::api_token::{
        ApiTokenAuthenticationError, ApiTokenCredential, ApiTokenEncryptionKeyId, ApiTokenId,
        ApiTokenName, ApiTokenVerificationError,
    };
    use hash_middleware::authentication::{
        provider::{AuthenticationProvider, expect_rejection},
        request::{AuthenticationError, AuthenticationErrorKind},
    };
    use http::{HeaderMap, HeaderValue, header::AUTHORIZATION};
    use rstest::rstest;
    use type_system::principal::actor::{ActorId, UserId};
    use uuid::Uuid;

    use super::{ApiTokenProvider, AuthenticateApiToken, PresentedApiToken, presented_api_token};
    use crate::api_token::{ApiTokenEncryptionKey, ApiTokenIssuer, Environment, HashedApiToken};

    /// Answers every lookup with [`Invalid`] and counts the lookups.
    ///
    /// [`Invalid`]: ApiTokenAuthenticationError::Invalid
    #[derive(Default)]
    struct NoTokens {
        lookups: AtomicUsize,
    }

    impl AuthenticateApiToken for NoTokens {
        fn authenticate_api_token<F>(
            &self,
            _token_id: ApiTokenId,
            _verify: F,
        ) -> impl Future<Output = Result<UserId, Report<ApiTokenAuthenticationError>>> + Send
        where
            F: FnOnce(&ApiTokenCredential) -> Result<(), ApiTokenVerificationError> + Send,
        {
            self.lookups.fetch_add(1, Ordering::Relaxed);
            core::future::ready(Err(Report::new(ApiTokenAuthenticationError::Invalid)))
        }
    }

    fn issuer(environment: Environment) -> Arc<ApiTokenIssuer> {
        Arc::new(ApiTokenIssuer::new(
            ApiTokenEncryptionKey::new(ApiTokenEncryptionKeyId::new(Uuid::nil()), &[7; 32]),
            environment,
        ))
    }

    /// The string of a token `issuer` issues.
    fn token(issuer: &ApiTokenIssuer) -> String {
        issuer
            .issue(
                UserId::new(Uuid::new_v4()),
                ApiTokenName::new("ci".to_owned()).expect("the name should be valid"),
                None,
            )
            .expect("the random number generator should provide bytes")
            .token
            .expose()
    }

    fn authorization(credentials: &str) -> HeaderMap {
        HeaderMap::from_iter([(
            AUTHORIZATION,
            HeaderValue::from_str(credentials).expect("the header value should be valid"),
        )])
    }

    /// Authenticates `credentials` with `provider`, and returns the rejection and whether the
    /// token was looked up.
    async fn reject(
        provider: &ApiTokenProvider<NoTokens>,
        credentials: &str,
    ) -> (Arc<Report<AuthenticationError>>, bool) {
        let report = expect_rejection(
            AuthenticationProvider::<ActorId>::authenticate(provider, &authorization(credentials))
                .await,
        );
        (
            report,
            provider.authenticator.lookups.load(Ordering::Relaxed) > 0,
        )
    }

    /// Whether `report` carries the token ID of `token`.
    fn names_token(report: &Report<AuthenticationError>, token: &str) -> bool {
        let token_id = token
            .parse::<HashedApiToken>()
            .expect("the token should parse")
            .token_id();
        format!("{report:?}").contains(&token_id.to_string())
    }

    #[rstest]
    #[case::bearer("Bearer hsh_token", Some(PresentedApiToken::Bearer("hsh_token")))]
    #[case::bearer_lowercase("bearer hsh_token", Some(PresentedApiToken::Bearer("hsh_token")))]
    #[case::bearer_padded(" Bearer  hsh_token ", Some(PresentedApiToken::Bearer("hsh_token")))]
    #[case::other_scheme("Basic hsh_token", Some(PresentedApiToken::NonBearer))]
    #[case::no_scheme("hsh_token", Some(PresentedApiToken::NonBearer))]
    #[case::no_scheme_trailing("hsh_token x", Some(PresentedApiToken::NonBearer))]
    #[case::other_no_scheme("eyJhbGciOiJIUzI1NiJ9", None)]
    #[case::other_bearer("Bearer eyJhbGciOiJIUzI1NiJ9", None)]
    #[case::other_credentials("Basic dXNlcjpwYXNz", None)]
    #[case::service_credential("HASH-Service secret", None)]
    fn presented(#[case] credentials: &str, #[case] expected: Option<PresentedApiToken<'_>>) {
        assert_eq!(
            presented_api_token(&authorization(credentials)),
            expected,
            "`{credentials}` should be recognized as {expected:?}"
        );
    }

    #[rstest]
    #[case::malformed(
        |token: &str| {
            let mut token = token.to_owned();
            token.pop();
            format!("Bearer {token}")
        },
        AuthenticationErrorKind::MalformedCredential
    )]
    #[case::no_scheme(|token: &str| token.to_owned(), AuthenticationErrorKind::NonBearerApiToken)]
    #[tokio::test]
    async fn authenticate_without_lookup(
        #[case] credentials: fn(&str) -> String,
        #[case] expected: AuthenticationErrorKind,
    ) {
        let issuer = issuer(Environment::Local);
        let provider = ApiTokenProvider::new(NoTokens::default(), Some(Arc::clone(&issuer)));

        let (report, looked_up) = reject(&provider, &credentials(&token(&issuer))).await;

        assert_eq!(
            report.current_context().kind(),
            &expected,
            "the token should be rejected as {expected:?}"
        );
        assert!(!looked_up, "the token should not be looked up");
    }

    #[tokio::test]
    async fn authenticate_other_environment() {
        let provider =
            ApiTokenProvider::new(NoTokens::default(), Some(issuer(Environment::Production)));

        let token = token(&issuer(Environment::Staging));

        let (report, looked_up) = reject(&provider, &format!("Bearer {token}")).await;

        assert_eq!(
            report.current_context().kind(),
            &AuthenticationErrorKind::ApiTokenOtherEnvironment,
            "a token of another environment should be rejected as such"
        );
        assert!(
            !looked_up,
            "a token of another environment should not be looked up"
        );
        assert!(
            names_token(&report, &token),
            "the rejection should name the token ID"
        );
    }

    #[tokio::test]
    async fn authenticate_unconfigured() {
        let provider = ApiTokenProvider::new(NoTokens::default(), None);

        let token = token(&issuer(Environment::Local));

        let (report, looked_up) = reject(&provider, &format!("Bearer {token}")).await;

        assert_eq!(
            report.current_context().kind(),
            &AuthenticationErrorKind::UnverifiableApiToken,
            "a token should be unverifiable without an issuer"
        );
        assert!(
            !looked_up,
            "a token should not be looked up without an issuer"
        );
        assert!(
            names_token(&report, &token),
            "the rejection should name the token ID"
        );
    }

    #[tokio::test]
    async fn authenticate_unknown() {
        let issuer = issuer(Environment::Local);
        let provider = ApiTokenProvider::new(NoTokens::default(), Some(Arc::clone(&issuer)));
        let token = token(&issuer);

        let (report, looked_up) = reject(&provider, &format!("Bearer {token}")).await;

        assert_eq!(
            report.current_context().kind(),
            &AuthenticationErrorKind::InvalidApiToken,
            "an unknown token should be invalid"
        );
        assert!(looked_up, "a well-formed token should be looked up");
        assert!(
            names_token(&report, &token),
            "the rejection should name the token ID"
        );
    }
}
