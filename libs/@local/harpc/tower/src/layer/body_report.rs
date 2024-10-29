use core::task::{Context, Poll};

use error_stack::Report;
use futures::TryFutureExt;
use harpc_types::response_kind::ResponseKind;
use tower::{Layer, Service};

use crate::{
    body::{Body, encode_report::EncodeReport},
    request::Request,
    response::Response,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct HandleBodyReportLayer {
    _private: (),
}

impl HandleBodyReportLayer {
    #[expect(
        clippy::new_without_default,
        reason = "layer construction should be explicit and we might add fields in the future"
    )]
    #[must_use]
    pub const fn new() -> Self {
        Self { _private: () }
    }
}

impl<S> Layer<S> for HandleBodyReportLayer {
    type Service = HandleBodyErrorService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        HandleBodyErrorService { inner }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct HandleBodyErrorService<S> {
    inner: S,
}

impl<S, C, ReqBody, ResBody> Service<Request<ReqBody>> for HandleBodyErrorService<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send,
    ReqBody: Body<Control = !>,
    // The extra bounds here are not strictly required, but they help to make the error messages
    // more expressive during compilation
    ResBody: Body<Control: AsRef<ResponseKind>, Error = Report<C>>,
    C: error_stack::Context,
{
    type Error = S::Error;
    type Response = Response<EncodeReport<ResBody>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        self.inner
            .call(req)
            .map_ok(|res| res.map_body(|body| EncodeReport::new(body)))
    }
}
