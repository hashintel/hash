#[cfg(test)]
mod tests;

use alloc::sync::Arc;
use core::{any::Any, pin::Pin};

use aide::{
    openapi::{
        Header, HeaderStyle, Operation, ParameterSchemaOrContent, ReferenceOr, SchemaObject,
    },
    transform::{TransformOpenApi, TransformOperation},
    util::iter_operations_mut,
};
use axum::{Router, response::Response};
use hash_crypto::Secret;
use hash_middleware::{
    authentication::{
        AuthenticationLayer, AuthenticationMetrics, Bootstrap, Challenge,
        provider::{AuthenticationProvider, Caller},
    },
    problem::InternalServerError,
    rate_limit::{CallerLimitLayer, IpGateLayer, RateLimiters},
    response::{problem_response, status_problem},
};
use http::{HeaderValue, Method, StatusCode, Uri, header::CACHE_CONTROL};
use indexmap::IndexMap;
use problematic::{ProblemDetails, ProblemVariant as _};
use tower_http::{catch_panic::CatchPanicLayer, set_header::SetResponseHeaderLayer};
use type_system::principal::actor::ActorId;

use super::{Api, Audience, legacy};

/// The `Cache-Control` value of every response that does not set its own.
///
/// A response depends on the caller, and a shared cache neither keys it by the caller nor is kept
/// from reusing a response to an anonymous request for one carrying credentials.
const DEFAULT_CACHE_CONTROL: &str = "private, no-store";

/// Documents the responses the authentication and rate-limit layers answer on every operation of
/// an API challenging with `challenge`, and the default `Cache-Control` header and the
/// `RateLimit-Policy` and `RateLimit` fields on every response.
pub(super) fn document(
    mut document: TransformOpenApi<'_>,
    challenge: Challenge,
) -> TransformOpenApi<'_> {
    if let Some(paths) = &mut document.inner_mut().paths {
        for path in paths
            .paths
            .values_mut()
            .filter_map(|path| path.as_item_mut())
        {
            for (_, operation) in iter_operations_mut(path) {
                let _: TransformOperation<'_> = TransformOperation::new(operation)
                    .with(|operation| {
                        hash_middleware::authentication::document(operation, challenge)
                    })
                    .with(hash_middleware::rate_limit::document);
                document_cache_control(operation);
            }
        }
    }
    document
}

/// Documents [`DEFAULT_CACHE_CONTROL`] on every response of `operation` that documents no
/// `Cache-Control` header of its own.
fn document_cache_control(operation: &mut Operation) {
    let Some(responses) = &mut operation.responses else {
        return;
    };
    for response in responses
        .default
        .iter_mut()
        .chain(responses.responses.values_mut())
        .filter_map(ReferenceOr::as_item_mut)
    {
        if response
            .headers
            .keys()
            .any(|name| name.eq_ignore_ascii_case(CACHE_CONTROL.as_str()))
        {
            continue;
        }
        response.headers.insert(
            "Cache-Control".to_owned(),
            ReferenceOr::Item(Header {
                description: Some(format!(
                    "Always `{DEFAULT_CACHE_CONTROL}`: the response depends on the caller, so no \
                     cache stores it."
                )),
                style: HeaderStyle::Simple,
                required: true,
                deprecated: None,
                format: ParameterSchemaOrContent::Schema(SchemaObject {
                    json_schema: schemars::json_schema!({"type": "string"}),
                    example: None,
                    external_docs: None,
                }),
                example: Some(serde_json::Value::String(DEFAULT_CACHE_CONTROL.to_owned())),
                examples: IndexMap::new(),
                extensions: IndexMap::new(),
            }),
        );
    }
}

/// Sets [`DEFAULT_CACHE_CONTROL`] on every response that carries no `Cache-Control` of its own.
pub(super) fn default_cache_control() -> SetResponseHeaderLayer<HeaderValue> {
    SetResponseHeaderLayer::if_not_present(
        CACHE_CONTROL,
        HeaderValue::from_static(DEFAULT_CACHE_CONTROL),
    )
}

/// Answers a request with a method its path does not serve.
///
/// Axum adds the `Allow` header.
pub(super) async fn method_not_allowed(method: Method, uri: Uri) -> Response {
    tracing::debug!(%method, path = uri.path(), "path does not serve the method");
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

pub(super) struct Middleware<P, I, L> {
    pub public_provider: Arc<P>,
    pub internal_provider: Arc<I>,
    pub legacy_provider: Arc<L>,
    pub service_secret: Pin<Arc<Secret<str>>>,
    pub authentication_metrics: Arc<AuthenticationMetrics>,
    pub rate_limiters: Arc<RateLimiters>,
}

impl<P, I, L> Middleware<P, I, L>
where
    P: AuthenticationProvider<ActorId> + 'static,
    I: AuthenticationProvider<Option<ActorId>> + 'static,
    L: AuthenticationProvider<Option<ActorId>> + 'static,
{
    /// Attaches authentication and the caller budget to `api`, as its [`Audience`] requires.
    fn attach_api(&self, api: Api) -> Router {
        let Api {
            audience,
            challenge,
            router,
            ..
        } = api;
        match audience {
            Audience::Public => {
                self.attach::<ActorId>(router, &self.public_provider, None, challenge)
            }
            Audience::Internal => {
                self.attach::<Option<ActorId>>(router, &self.internal_provider, None, challenge)
            }
        }
    }

    /// Attaches authentication and the caller budget to the legacy routes and to each API, and puts
    /// the address gate over everything.
    ///
    /// The address gate also covers the documentation routes and the problem documents for an
    /// unknown path and for a method its path does not serve. The legacy routes and every API draw
    /// on the same budgets, and answer a method a path does not serve after authentication. The
    /// service secret passes the address gate everywhere, but the caller budgets only on the legacy
    /// routes, the only routes the services holding it call. A request whose handling panics is
    /// answered with [`InternalServerError`]. Every response that sets no `Cache-Control` of its
    /// own carries [`DEFAULT_CACHE_CONTROL`].
    ///
    /// # Panics
    ///
    /// Panics if two groups serve the same path.
    pub(super) fn assemble(
        &self,
        legacy_routes: Router,
        apis: impl IntoIterator<Item = Api>,
        documentation: Router,
    ) -> Router {
        let mut router = self.attach::<Option<ActorId>>(
            legacy_routes,
            &self.legacy_provider,
            Some(Bootstrap {
                routes: legacy::is_bootstrap_route,
                service_secret: Pin::clone(&self.service_secret),
            }),
            Challenge::Service,
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
                service_secret: Some(Pin::clone(&self.service_secret)),
            })
            .layer(CatchPanicLayer::custom(panicked))
            .layer(default_cache_control())
    }

    /// Attaches authentication and the caller budget to `routes`.
    ///
    /// The bootstrap secret also exempts its presenters from the caller budget, which a bootstrap
    /// request naming no actor can pass only by that exemption.
    fn attach<C>(
        &self,
        routes: Router,
        provider: &Arc<impl AuthenticationProvider<C> + 'static>,
        bootstrap: Option<Bootstrap>,
        challenge: Challenge,
    ) -> Router
    where
        C: Caller + 'static,
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
                service_secret: bootstrap
                    .as_ref()
                    .map(|bootstrap| Pin::clone(&bootstrap.service_secret)),
            })
            .route_layer(AuthenticationLayer::<_, C> {
                provider: Arc::clone(provider),
                metrics: Arc::clone(&self.authentication_metrics),
                bootstrap,
                challenge,
                caller: core::marker::PhantomData,
            })
    }
}
