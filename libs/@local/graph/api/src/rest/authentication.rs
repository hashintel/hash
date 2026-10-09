//! Authentication providers shared by the Graph HTTP APIs.
//!
//! Only the first credential found in a request is checked. The providers look for an API token
//! first, then for a service delegation, then for a Kratos session, and last for a Cloudflare
//! Access JWT. The public APIs accept API tokens and no sessions. Every other API rejects a request
//! that carries an API token.

use alloc::sync::Arc;

use hash_graph_authentication::{
    actor::StorePoolActorResolver,
    api_token::{
        ApiTokenIssuer, ApiTokenProvider, ApiTokenRejection, StorePoolApiTokenAuthenticator,
    },
    delegation::ServiceDelegationProvider,
    kratos::{KratosEmailActorResolver, KratosSessionProvider},
};
pub use hash_graph_authentication::{
    api_token,
    cloudflare::CloudflareAccessProvider,
    jwt::{JwtValidator, JwtValidatorConfig},
    kratos::{KratosAdminConfig, KratosSessionConfig, SessionCacheConfig},
};
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_store::{api_token::ApiTokenStore, pool::StorePool};
pub use hash_middleware::authentication::{AuthenticatedActorId, AuthenticationMetrics};

/// Configuration for Cloudflare Access authentication.
#[derive(Debug, Clone)]
pub struct CloudflareAccessConfig {
    /// JWT validation parameters for the Access team.
    pub jwt: JwtValidatorConfig,
    /// Kratos admin API access for resolving token emails to actors.
    pub kratos_admin: KratosAdminConfig,
}

/// The credentials a caller presents on purpose: service delegation naming the acting actor.
pub type ExplicitProviders<S> = ServiceDelegationProvider<StorePoolActorResolver<S>>;

/// The credentials a browser carries: the Kratos session.
pub type SessionProviders<S> = KratosSessionProvider<StorePoolActorResolver<S>>;

/// The credentials the infrastructure stamps onto a request: the Cloudflare Access JWT, when
/// configured.
pub type EnvironmentProviders<S> =
    Option<CloudflareAccessProvider<KratosEmailActorResolver<StorePoolActorResolver<S>>>>;

/// Chains `api_token`, `explicit` and `environment`, consulted in that order.
pub(super) const fn public_chain<A, E, V>(
    api_token: ApiTokenProvider<A>,
    explicit: E,
    environment: V,
) -> (ApiTokenProvider<A>, (E, V)) {
    (api_token, (explicit, environment))
}

/// Chains [`ApiTokenRejection`], `explicit`, `session` and `environment`, consulted in that order.
pub(super) const fn internal_chain<E, P, V>(
    explicit: E,
    session: P,
    environment: V,
) -> (ApiTokenRejection, (E, (P, V))) {
    (ApiTokenRejection, (explicit, (session, environment)))
}

/// Builds the [`ApiTokenProvider`], which verifies tokens with `issuer`.
///
/// Without an issuer, every bearer token that parses is rejected as unverifiable.
pub fn build_api_token_provider<S>(
    issuer: Option<Arc<ApiTokenIssuer>>,
    store: &Arc<S>,
) -> ApiTokenProvider<StorePoolApiTokenAuthenticator<S>>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: ApiTokenStore,
{
    ApiTokenProvider::new(
        StorePoolApiTokenAuthenticator::new(Arc::clone(store)),
        issuer,
    )
}

/// Builds the [`ExplicitProviders`].
pub fn build_explicit_providers<S>(service_secret: String, store: &Arc<S>) -> ExplicitProviders<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    ServiceDelegationProvider::new(
        service_secret,
        StorePoolActorResolver::new(Arc::clone(store)),
    )
}

/// Builds the [`SessionProviders`].
pub fn build_session_providers<S>(
    session: KratosSessionConfig,
    store: &Arc<S>,
    meter: &opentelemetry::metrics::Meter,
) -> SessionProviders<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    KratosSessionProvider::new(
        session,
        StorePoolActorResolver::new(Arc::clone(store)),
        meter,
    )
}

/// Builds the Cloudflare Access provider of the [`EnvironmentProviders`].
///
/// The provider caches the JWKS it verifies against, so a process shares one instance between
/// its routers.
pub fn build_environment_provider<S>(
    config: CloudflareAccessConfig,
    store: &Arc<S>,
) -> CloudflareAccessProvider<KratosEmailActorResolver<StorePoolActorResolver<S>>>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    CloudflareAccessProvider::new(
        JwtValidator::new(config.jwt),
        KratosEmailActorResolver::new(
            config.kratos_admin,
            StorePoolActorResolver::new(Arc::clone(store)),
        ),
    )
}
