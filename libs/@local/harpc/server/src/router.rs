use alloc::sync::Arc;
use core::{
    future::{self, Ready},
    task::{Context, Poll},
};

use frunk::{HCons, HNil};
use futures::future::Either;
use harpc_net::codec::ErrorEncoder;
use harpc_service::delegate::ServiceDelegate;
use harpc_tower::{
    body::{Body, BodyExt},
    request::Request,
    response::{BoxedResponse, Parts, Response},
};
use harpc_types::{service::ServiceId, version::Version};
use tower::{Layer, Service, ServiceBuilder, ServiceExt, layer::util::Identity, util::Oneshot};

use crate::{delegate::ServiceDelegateHandler, error::NotFound, session::SessionStorage};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Handler<S> {
    service: ServiceId,
    version: Version,

    inner: S,
}

pub trait Route<B, C> {
    type ResponseBodyError;
    type Future: Future<Output = Result<BoxedResponse<Self::ResponseBodyError>, !>> + Send;

    fn call(&self, request: Request<B>, codec: C) -> Self::Future
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync,
        C: ErrorEncoder + Send + Sync;
}

// The clone requirement might seem odd here, but is the same as in axum's router implementation.
// see: https://docs.rs/axum/latest/src/axum/routing/route.rs.html#45
impl<B, C, E, Svc, Tail> Route<B, C> for HCons<Handler<Svc>, Tail>
where
    Svc: Service<Request<B>, Response = BoxedResponse<E>, Error = !, Future: Send>
        + Clone
        + Send
        + Sync,
    Tail: Route<B, C, ResponseBodyError = E> + Send,
    B: Send,
{
    type Future = Either<Oneshot<Svc, Request<B>>, Tail::Future>;
    type ResponseBodyError = E;

    fn call(&self, request: Request<B>, codec: C) -> Self::Future
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync,
        C: ErrorEncoder + Send + Sync,
    {
        let requirement = self.head.version.into_requirement();

        if self.head.service == request.service().id
            && requirement.compatible(request.service().version)
        {
            let service = self.head.inner.clone();

            Either::Left(service.oneshot(request))
        } else {
            Either::Right(self.tail.call(request, codec))
        }
    }
}

impl<B, C> Route<B, C> for HNil
where
    B: Body<Control = !, Error: Send + Sync> + Send + Sync,
    C: ErrorEncoder + Send + Sync,
{
    type ResponseBodyError = !;

    type Future = impl Future<Output = Result<BoxedResponse<!>, !>> + Send;

    fn call(&self, request: Request<B>, codec: C) -> Self::Future
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync,
        C: ErrorEncoder + Send + Sync,
    {
        let error = NotFound {
            service: request.service().id,
            version: request.service().version,
        };

        let session = request.session();

        async move {
            let error = codec.encode_error(error).await;

            Ok(Response::from_error(Parts::new(session), error).map_body(BodyExt::boxed))
        }
    }
}

pub struct RouterBuilder<R, L, S, C> {
    routes: R,
    builder: ServiceBuilder<L>,
    session: Arc<SessionStorage<S>>,
    codec: C,
}

impl<C> RouterBuilder<HNil, Identity, (), C> {
    // S is part of the generics to make it easier to construct the router, but it's not strictly
    // necessary.
    pub fn new<S>(codec: C) -> RouterBuilder<HNil, Identity, S, C>
    where
        S: 'static,
    {
        RouterBuilder {
            routes: HNil,
            builder: ServiceBuilder::new(),
            session: Arc::new(SessionStorage::new()),
            codec,
        }
    }
}

type ServiceHandler<D, L, S, C> = Handler<<L as Layer<ServiceDelegateHandler<D, S, C>>>::Service>;

impl<R, L, S, C> RouterBuilder<R, L, S, C> {
    pub fn with_builder<L2>(
        self,
        builder: impl FnOnce(ServiceBuilder<L>) -> ServiceBuilder<L2>,
    ) -> RouterBuilder<R, L2, S, C> {
        RouterBuilder {
            routes: self.routes,
            builder: builder(self.builder),
            session: self.session,
            codec: self.codec,
        }
    }

    // The bounds on S and C are not strictly necessary, same with `R: Clone + Send`, but they make
    // construction easier, but not deferring type errors to the latest stage when it all becomes
    // unmanageable.
    #[expect(
        clippy::type_complexity,
        reason = "type complexity due to verification"
    )]
    pub fn register<D>(
        self,
        delegate: D,
    ) -> RouterBuilder<HCons<ServiceHandler<D, L, S, C>, R>, L, S, C>
    where
        D: ServiceDelegate<S, C> + Clone + Send,
        L: Layer<ServiceDelegateHandler<D, S, C>>,
        S: Default + Send + Sync + 'static,
        C: Clone + Send + 'static,
    {
        let service_id = <D::Service as harpc_service::Service>::ID;
        let version = <D::Service as harpc_service::Service>::VERSION;

        let service =
            ServiceDelegateHandler::new(delegate, Arc::clone(&self.session), self.codec.clone());
        let service = self.builder.service(service);

        RouterBuilder {
            routes: HCons {
                head: Handler {
                    service: service_id,
                    version,
                    inner: service,
                },
                tail: self.routes,
            },
            builder: self.builder,
            session: self.session,
            codec: self.codec,
        }
    }
}

impl<R, L, S, C> RouterBuilder<R, L, S, C> {
    pub fn build<B>(self) -> Router<R, C>
    where
        R: Route<B, C> + Send + Sync + 'static,
        B: Body<Control = !, Error: Send + Sync> + Send + Sync + 'static,
        C: ErrorEncoder + Clone + Send + Sync + 'static,
    {
        Router {
            routes: Arc::new(self.routes),
            codec: self.codec,
        }
    }
}

pub struct RouterService<R, C> {
    routes: Arc<R>,
    codec: C,
}

impl<B, R, C> Service<Request<B>> for RouterService<R, C>
where
    R: Route<B, C>,
    B: Body<Control = !, Error: Send + Sync> + Send + Sync,
    C: ErrorEncoder + Clone + Send + Sync + 'static,
{
    type Error = !;
    type Response = BoxedResponse<R::ResponseBodyError>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>> + Send;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<B>) -> Self::Future {
        let codec = self.codec.clone();

        self.routes.call(req, codec)
    }
}

pub struct Router<R, C> {
    routes: Arc<R>,
    codec: C,
}

impl<R, C> Service<()> for Router<R, C>
where
    C: Clone,
{
    type Error = !;
    type Future = Ready<Result<RouterService<R, C>, !>>;
    type Response = RouterService<R, C>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, (): ()) -> Self::Future {
        let routes = Arc::clone(&self.routes);
        let codec = self.codec.clone();

        future::ready(Ok(RouterService { routes, codec }))
    }
}

// TODO: boxed variant
