use alloc::sync::Arc;
use core::{
    future::{self, Ready, ready},
    task::{Context, Poll},
};

use frunk::{HCons, HNil};
use futures::{
    FutureExt, Stream,
    future::{Either, Map},
};
use harpc_codec::encode::ErrorEncoder;
use harpc_net::session::server::SessionEvent;
use harpc_service::delegate::ServiceDelegate;
use harpc_tower::{
    body::{Body, BodyExt},
    request::Request,
    response::{BoxedResponse, Parts, Response},
};
use harpc_types::{service::ServiceId, version::Version};
use tokio_util::sync::CancellationToken;
use tower::{Layer, Service, ServiceBuilder, ServiceExt, layer::util::Identity, util::Oneshot};

use crate::{
    delegate::ServiceDelegateHandler,
    error::NotFound,
    session::{self, SessionStorage},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Handler<S> {
    service: ServiceId,
    version: Version,

    inner: S,
}

/// Route requests to the appropriate handler based on the request's service and version.
///
/// This is essentially a type-level linked list of handlers, it's boxed equivalent is [`Steer`],
/// but unlike [`Steer`] it doesn't require the same type for all handlers and a separation of both
/// the meta information (service id and version) and the actual handler. Unlike [`Steer`], it also
/// doesn't require `&mut self` access, which allows for more granular cloning.
///
/// # Design motivations
///
/// The reason why we essentially require `Clone`/`Copy` for the handlers is that once the route is
/// constructed it needs to be available for each request that happens, now, there are multiple ways
/// to achieve this.
///
/// One way would be to simply clone the entire [`Router`] during each request, but that has the
/// downside of potentially cloning a lot of data that isn't actually required for each request,
/// making the addition of new handlers slower and slower.
/// The other solution instead would be to `Mutex` the entire [`Router`], but that would make the
/// entire [`Router`] essentially single-threaded, which is not ideal.
///
/// This takes a middle ground, which is similar in implementation to other tower-based frameworks,
/// such as axum. The inner routes are stored in an `Arc<T>`, which is cheap to clone, but means we
/// need to require `&self` during routing. Once a route was chosen, we simply clone the service
/// (and oneshot) the service. This keeps the cloned data minimal and allows for multi-threading.
///
/// The downside is that we're unable to keep any state in a service delegate that's persisted
/// across invocations. To signal this, `ServiceDelegate` takes `self` and consumes it (even though
/// it isn't strictly needed), as well as the use of sessions. To store any information across
/// calls, one must make use of smart pointers, such as `Arc`.
///
/// [`Steer`]: https://docs.rs/tower/latest/tower/steer/struct.Steer.html
pub trait Route<B, C> {
    type ResponseBodyError;
    type Future: Future<Output = BoxedResponse<Self::ResponseBodyError>> + Send;

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
    // cannot use `impl Future` here, as it would require additional constraints on the associated
    // type, that are already present on the `call` method.
    type Future = Either<
        Map<Oneshot<Svc, Request<B>>, fn(Result<BoxedResponse<E>, !>) -> BoxedResponse<E>>,
        Tail::Future,
    >;
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

            Either::Left(service.oneshot(request).map(|Ok(response)| response))
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

    type Future = impl Future<Output = BoxedResponse<!>> + Send;

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

        let error = codec.encode_error(error);

        ready(Response::from_error(Parts::new(session), error).map_body(BodyExt::boxed))
    }
}

pub struct RouterBuilder<R, L, S, C> {
    routes: R,
    builder: ServiceBuilder<L>,
    session: Arc<SessionStorage<S>>,
    codec: C,
    cancel: CancellationToken,
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
            cancel: CancellationToken::new(),
        }
    }
}

// only allow to set the cancellation token **before** any routes or layers are added.
impl<S, C> RouterBuilder<HNil, Identity, S, C> {
    #[must_use]
    pub fn with_cancellation_token(self, cancel: CancellationToken) -> Self {
        Self { cancel, ..self }
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
            cancel: self.cancel,
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
            cancel: self.cancel,
        }
    }
}

impl<R, L, S, C> RouterBuilder<R, L, S, C> {
    /// Creates a background task for session storage management.
    ///
    /// The returned [`session::Task`] implements `IntoFuture`, allowing it to be
    /// easily spawned onto an executor. Configuration options such as `sweep_interval`
    /// can be adjusted via methods on the task before spawning.
    ///
    /// # Note
    ///
    /// It is not necessary to spawn the task if the router is spawned, but it is **highly**
    /// recommended, as otherwise sessions will not be cleaned up, which will lead to memory leaks.
    pub fn background_task<St, E>(&self, stream: St) -> session::Task<S, St>
    where
        S: Send + Sync + 'static,
        St: Stream<Item = Result<SessionEvent, E>> + Send + 'static,
    {
        Arc::clone(&self.session)
            .task(stream)
            .with_cancellation_token(self.cancel.child_token())
    }

    pub fn build(self) -> Router<R, C>
    where
        R: Send + Sync + 'static,
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

        self.routes.call(req, codec).map(Ok)
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
