#[cfg(test)]
mod tests;

use alloc::sync::Arc;

use aide::{
    transform::{TransformOpenApi, TransformOperation},
    util::iter_operations_mut,
};
use axum::Router;
use hash_middleware::{
    authentication::{
        AuthenticationLayer, AuthenticationMetrics, provider::AuthenticationProvider,
    },
    rate_limit::{CallerLimitLayer, IpGateLayer, RateLimiters},
    response::{problem_response, status_problem},
};
use http::{Method, StatusCode, Uri};
use type_system::principal::actor::ActorId;

use super::{Api, Audience, legacy};

/// Documents the responses the authentication and rate-limit layers answer on every operation.
pub(super) fn document(mut document: TransformOpenApi<'_>) -> TransformOpenApi<'_> {
    if let Some(paths) = &mut document.inner_mut().paths {
        for path in paths
            .paths
            .values_mut()
            .filter_map(|path| path.as_item_mut())
        {
            for (_, operation) in iter_operations_mut(path) {
                let _: TransformOperation<'_> = TransformOperation::new(operation)
                    .with(hash_middleware::authentication::document)
                    .with(hash_middleware::rate_limit::document);
            }
        }
    }
    document
}

pub(super) struct Middleware<P, I> {
    pub public_provider: Arc<P>,
    pub internal_provider: Arc<I>,
    pub service_secret: Arc<str>,
    pub authentication_metrics: Arc<AuthenticationMetrics>,
    pub rate_limiters: Arc<RateLimiters>,
}

impl<P, I> Middleware<P, I>
where
    P: AuthenticationProvider<Option<ActorId>> + 'static,
    I: AuthenticationProvider<Option<ActorId>> + 'static,
{
    fn attach_api(&self, api: Api) -> Router {
        let Api {
            audience, router, ..
        } = api;
        match audience {
            Audience::Public => self.attach(router, &self.public_provider, |_| false),
            Audience::Internal => self.attach(router, &self.internal_provider, |_| false),
        }
    }

    /// Attaches authentication and the caller budget to the legacy routes and to each API,
    /// then puts the address gate over everything, including the documentation routes and the
    /// problem documents for an unknown path and for a method its path does not serve. The legacy
    /// routes and every API draw on the same budgets.
    ///
    /// # Panics
    ///
    /// Panics if the routes of two groups overlap.
    pub(super) fn assemble(
        &self,
        legacy_routes: Router,
        apis: impl IntoIterator<Item = Api>,
        documentation: Router,
    ) -> Router {
        let mut router = self.attach(
            legacy_routes,
            &self.internal_provider,
            legacy::is_bootstrap_route,
        );
        for api in apis {
            router = router.merge(self.attach_api(api));
        }
        // The method-not-allowed fallback applies to the routes merged before it, and axum adds
        // the `Allow` header to its response. The operations do not document it: an operation is
        // one method of one path.
        router
            .merge(documentation)
            .method_not_allowed_fallback(|method: Method, uri: Uri| async move {
                tracing::debug!(%method, path = uri.path(), "route does not serve the method");
                problem_response(&status_problem(StatusCode::METHOD_NOT_ALLOWED))
            })
            .fallback(|method: Method, uri: Uri| async move {
                tracing::debug!(%method, path = uri.path(), "no route matched");
                problem_response(&status_problem(StatusCode::NOT_FOUND))
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
        bootstrap_route: fn(&str) -> bool,
    ) -> Router
    where
        A: AuthenticationProvider<Option<ActorId>> + 'static,
    {
        // `route_layer` panics on a router without routes.
        if !routes.has_routes() {
            return routes;
        }

        // Authentication runs before the caller limiter; route layers skip unmatched paths.
        routes
            .route_layer(CallerLimitLayer {
                limiters: Arc::clone(&self.rate_limiters),
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
