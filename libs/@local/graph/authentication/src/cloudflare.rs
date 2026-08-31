//! Cloudflare Access implementation of [`AuthenticationProvider`].

use core::ops::ControlFlow;

use error_stack::Report;
use hash_middleware::authentication::{
    provider::{AuthenticationProvider, Caller},
    request::AuthenticationError,
};
use http::HeaderMap;
use type_system::principal::actor::{ActorId, UserId};

use crate::jwt::{JwtError, JwtValidator};

/// Name of the header carrying the Cloudflare Access JWT.
///
/// Cloudflare also sets a plain `Cf-Access-Authenticated-User-Email` header. That one carries no
/// signature and must never be consulted.
pub const ACCESS_JWT_HEADER: &str = "Cf-Access-Jwt-Assertion";

/// Resolves a verified email address to the user actor it belongs to.
pub trait ResolveEmailActor: Send + Sync {
    /// Returns the [`UserId`] for the given email address.
    ///
    /// # Errors
    ///
    /// - [`IdentityWithoutActor`] if no identity with this verified email exists
    /// - [`NotProvisioned`] if the identity has no Graph actor provisioned
    /// - [`ActorNotFound`], [`NotAUser`], or [`StoreError`] from actor validation
    ///
    /// [`IdentityWithoutActor`]: hash_middleware::authentication::request::AuthenticationErrorKind::IdentityWithoutActor
    /// [`NotProvisioned`]: hash_middleware::authentication::request::AuthenticationErrorKind::NotProvisioned
    /// [`ActorNotFound`]: hash_middleware::authentication::request::AuthenticationErrorKind::ActorNotFound
    /// [`NotAUser`]: hash_middleware::authentication::request::AuthenticationErrorKind::NotAUser
    /// [`StoreError`]: hash_middleware::authentication::request::AuthenticationErrorKind::StoreError
    fn resolve_email_actor(
        &self,
        email: &str,
    ) -> impl Future<Output = Result<UserId, Report<AuthenticationError>>> + Send;
}

/// Authenticates Cloudflare Access JWTs and maps them to Graph actors.
///
/// The JWT is validated against the Access team's JWKS. The actor is resolved from the token's
/// email claim, which Cloudflare asserts after authenticating the user against the identity
/// provider.
pub struct CloudflareAccessProvider<R> {
    jwt_validator: JwtValidator,
    email_resolver: R,
}

impl<R> CloudflareAccessProvider<R> {
    #[must_use]
    pub const fn new(jwt_validator: JwtValidator, email_resolver: R) -> Self {
        Self {
            jwt_validator,
            email_resolver,
        }
    }
}

impl<R> CloudflareAccessProvider<R>
where
    R: ResolveEmailActor,
{
    /// Validates the token and resolves the claimed email to an actor.
    #[tracing::instrument(level = "debug", skip_all)]
    async fn verify_token(&self, token: &str) -> Result<UserId, Report<AuthenticationError>> {
        let claims = self.jwt_validator.validate(token).await.map_err(|report| {
            match report.current_context() {
                JwtError::JwksFetch => {
                    report.change_context(AuthenticationError::provider_unreachable())
                }
                // The provider named a key it cannot supply a usable entry for, so every token
                // signed with it fails. Reporting that as a bad token would answer 401 at debug
                // level and hide an outage behind "your token is invalid".
                JwtError::UnusableKey { .. } => {
                    report.change_context(AuthenticationError::invalid_provider_response())
                }
                JwtError::Validation | JwtError::MissingKeyId | JwtError::UnknownKeyId { .. } => {
                    report.change_context(AuthenticationError::invalid_access_token())
                }
            }
        })?;

        let Some(email) = claims.email else {
            return Err(Report::new(AuthenticationError::invalid_access_token())
                .attach("the token carries no email claim"));
        };

        self.email_resolver.resolve_email_actor(&email).await
    }
}

