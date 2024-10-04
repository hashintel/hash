use alloc::sync::Arc;
use core::task::{Context, Poll, ready};

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
use tower::{Layer, Service, ServiceBuilder, ServiceExt, layer::util::Identity, util::BoxService};

use crate::{delegate::DelegateService, error::NotFound, session::SessionStorage};

pub struct Handler<S> {
    service: ServiceId,
    version: Version,

    inner: S,
}

pub trait Route<B, C> {
    type ResponseBodyError;
    type Future: Future<Output = Result<BoxedResponse<Self::ResponseBodyError>, !>> + Send;

    // very similar to `ServiceExt`, only difference: we use it to steer the request to the correct
    // and we cannot fail (the service should no longer have an error!)
    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<()>;

    fn call(&mut self, request: Request<B>, codec: C) -> Self::Future
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync,
        C: ErrorEncoder + Send + Sync;
}

impl<B, C, E, Svc, Tail> Route<B, C> for HCons<Handler<Svc>, Tail>
where
    Svc: Service<Request<B>, Response = BoxedResponse<E>, Error = !, Future: Send> + Send + Sync,
    Tail: Route<B, C, ResponseBodyError = E> + Send,
{
    type Future = Either<Svc::Future, Tail::Future>;
    type ResponseBodyError = E;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<()> {
        let Ok(()) = ready!(self.head.inner.poll_ready(cx));

        self.tail.poll_ready(cx)
    }

    fn call(&mut self, request: Request<B>, codec: C) -> Self::Future
    where
        B: Body<Control = !, Error: Send + Sync> + Send + Sync,
        C: ErrorEncoder + Send + Sync,
    {
        let requirement = self.head.version.into_requirement();

        if self.head.service == request.service().id
            && requirement.compatible(request.service().version)
        {
            Either::Left(self.head.inner.call(request))
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

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<()> {
        Poll::Ready(())
    }

    fn call(&mut self, request: Request<B>, codec: C) -> Self::Future
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

struct RouterService<R, C> {
    routes: R,
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

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.routes.poll_ready(cx).map(Ok)
    }

    fn call(&mut self, req: Request<B>) -> Self::Future {
        let codec = self.codec.clone();

        self.routes.call(req, codec)
    }
}

pub struct RouterBuilder<R, L, S, C> {
    routes: R,
    builder: ServiceBuilder<L>,
    session: Arc<SessionStorage<S>>,
    codec: C,
}

impl<S, C> RouterBuilder<HNil, Identity, S, C>
where
    S: Clone + 'static,
{
    pub fn new(codec: C) -> Self {
        Self {
            routes: HNil,
            builder: ServiceBuilder::new(),
            session: Arc::new(SessionStorage::new()),
            codec,
        }
    }
}

type ServiceHandler<D, L, S, C> = Handler<<L as Layer<DelegateService<D, S, C>>>::Service>;

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
    pub fn register<D>(
        self,
        delegate: D,
    ) -> RouterBuilder<HCons<ServiceHandler<D, L, S, C>, R>, L, S, C>
    where
        D: ServiceDelegate<S, C> + Clone + Send,
        L: Layer<DelegateService<D, S, C>>,
        S: Default + Clone + Send + Sync + 'static,
        C: Clone + Send + 'static,
    {
        let service_id = <D::Service as harpc_service::Service>::ID;
        let version = <D::Service as harpc_service::Service>::VERSION;

        let service = DelegateService::new(delegate, Arc::clone(&self.session), self.codec.clone());
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
    pub fn build<B>(self) -> Router<B, R::ResponseBodyError>
    where
        R: Route<B, C> + Send + Sync + 'static,
        B: Body<Control = !, Error: Send + Sync> + Send + Sync + 'static,
        C: ErrorEncoder + Clone + Send + Sync + 'static,
    {
        let service = RouterService {
            routes: self.routes,
            codec: self.codec,
        };

        Router {
            inner: service.boxed(),
        }
    }
}

// TODO: can we somehow erase the `E` type parameter?
pub struct Router<B, E> {
    inner: BoxService<Request<B>, BoxedResponse<E>, !>,
}

impl<B, E> Service<Request<B>> for Router<B, E>
where
    B: Body<Control = !, Error: Send + Sync> + Send + Sync,
    E: Send + Sync,
{
    type Error = !;
    type Response = BoxedResponse<E>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>> + Send;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<B>) -> Self::Future {
        self.inner.call(req)
    }
}
