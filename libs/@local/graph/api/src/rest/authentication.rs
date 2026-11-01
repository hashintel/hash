//! Authentication providers shared by the Graph HTTP APIs.
//!
//! Only the first credential found in a request is checked. The public APIs accept API tokens.
//! The internal APIs and Atlas accept Kratos sessions. The legacy routes accept service
//! delegation. The admin API accepts service delegation and, when configured, Cloudflare Access
//! JWTs. Every API but the public ones rejects a request that carries an API token.

use alloc::sync::Arc;
use core::pin::Pin;

use hash_crypto::Secret;
use hash_graph_authentication::{
    actor::StorePoolActorResolver,
    api_token::{ApiTokenIssuer, ApiTokenProvider, StorePoolApiTokenAuthenticator},
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
pub fn build_explicit_providers<S>(
    service_secret: Pin<Arc<Secret<str>>>,
    store: &Arc<S>,
) -> ExplicitProviders<S>
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

/// Builds the provider of the Cloudflare Access JWT the infrastructure stamps onto a request.
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