impl<C, R> AuthenticationProvider<C> for CloudflareAccessProvider<R>
where
    C: Caller,
    R: ResolveEmailActor,
{
    async fn authenticate(
        &self,
        headers: &HeaderMap,
    ) -> ControlFlow<Result<C, Report<AuthenticationError>>> {
        let Some(token) = headers.get(ACCESS_JWT_HEADER) else {
            return ControlFlow::Continue(());
        };

        let Ok(token) = token.to_str() else {
            return ControlFlow::Break(Err(Report::new(
                AuthenticationError::malformed_credential(),
            )));
        };

        ControlFlow::Break(
            self.verify_token(token)
                .await
                .map(|user_id| C::from_actor(ActorId::User(user_id))),
        )
    }
}

#[cfg(test)]
mod tests {
    use core::{assert_matches, net::SocketAddr, ops::ControlFlow, time::Duration};
    use std::{
        collections::HashMap,
        time::{SystemTime, UNIX_EPOCH},
    };

    use axum::{Json, Router, routing::get};
    use error_stack::Report;
    use hash_middleware::authentication::{
        provider::{AuthenticationProvider as _, expect_rejection},
        request::{AuthenticationError, AuthenticationErrorKind},
    };
    use http::{HeaderMap, HeaderValue, StatusCode};
    use jsonwebtoken::{Algorithm, EncodingKey, Header};
    use reqwest::Url;
    use rstest::rstest;
    use serde_json::{Value as JsonValue, json};
    use type_system::principal::actor::{ActorEntityUuid, ActorId, UserId};
    use uuid::Uuid;

    use super::{ACCESS_JWT_HEADER, CloudflareAccessProvider, ResolveEmailActor};
    use crate::jwt::{JwtValidator, JwtValidatorConfig};

    const KEY_ID: &str = "jwt-test-key";
    const AUDIENCE: &str = "test-audience";
    const ISSUER: &str = "https://test-team.cloudflareaccess.com";
    const EMAIL: &str = "user@example.com";

