use alloc::sync::Arc;
use core::{
    fmt::Debug,
    task::{Context, Poll},
};

use harpc_service::delegate::ServiceDelegate;
use harpc_tower::{body::Body, request::Request, response::Response};
use tower::Service;

use crate::session::{Session, SessionStorage};

/// Bridge between `harpc-service` and `tower`.
///
/// This is a very thin layer between the `harpc-service` and `tower` services. It is responsible
/// for taking the incoming request, selecting the appropriate session and codec, and then
/// delegating the request to the inner service (which is cloned).
///
/// A concious decision was made not to have `ServiceDelegate` be a `Service`, as it allows for
/// greater ergonomics, and allows server implementation that are not based on tower in the future.
/// For example, because of the inherit `oneshot` nature of our tower implementation, having `&mut
/// self` as a parameter would be more confusing than helpful.
///
/// A service delegate has additional information that isn't useful in the context of a tower
/// service, such as the underlying `harpc-service` that is being delegated to.
#[derive_where::derive_where(Clone; D: Clone, C: Clone)]
#[derive_where(Debug; D: Debug, S: Debug + 'static, C: Debug)]
pub struct ServiceDelegateHandler<D, S, C> {
    delegate: D,
    session: Arc<SessionStorage<S>>,
    codec: C,
}

impl<D, S, C> ServiceDelegateHandler<D, S, C> {
    pub const fn new(delegate: D, session: Arc<SessionStorage<S>>, codec: C) -> Self {
        Self {
            delegate,
            session,
            codec,
        }
    }
}

impl<D, S, C, ReqBody> Service<Request<ReqBody>> for ServiceDelegateHandler<D, S, C>
where
    D: ServiceDelegate<Session<S>, C> + Clone + Send,
    S: Default + Clone + Send + Sync + 'static,
    C: Clone + Send + 'static,
    ReqBody: Body<Control = !, Error: Send + Sync> + Send + Sync,
{
    type Error = D::Error;
    type Response = Response<D::Body<ReqBody>>;

    type Future = impl Future<Output = Result<Response<D::Body<ReqBody>>, D::Error>> + Send;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        // A delegate service is always ready to accept requests.
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let clone = self.delegate.clone();
        let delegate = core::mem::replace(&mut self.delegate, clone);

        let session = Arc::clone(&self.session);
        let codec = self.codec.clone();

        async move {
            let storage = session;
            let session = storage.get_or_insert(req.session()).await;

            delegate.call(req, session, codec).await
        }
    }
}
