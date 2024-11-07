use core::future::ready;

use bytes::Bytes;
use frunk::{HCons, HNil};
use futures::FutureExt as _;
use harpc_codec::error::NetworkError;
use harpc_system::{RefinedSubsystemIdentifier, SubsystemIdentifier};
use harpc_tower::{
    body::{Body, controlled::Controlled, full::Full},
    request::Request,
    response::{Parts, Response},
};
use harpc_types::{response_kind::ResponseKind, version::Version};
use tower::{Service, ServiceExt as _, util::Oneshot};

use crate::error::SubsystemNotFound;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Handler<S, I> {
    subsystem: I,
    version: Version,

    inner: S,
}

impl<Svc> Handler<Svc, !> {
    pub(crate) const fn new<Sys>(inner: Svc) -> Handler<Svc, Sys::SubsystemId>
    where
        Sys: harpc_system::Subsystem,
    {
        Handler {
            subsystem: Sys::ID,
            version: Sys::VERSION,

            inner,
        }
    }
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
/// [`Router`]: crate::router::Router
/// [`Steer`]: https://docs.rs/tower/latest/tower/steer/struct.Steer.html
pub trait Route<ReqBody> {
    type SubsystemId;
    type ResponseBody: Body<Control: AsRef<ResponseKind>, Error = !>;
    type Future: Future<Output = Response<Self::ResponseBody>>;

    fn call(&self, request: Request<ReqBody>) -> Self::Future
    where
        ReqBody: Body<Control = !, Error: Send + Sync> + Send + Sync;
}

// The clone requirement might seem odd here, but is the same as in axum's router implementation.
// see: https://docs.rs/axum/latest/src/axum/routing/route.rs.html#45
impl<Svc, Tail, ReqBody, ResBody, Id> Route<ReqBody> for HCons<Handler<Svc, Id>, Tail>
where
    Svc: Service<Request<ReqBody>, Response = Response<ResBody>, Error = !> + Clone,
    Tail: Route<ReqBody, SubsystemId: RefinedSubsystemIdentifier<Id>>,
    ResBody: Body<Control: AsRef<ResponseKind>, Error = !>,
    Id: SubsystemIdentifier,
{
    // cannot use `impl Future` here, as it would require additional constraints on the associated
    // type, that are already present on the `call` method.
    type Future = futures::future::Either<
        futures::future::Map<
            Oneshot<Svc, Request<ReqBody>>,
            fn(Result<Response<ResBody>, !>) -> Response<Self::ResponseBody>,
        >,
        futures::future::Map<
            Tail::Future,
            fn(Response<Tail::ResponseBody>) -> Response<Self::ResponseBody>,
        >,
    >;
    type ResponseBody = harpc_tower::either::Either<ResBody, Tail::ResponseBody>;
    type SubsystemId = Id;

    fn call(&self, request: Request<ReqBody>) -> Self::Future
    where
        ReqBody: Body<Control = !, Error: Send + Sync> + Send + Sync,
    {
        let requirement = self.head.version.into_requirement();

        if self.head.subsystem.into_id() == request.subsystem().id
            && requirement.compatible(request.subsystem().version)
        {
            let service = self.head.inner.clone();

            futures::future::Either::Left(
                service
                    .oneshot(request)
                    .map(|Ok(response)| response.map_body(harpc_tower::either::Either::Left)),
            )
        } else {
            futures::future::Either::Right(
                self.tail
                    .call(request)
                    .map(|response| response.map_body(harpc_tower::either::Either::Right)),
            )
        }
    }
}

impl<ReqBody> Route<ReqBody> for HNil {
    type Future = core::future::Ready<Response<Self::ResponseBody>>;
    type ResponseBody = Controlled<ResponseKind, Full<Bytes>>;
    type SubsystemId = !;

    fn call(&self, request: Request<ReqBody>) -> Self::Future
    where
        ReqBody: Body<Control = !, Error: Send + Sync> + Send + Sync,
    {
        let error = SubsystemNotFound {
            subsystem: request.subsystem(),
        };

        let session = request.session();

        let error = NetworkError::capture_error(&error);

        ready(Response::from_error(Parts::new(session), error))
    }
}
