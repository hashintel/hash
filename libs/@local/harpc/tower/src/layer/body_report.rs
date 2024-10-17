use core::task::{Context, Poll};

use error_stack::Report;
use futures::TryFutureExt;
use harpc_codec::encode::ErrorEncoder;
use harpc_types::response_kind::ResponseKind;
use tower::{Layer, Service};

use crate::{
    body::{Body, encode_report::EncodeReport},
    request::Request,
    response::Response,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct HandleBodyReportLayer<E> {
    encoder: E,
}

impl<E> HandleBodyReportLayer<E> {
    pub const fn new(encoder: E) -> Self {
        Self { encoder }
    }
}

impl<E, S> Layer<S> for HandleBodyReportLayer<E>
where
    E: Clone,
{
    type Service = HandleBodyErrorService<S, E>;

    fn layer(&self, inner: S) -> Self::Service {
        HandleBodyErrorService {
            inner,
            encoder: self.encoder.clone(),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct HandleBodyErrorService<S, E> {
    inner: S,

    encoder: E,
}

impl<S, E, C, ReqBody, ResBody> Service<Request<ReqBody>> for HandleBodyErrorService<S, E>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send,
    E: ErrorEncoder + Clone,
    ReqBody: Body<Control = !>,
    // the extra bounds here are not strictly required, but they help to make the error messages
    // more expressive during compilation
    ResBody: Body<Control: AsRef<ResponseKind>, Error = Report<C>>,
    C: error_stack::Context,
{
    type Error = S::Error;
    type Response = Response<EncodeReport<ResBody, E>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let encoder = self.encoder.clone();

        self.inner
            .call(req)
            .map_ok(|res| res.map_body(|body| EncodeReport::new(body, encoder)))
    }
}
