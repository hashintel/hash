use alloc::sync::Arc;
use core::{
    fmt::Debug,
    task::{Context, Poll},
};

use harpc_service::delegate::ServiceDelegate;
use harpc_tower::{body::Body, request::Request, response::Response};
use tower::Service;

use crate::session::{Session, SessionStorage};

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
    type Response = Response<D::Body>;

    type Future = impl Future<Output = Result<Response<D::Body>, D::Error>> + Send;

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
