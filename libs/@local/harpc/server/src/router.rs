use alloc::sync::Arc;
use core::{
    future::{self, Ready},
    task::{Context, Poll},
};

use frunk::{HCons, HNil};
use futures::{FutureExt, Stream};
use harpc_net::session::server::SessionEvent;
use harpc_service::delegate::ServiceDelegate;
use harpc_tower::{
    body::Body,
    net::pack::{PackLayer, PackService},
    request::Request,
    response::Response,
};
use tokio_util::sync::CancellationToken;
use tower::{Layer, Service, ServiceBuilder, layer::util::Identity};

use crate::{
    delegate::ServiceDelegateHandler,
    route::{Handler, Route},
    session::{self, SessionStorage},
};

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
        let service =
            ServiceDelegateHandler::new(delegate, Arc::clone(&self.session), self.codec.clone());
        let service = self.builder.service(service);

        RouterBuilder {
            routes: HCons {
                head: Handler::new::<D::Service>(service),
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

    pub fn build(self) -> Router<R>
    where
        R: Send + Sync + 'static,
    {
        Router {
            routes: Arc::new(self.routes),
        }
    }
}

pub struct RouterService<R> {
    routes: Arc<R>,
}

impl<R, ReqBody> Service<Request<ReqBody>> for RouterService<R>
where
    R: Route<ReqBody>,
    ReqBody: Body<Control = !, Error: Send + Sync> + Send + Sync,
{
    type Error = !;
    type Response = Response<R::ResponseBody>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        self.routes.call(req).map(Ok)
    }
}

pub struct Router<R> {
    routes: Arc<R>,
}

impl<R> Service<()> for Router<R> {
    type Error = !;
    type Future = Ready<Result<Self::Response, !>>;
    type Response = PackService<RouterService<R>>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, (): ()) -> Self::Future {
        let routes = Arc::clone(&self.routes);

        let layer = PackLayer::new();

        future::ready(Ok(layer.layer(RouterService { routes })))
    }
}

// TODO: boxed variant
