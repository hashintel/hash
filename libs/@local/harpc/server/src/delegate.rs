use alloc::sync::Arc;
use core::{
    fmt::Debug,
    task::{Context, Poll},
};

use harpc_system::delegate::SubsystemDelegate;
use harpc_tower::{body::Body, request::Request, response::Response};
use tower::Service;

use crate::session::{RequestInfo, Session, SessionStorage};

/// Bridge between `harpc-system` and `tower`.
///
/// This is a very thin layer between the `harpc-system` subsystem and `tower` service. It is
/// responsible for taking the incoming request, selecting the appropriate session and codec, and
/// then delegating the request to the inner subsystem (which is cloned).
///
/// A conscious decision was made not to have `ServiceDelegate` be a `Service`, as it allows for
/// greater ergonomics, and allows server implementation that are not based on tower in the future.
/// For example, because of the inherit `oneshot` nature of our tower implementation, having
/// `&mut self` as a parameter would be more confusing than helpful.
///
/// A subsystem delegate has additional information that isn't useful in the context of a tower
/// service, such as the underlying `harpc-system` that is being delegated to.
#[derive_where::derive_where(Clone; D: Clone, C: Clone)]
#[derive_where(Debug; D: Debug, S: Debug + 'static, C: Debug)]
pub struct SubsystemDelegateService<D, S, C> {
    delegate: D,
    session: Arc<SessionStorage<S>>,
    codec: C,
}

impl<D, S, C> SubsystemDelegateService<D, S, C> {
    pub const fn new(delegate: D, session: Arc<SessionStorage<S>>, codec: C) -> Self {
        Self {
            delegate,
            session,
            codec,
        }
    }
}

impl<D, S, C, ReqBody> Service<Request<ReqBody>> for SubsystemDelegateService<D, S, C>
where
    D: SubsystemDelegate<C, ExecutionScope = Session<S>> + Clone + Send,
    S: Default + Clone + Send + Sync + 'static,
    C: Clone + Send + 'static,
    ReqBody: Body<Control = !, Error: Send + Sync> + Send,
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
            let session = storage
                .get_or_insert(
                    req.session(),
                    RequestInfo {
                        subsystem: req.subsystem(),
                        procedure: req.procedure(),
                    },
                )
                .await;

            delegate.call(req, session, codec).await
        }
    }
}
