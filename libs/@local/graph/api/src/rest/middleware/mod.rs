#[cfg(test)]
mod tests;

use alloc::sync::Arc;
use core::any::Any;

use aide::{
    transform::{TransformOpenApi, TransformOperation},
    util::iter_operations_mut,
};
use axum::{Router, response::Response};
use hash_middleware::{
    authentication::{
        AuthenticationLayer, AuthenticationMetrics, provider::AuthenticationProvider,
    },
    problem::InternalServerError,
    rate_limit::{CallerLimitLayer, IpGateLayer, RateLimiters},
    response::{problem_response, status_problem},
};
use http::{Method, StatusCode, Uri};
use problematic::{ProblemDetails, ProblemVariant as _};
use tower_http::catch_panic::CatchPanicLayer;
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

/// Answers a request with a method its route does not serve. Axum adds the `Allow` header.
pub(super) async fn method_not_allowed(method: Method, uri: Uri) -> Response {
    tracing::debug!(%method, path = uri.path(), "route does not serve the method");
    problem_response(&status_problem(StatusCode::METHOD_NOT_ALLOWED))
}

/// Answers a request whose handling panicked.
///
/// Sentry's panic hook reports the panic.
fn panicked(_panic: Box<dyn Any + Send>) -> Response {
    problem_response(
        &ProblemDetails::from(InternalServerError::TYPE)
            .with_detail(InternalServerError.to_string()),
    )
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

    /// Attaches authentication and the caller budget to the legacy routes and to each API, and puts
    /// the address gate over everything.
    ///
    /// The address gate also covers the documentation routes and the problem documents for an
    /// unknown path and for a method its path does not serve. The legacy routes and every API draw
    /// on the same budgets, and answer a method a path does not serve after authentication. A
    /// request whose handling panics is answered with [`InternalServerError`].
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
        // Axum sets the method-not-allowed fallback only on routes without one, which leaves the
        // documentation routes.
        router
            .merge(documentation)
            .method_not_allowed_fallback(method_not_allowed)
            .fallback(|method: Method, uri: Uri| async move {
                tracing::debug!(%method, path = uri.path(), "no route matched");
                problem_response(&status_problem(StatusCode::NOT_FOUND))
            })
            .layer(IpGateLayer {
                limiters: Arc::clone(&self.rate_limiters),
                service_secret: Arc::clone(&self.service_secret),
            })
            .layer(CatchPanicLayer::custom(panicked))
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

        // Authentication runs before the caller limiter; route layers skip unmatched paths. The
        // method-not-allowed fallback is set first, so the route layers wrap it too.
        routes
            .method_not_allowed_fallback(method_not_allowed)
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