    /// Throwaway RSA key generated for these tests. Not a secret.
    const TEST_KEY_PEM: &str = "-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC3ki7MqC3yWg7/
JyxAFG7sisKixCG+BsYyFH6UU8Q1viV3LhetG64FzUEupHmyoYoN34sqMsobz1rt
ApSisjYJB5FQU3eBbcG8yY2dk2MMzGYRnSFW9LcvehwqX/wcYl8Iy2AXaZoCDKr2
Z82e5cM2q8ocnLR2WEZM3q/2c9E65DNsoWyHE3U9RMHxz21Ntf7cSked/BjHf/F4
OeXoUXwHk4WbTkJAZQX9UnD8sbxnTDyu+R5QLM2HskY5qU0bQaDK+JQ/IOXLfaC3
0PklwmUbPV3HpDKNnjvZUkpXtF2D4T4es/52LWwp8FNegFhhHZihn56uW43y1S55
jSjQCiPvAgMBAAECggEAFk/Es2g/iWTLzNRYiwNQxhxJctoO1ddh8IVQKzwRLY0K
ZbVq+EXUfW0InqAsEHuU2YHRmtPof7/Qp9z37txlN+y9CzvR2x/Ze9Ytibj3wX74
auyjuDtvJmybjsTy0gpczadWaxIRP22FvAQ62DTJ6NOxcY/UWUv6Y25via9i/1q3
eO/ZsdZMHUYgxpMoznc8agnv9+O4zOX1D9cv93hSWEus39y8m8+pdjmw9Rj7B5/g
+Gt45rHONex3gtTf8eoT5v88rNOFiWnUuf9vWjdQPXWrAodGEP4jFKwh9K3OkI5y
KivZrjvq59mJXXnYiDlEhj8SXXmtEKbU1IDtN9Vi8QKBgQDZIZFc7mIvVkhEfXcy
uhDbBxkFlYlS+8ykoxZ9Mwg3llJOnY/pddauTnbLDTSmnXa/J+mKcW2UqyV2pVeC
Hlcf3Sui24Gj/zv1cLTgaHoWGiycgWAoiPc4jL+QH+SXXABB5F35s5OPhhy+7zJI
mJFSVtJ1OXHQQj2DQLzupg9fHwKBgQDYbql0R9kcQ7LHUYpmppsBDMwFaLq9rUXe
lm2K+pmSU5cVa9SrBCv9WFYCkNOMxzez7bq8yxJNrhJpwTRoy5UiIjruhtsSRFi9
dSi/fFM0eyWZC/UONCWOZq3M0PWsdyHdsUOwM2eDJDS6V4P9bhWQDME4B7BO2W2J
JO1rAZwxMQKBgDjjraVuo/UJI0gmo1t8Grx4YJrw8hj29khQnqzQ+R8vWINWjwU5
JbVnw4IyBJB/A0TUXUEztOVV7ivm6EWkU2l61lsGLjJcxkXpcMq3NP2jf/rFfv8/
255KakqFwKvTpBGfluu8nDXnipKQM1mH99NeAihKk8JgCKPiC15vzek7AoGBAKt9
Q5d3NnhGy+lSmq8rY7Y5RY8jpJOWL75mwvVUC0r+IMBAaIn5DEH5NG1kA7uQPnq6
6zOcVCxouP5CsBw48znQlZFaGUsoDIhRxK+0+tiimu/hoZJXj0p94Uhgacj1vEfE
pTWABYzLq1va7CJqj3tMH+0dan2PmlMIh3Y6GGCBAoGAWtABDgTQuPUImnl91Nlh
Idn5/wsFllR/sEwyhSlL8FUD8q6ldLsUlDb5ntqoP8ojgae8GLDaF2qEWXxb4Xsb
2vlmkxSN1dYpdM+YeUDb0EKeRo7nX3yMmzkMD5ucTR6xW/pKezNK6yq0kAU6JUdF
i3YB+IEvO6Qr8c5tSNv9NB0=
-----END PRIVATE KEY-----";

    /// Public modulus of [`TEST_KEY_PEM`], base64url-encoded for the JWKS.
    const TEST_KEY_MODULUS: &str = "t5IuzKgt8loO_ycsQBRu7IrCosQhvgbGMhR-lFPENb4ldy4XrRuuBc1BLqR5sqGKDd-LKjLKG89a7QKUorI2CQeRUFN3gW3BvMmNnZNjDMxmEZ0hVvS3L3ocKl_8HGJfCMtgF2maAgyq9mfNnuXDNqvKHJy0dlhGTN6v9nPROuQzbKFshxN1PUTB8c9tTbX-3EpHnfwYx3_xeDnl6FF8B5OFm05CQGUF_VJw_LG8Z0w8rvkeUCzNh7JGOalNG0GgyviUPyDly32gt9D5JcJlGz1dx6QyjZ472VJKV7Rdg-E-HrP-di1sKfBTXoBYYR2YoZ-erluN8tUueY0o0Aoj7w";

    /// Resolves emails from a fixed map.
    struct FixedEmailResolver {
        actors: HashMap<String, UserId>,
    }

    impl ResolveEmailActor for FixedEmailResolver {
        fn resolve_email_actor(
            &self,
            email: &str,
        ) -> impl Future<Output = Result<UserId, Report<AuthenticationError>>> + Send {
            core::future::ready(
                self.actors
                    .get(email)
                    .copied()
                    .ok_or_else(|| Report::new(AuthenticationError::identity_without_actor())),
            )
        }
    }

