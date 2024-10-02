use alloc::sync::Arc;
use core::task::{Context, Poll};

use error_stack::Report;
use harpc_service::delegate::ServiceDelegate;
use harpc_tower::{body::Body, request::Request, response::Response};
use tower::Service;

pub struct DelegateService<D, S, C> {
    delegate: Arc<D>,
}

impl<D> DelegateService<D> {
    pub fn new(delegate: D) -> Self {
        Self {
            delegate: Arc::new(delegate),
        }
    }
}

impl<D, S, C, ReqBody> Service<Request<ReqBody>> for DelegateService<D, S, C>
where
    D: ServiceDelegate<S, C>,
    ReqBody: Body<Control = !>,
{
    type Error = Report<D::Error>;
    type Response = Response<D::Body>;

    type Future = impl Future<Output = Result<Response<D::Body>, Report<D::Error>>> + Send;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        // A delegate service is always ready to accept requests.
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let delegate = Arc::clone(&self.delegate);

        async move { delegate.call(request, session, codec) }
    }
}
