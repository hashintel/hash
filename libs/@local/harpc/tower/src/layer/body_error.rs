use core::{
    error::Error,
    task::{Context, Poll},
};

use futures::TryFutureExt;
use harpc_codec::encode::ErrorEncoder;
use harpc_types::response_kind::ResponseKind;
use tower::{Layer, Service};

use crate::{
    body::{Body, encode_error::EncodeError},
    request::Request,
    response::Response,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct HandleBodyErrorLayer<E> {
    encoder: E,
}

impl<E> HandleBodyErrorLayer<E> {
    pub const fn new(encoder: E) -> Self {
        Self { encoder }
    }
}

impl<E, S> Layer<S> for HandleBodyErrorLayer<E>
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

impl<S, E, ReqBody, ResBody> Service<Request<ReqBody>> for HandleBodyErrorService<S, E>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send,
    E: ErrorEncoder + Clone,
    ReqBody: Body<Control = !>,
    // the extra bounds here are not strictly required, but they help to make the error messages
    // more expressive during compilation
    ResBody: Body<Control: AsRef<ResponseKind>, Error: Error + serde::Serialize>,
{
    type Error = S::Error;
    type Response = Response<EncodeError<ResBody, E>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let encoder = self.encoder.clone();

        self.inner
            .call(req)
            .map_ok(|res| res.map_body(|body| EncodeError::new(body, encoder)))
    }
}