    /// Binds a fake JWKS endpoint on an ephemeral port and returns its URL.
    async fn spawn_fake_jwks(response: (StatusCode, JsonValue)) -> Url {
        let router = Router::new().route(
            "/jwks",
            get(move || {
                let response = response.clone();
                async move { (response.0, Json(response.1)) }
            }),
        );
        let listener = tokio::net::TcpListener::bind(("127.0.0.1", 0))
            .await
            .expect("the test server should bind to an ephemeral port");
        let address = listener
            .local_addr()
            .expect("the test listener should report its local address");
        tokio::spawn(async move {
            axum::serve(
                listener,
                router.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .await
            .expect("the test server should serve requests");
        });

        Url::parse(&format!("http://{address}/jwks"))
            .expect("the test server address should parse as a URL")
    }

    fn jwks_json() -> JsonValue {
        json!({
            "keys": [{
                "kty": "RSA",
                "kid": KEY_ID,
                "use": "sig",
                "alg": "RS256",
                "n": TEST_KEY_MODULUS,
                "e": "AQAB",
            }]
        })
    }

    fn validator_at(jwks_url: Url) -> JwtValidator {
        JwtValidator::new(JwtValidatorConfig {
            jwks_url,
            audience: AUDIENCE.to_owned(),
            issuer: ISSUER.to_owned(),
            jwks_cache_ttl: Duration::from_secs(60),
            jwks_refresh_cooldown: Duration::ZERO,
            http_timeout: Duration::from_secs(5),
            allowed_algorithms: vec![Algorithm::RS256],
        })
    }

    /// Spawns a fake JWKS endpoint serving the test key and returns a provider pointed at it.
    async fn provider_for(
        actors: HashMap<String, UserId>,
    ) -> CloudflareAccessProvider<FixedEmailResolver> {
        let jwks_url = spawn_fake_jwks((StatusCode::OK, jwks_json())).await;
        CloudflareAccessProvider::new(validator_at(jwks_url), FixedEmailResolver { actors })
    }

    fn known_user(email: &str) -> (HashMap<String, UserId>, ActorEntityUuid) {
        let actor_id = ActorEntityUuid::new(Uuid::new_v4());
        (
            HashMap::from([(email.to_owned(), UserId::new(actor_id))]),
            actor_id,
        )
    }

    fn valid_claims(email: &str) -> JsonValue {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("the current time should be after the Unix epoch")
            .as_secs();
        json!({
            "sub": "test-subject",
            "email": email,
            "aud": AUDIENCE,
            "iss": ISSUER,
            "iat": now,
            "exp": now + 600,
        })
    }

    fn sign(header: &Header, claims: &JsonValue) -> String {
        jsonwebtoken::encode(
            header,
            claims,
            &EncodingKey::from_rsa_pem(TEST_KEY_PEM.as_bytes())
                .expect("the test key should parse as an RSA PEM"),
        )
        .expect("the token should encode")
    }

    fn mint_token(claims: &JsonValue) -> String {
        let mut header = Header::new(Algorithm::RS256);
        header.kid = Some(KEY_ID.to_owned());
        sign(&header, claims)
    }

    fn access_token_header(token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            ACCESS_JWT_HEADER,
            token
                .parse()
                .expect("the token should be a valid header value"),
        );
        headers
    }

    #[tokio::test]
    async fn valid_token_resolves_actor() {
        let (actors, actor_id) = known_user(EMAIL);
        let provider = provider_for(actors).await;

        let authentication: ControlFlow<Result<ActorId, _>> = provider
            .authenticate(&access_token_header(&mint_token(&valid_claims(EMAIL))))
            .await;

        assert!(
            matches!(
                authentication,
                ControlFlow::Break(Ok(ActorId::User(user_id)))
                    if ActorEntityUuid::new(user_id) == actor_id
            ),
            "a valid token should verify to the actor resolved from its email claim"
        );
    }

