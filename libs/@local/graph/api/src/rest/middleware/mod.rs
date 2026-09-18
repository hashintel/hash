#[cfg(test)]
mod tests;

use alloc::sync::Arc;

use axum::Router;
use hash_middleware::{
    authentication::{
        AuthenticationLayer, AuthenticationMetrics, provider::AuthenticationProvider,
    },
    rate_limit::{IpGateLayer, PrincipalLimitLayer, RateLimiters},
};
use http::StatusCode;
use opentelemetry::metrics::Meter;
use type_system::principal::actor::ActorId;

use super::{Api, Audience, legacy};

pub(super) struct Middleware<P, I> {
    pub public_provider: Arc<P>,
    pub internal_provider: Arc<I>,
    pub service_secret: Arc<str>,
    pub authentication_metrics: Arc<AuthenticationMetrics>,
    pub rate_limiters: Arc<RateLimiters>,
    pub meter: Meter,
}

impl<P, I> Middleware<P, I>
where
    P: AuthenticationProvider<Option<ActorId>> + 'static,
    I: AuthenticationProvider<Option<ActorId>> + 'static,
{
    fn attach_api(&self, api: Api) -> Router {
        let rate_limiters =
            self.rate_limiters
                .with_principal_limits(&api.rate_limits, api.prefix, &self.meter);
        match api.audience {
            Audience::Public => {
                self.attach(api.router, &self.public_provider, rate_limiters, |_| false)
            }
            Audience::Internal => {
                self.attach(api.router, &self.internal_provider, rate_limiters, |_| {
                    false
                })
            }
        }
    }

    pub(super) fn assemble(
        &self,
        legacy_routes: Router,
        apis: impl IntoIterator<Item = Api>,
        documentation: Router,
    ) -> Router {
        let mut router = self.attach(
            legacy_routes,
            &self.internal_provider,
            Arc::clone(&self.rate_limiters),
            legacy::is_bootstrap_route,
        );
        for api in apis {
            router = router.merge(self.attach_api(api));
        }
        router
            .merge(documentation)
            .fallback(|| async {
                tracing::debug!("404: Not found");
                StatusCode::NOT_FOUND
            })
            .layer(IpGateLayer {
                limiters: Arc::clone(&self.rate_limiters),
                service_secret: Arc::clone(&self.service_secret),
            })
    }

    fn attach<A>(
        &self,
        routes: Router,
        provider: &Arc<A>,
        rate_limiters: Arc<RateLimiters>,
        bootstrap_route: fn(&str) -> bool,
    ) -> Router
    where
        A: AuthenticationProvider<Option<ActorId>> + 'static,
    {
        if !routes.has_routes() {
            return routes;
        }

        // Authentication runs before principal accounting; route layers exclude unmatched paths.
        routes
            .route_layer(PrincipalLimitLayer {
                limiters: rate_limiters,
                service_secret: Arc::clone(&self.service_secret),
            })
            .route_layer(AuthenticationLayer::<_, Option<ActorId>> {
                provider: Arc::clone(provider),
                service_secret: Arc::clone(&self.service_secret),
                metrics: Arc::clone(&self.authentication_metrics),
                bootstrap_route,
                caller: core::marker::PhantomData,
            })
    }
}
