use core::task::{Context, Poll};

use bytes::Buf;
use harpc_types::response_kind::ResponseKind;
use tower::{Layer, Service, ServiceExt};

use crate::{
    body::{Body, BodyExt},
    request::Request,
    response::{BoxedResponse, Response},
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct BoxedResponseLayer {
    _private: (),
}

impl BoxedResponseLayer {
    #[must_use]
    pub const fn new() -> Self {
        Self { _private: () }
    }
}

impl<S> Layer<S> for BoxedResponseLayer {
    type Service = BoxedResponseService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        BoxedResponseService { inner }
    }
}

impl Default for BoxedResponseLayer {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct BoxedResponseService<S> {
    inner: S,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for BoxedResponseService<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send,
    ReqBody: Body<Control = !>,
    ResBody: Body<Control: AsRef<ResponseKind>> + Send + Sync + 'static,
{
    type Error = S::Error;
    type Response = BoxedResponse<ResBody::Error>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let clone = self.inner.clone();
        let mut inner = core::mem::replace(&mut self.inner, clone);

        async move {
            // oneshot also waits for poll_ready, we do that already in `poll_ready` ourselves
            let response = inner.call(req).await?;

            let response = response.map_body(|body| {
                body.map_control(|control| *control.as_ref())
                    .map_data(|mut buffer| {
                        let length = buffer.remaining();
                        buffer.copy_to_bytes(length)
                    })
                    .boxed()
            });

            Ok(response)
        }
    }
}