    #[tokio::test]
    async fn request_without_access_token_carries_no_credential() {
        let provider = provider_for(HashMap::new()).await;

        let decision: ControlFlow<Result<ActorId, _>> =
            provider.authenticate(&HeaderMap::new()).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "a request without an Access token should not be recognized"
        );
    }

    #[tokio::test]
    async fn non_ascii_access_token_fails_authentication() {
        let provider = provider_for(HashMap::new()).await;

        let mut headers = HeaderMap::new();
        headers.insert(
            ACCESS_JWT_HEADER,
            HeaderValue::from_bytes(b"caf\xc3\xa9")
                .expect("the token should be a valid header value"),
        );

        let report = expect_rejection::<ActorId>(provider.authenticate(&headers).await);
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::MalformedCredential,
            "a non-ASCII Access token should be rejected as malformed, not ignored"
        );
    }

    /// Each case rewrites one claim of an otherwise valid token.
    ///
    /// `not_yet_valid` needs `validate_nbf`, which is off in `jsonwebtoken`'s defaults.
    #[rstest]
    #[case::expired("exp", json!(1))]
    #[case::not_yet_valid("nbf", json!(u64::MAX >> 8))]
    #[case::wrong_audience("aud", json!("other-audience"))]
    #[case::wrong_issuer("iss", json!("https://other-team.cloudflareaccess.com"))]
    // A claim of the wrong type is neither compared nor rejected on its own: it parses as absent.
    #[case::audience_not_a_string("aud", json!(42))]
    #[case::issuer_not_a_string("iss", json!(42))]
    #[case::email_not_a_string("email", json!(42))]
    #[tokio::test]
    async fn token_with_invalid_claim_fails_authentication(
        #[case] claim: &str,
        #[case] value: JsonValue,
    ) {
        let (actors, _) = known_user(EMAIL);
        let provider = provider_for(actors).await;

        let mut claims = valid_claims(EMAIL);
        claims[claim] = value;

        let report = expect_rejection::<ActorId>(
            provider
                .authenticate(&access_token_header(&mint_token(&claims)))
                .await,
        );
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::InvalidAccessToken,
            "the token should fail authentication"
        );
    }

    #[tokio::test]
    async fn token_with_disallowed_algorithm_fails_authentication() {
        let (actors, _) = known_user(EMAIL);
        let provider = provider_for(actors).await;

        // A token re-signed with a symmetric algorithm must fail the algorithm check before any
        // key resolution, closing the classic RS256-to-HS256 confusion attack.
        let mut header = Header::new(Algorithm::HS256);
        header.kid = Some(KEY_ID.to_owned());
        let token = jsonwebtoken::encode(
            &header,
            &valid_claims(EMAIL),
            &EncodingKey::from_secret(b"attacker-chosen-secret"),
        )
        .expect("the token should encode");

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&access_token_header(&token)).await);
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::InvalidAccessToken,
            "a token signed with a disallowed algorithm should fail authentication"
        );
    }

    #[tokio::test]
    async fn token_with_forged_signature_fails_authentication() {
        let (actors, _) = known_user(EMAIL);
        let provider = provider_for(actors).await;

        let victim_token = mint_token(&valid_claims("victim@example.com"));
        let target_token = mint_token(&valid_claims(EMAIL));
        let (_, victim_signature) = victim_token
            .rsplit_once('.')
            .expect("the token should contain a signature segment");
        let (target_message, _) = target_token
            .rsplit_once('.')
            .expect("the token should contain a signature segment");
        let forged = format!("{target_message}.{victim_signature}");

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&access_token_header(&forged)).await);
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::InvalidAccessToken,
            "a token with a signature from another token should fail authentication"
        );
    }

    /// A claim that is absent must fail, not just one that is wrong.
    ///
    /// `set_audience` and `set_issuer` compare only a claim that is present, so an omitted `aud`
    /// would verify unless it is also required — and `aud` is what scopes a token to this
    /// application among all applications signed by the same Cloudflare Access team.
    #[rstest]
    #[case::without_audience("aud")]
    #[case::without_issuer("iss")]
    #[case::without_expiry("exp")]
    #[tokio::test]
    async fn token_without_required_claim_fails_authentication(#[case] claim: &str) {
        let (actors, _) = known_user(EMAIL);
        let provider = provider_for(actors).await;

        let mut claims = valid_claims(EMAIL);
        claims
            .as_object_mut()
            .expect("the claims should be a JSON object")
            .remove(claim);

        let report = expect_rejection::<ActorId>(
            provider
                .authenticate(&access_token_header(&mint_token(&claims)))
                .await,
        );
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::InvalidAccessToken,
            "a token without `{claim}` should fail authentication"
        );
    }

    /// Cloudflare also sets an unsigned `Cf-Access-Authenticated-User-Email`. Honouring it would
    /// let a client name any address, so the provider must not recognize it at all.
    #[tokio::test]
    async fn unsigned_email_header_carries_no_credential() {
        let (actors, _) = known_user(EMAIL);
        let provider = provider_for(actors).await;

        let mut headers = HeaderMap::new();
        headers.insert(
            "Cf-Access-Authenticated-User-Email",
            EMAIL
                .parse()
                .expect("the email should be a valid header value"),
        );

        let decision: ControlFlow<Result<ActorId, _>> = provider.authenticate(&headers).await;
        assert!(
            matches!(decision, ControlFlow::Continue(())),
            "the unsigned email header should not be recognized as a credential"
        );
    }

    #[tokio::test]
    async fn token_without_email_claim_fails_authentication() {
        let (actors, _) = known_user(EMAIL);
        let provider = provider_for(actors).await;

        let mut claims = valid_claims(EMAIL);
        claims
            .as_object_mut()
            .expect("the claims should be a JSON object")
            .remove("email");

        let report = expect_rejection::<ActorId>(
            provider
                .authenticate(&access_token_header(&mint_token(&claims)))
                .await,
        );
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::InvalidAccessToken,
            "a token without an email claim should fail authentication"
        );
    }

    #[tokio::test]
    async fn token_with_unknown_email_fails_authentication() {
        let provider = provider_for(HashMap::new()).await;

        let report = expect_rejection::<ActorId>(
            provider
                .authenticate(&access_token_header(&mint_token(&valid_claims(EMAIL))))
                .await,
        );
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::IdentityWithoutActor,
            "a resolver failure should surface as the resolver's rejection"
        );
    }

    /// Each case names a key the JWKS cannot supply a verification key for.
    #[rstest]
    #[case::without_key_id(None)]
    #[case::rotated_away_key_id(Some("rotated-away-key"))]
    #[tokio::test]
    async fn token_with_unresolvable_key_fails_authentication(#[case] key_id: Option<&str>) {
        let (actors, _) = known_user(EMAIL);
        let provider = provider_for(actors).await;

        let mut header = Header::new(Algorithm::RS256);
        header.kid = key_id.map(str::to_owned);
        let token = sign(&header, &valid_claims(EMAIL));

        let report =
            expect_rejection::<ActorId>(provider.authenticate(&access_token_header(&token)).await);
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::InvalidAccessToken,
            "the token should fail authentication"
        );
    }

    #[tokio::test]
    async fn failing_jwks_endpoint_fails_verification() {
        let jwks_url =
            spawn_fake_jwks((StatusCode::INTERNAL_SERVER_ERROR, json!({"error": "down"}))).await;
        let provider = CloudflareAccessProvider::new(
            validator_at(jwks_url),
            FixedEmailResolver {
                actors: HashMap::new(),
            },
        );

        let report = expect_rejection::<ActorId>(
            provider
                .authenticate(&access_token_header(&mint_token(&valid_claims(EMAIL))))
                .await,
        );
        assert_matches!(
            report.current_context().kind,
            AuthenticationErrorKind::ProviderUnreachable,
            "a failing JWKS endpoint should fail as provider unavailability, not as a bad token"
        );
    }
}
