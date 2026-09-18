//! Authentication providers shared by the Graph HTTP APIs.

use alloc::sync::Arc;

use hash_graph_authentication::{
    actor::StorePoolActorResolver,
    delegation::ServiceDelegationProvider,
    kratos::{KratosEmailActorResolver, KratosSessionProvider},
};
pub use hash_graph_authentication::{
    cloudflare::CloudflareAccessProvider,
    jwt::{JwtValidator, JwtValidatorConfig},
    kratos::{KratosAdminConfig, KratosSessionConfig, SessionCacheConfig},
};
use hash_graph_authorization::policies::store::PrincipalStore;
use hash_graph_store::pool::StorePool;
pub use hash_middleware::authentication::{AuthenticatedActorId, AuthenticationMetrics};

/// Configuration for Cloudflare Access authentication.
#[derive(Debug, Clone)]
pub struct CloudflareAccessConfig {
    /// JWT validation parameters for the Access team.
    pub jwt: JwtValidatorConfig,
    /// Kratos admin API access for resolving token emails to actors.
    pub kratos_admin: KratosAdminConfig,
}

/// The operator-facing provider chain: Cloudflare Access JWT (when configured), then service
/// delegation.
pub type OperatorChain<S> = (
    Option<CloudflareAccessProvider<KratosEmailActorResolver<StorePoolActorResolver<S>>>>,
    ServiceDelegationProvider<StorePoolActorResolver<S>>,
);

/// The session and operator provider chain for the internal and legacy APIs.
pub type ProviderChain<S> = (
    KratosSessionProvider<StorePoolActorResolver<S>>,
    OperatorChain<S>,
);

/// Builds the provider chain for public and admin APIs: Cloudflare Access JWT (when configured),
/// then service delegation.
pub fn build_operator_provider<S>(
    cloudflare_access: Option<CloudflareAccessConfig>,
    service_secret: String,
    store: &Arc<S>,
) -> OperatorChain<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    (
        cloudflare_access.map(|config| {
            CloudflareAccessProvider::new(
                JwtValidator::new(config.jwt),
                KratosEmailActorResolver::new(
                    config.kratos_admin,
                    StorePoolActorResolver::new(Arc::clone(store)),
                ),
            )
        }),
        ServiceDelegationProvider::new(
            service_secret,
            StorePoolActorResolver::new(Arc::clone(store)),
        ),
    )
}

/// Builds the chain for internal and legacy APIs: Kratos session, then the operator
/// credentials.
pub fn build_authentication_provider<S>(
    session: KratosSessionConfig,
    cloudflare_access: Option<CloudflareAccessConfig>,
    service_secret: String,
    store: &Arc<S>,
    meter: &opentelemetry::metrics::Meter,
) -> ProviderChain<S>
where
    S: StorePool + Send + Sync,
    for<'p> S::Store<'p>: PrincipalStore,
{
    (
        KratosSessionProvider::new(
            session,
            StorePoolActorResolver::new(Arc::clone(store)),
            meter,
        ),
        build_operator_provider(cloudflare_access, service_secret, store),
    )
}
