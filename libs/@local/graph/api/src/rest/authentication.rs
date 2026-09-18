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

/// The providers every API accepts: Cloudflare Access JWT (when configured), then service
/// delegation.
pub type SharedProviders<S> = (
    Option<CloudflareAccessProvider<KratosEmailActorResolver<StorePoolActorResolver<S>>>>,
    ServiceDelegationProvider<StorePoolActorResolver<S>>,
);

/// The providers of the session-capable APIs: a Kratos session, then the [`SharedProviders`].
pub type SessionProviders<S> = (
    KratosSessionProvider<StorePoolActorResolver<S>>,
    Arc<SharedProviders<S>>,
);

/// Builds the [`SharedProviders`].
///
/// They resolve no Kratos end-user session.
pub fn build_shared_providers<S>(
    cloudflare_access: Option<CloudflareAccessConfig>,
    service_secret: String,
    store: &Arc<S>,
) -> SharedProviders<S>
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

/// Builds the [`SessionProviders`] around already built [`SharedProviders`].
pub fn build_session_providers<S>(
    session: KratosSessionConfig,
    shared: Arc<SharedProviders<S>>,
    store: &Arc<S>,
    meter: &opentelemetry::metrics::Meter,
) -> SessionProviders<S>
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
        shared,
    )
}
