use core::{
    mem,
    task::{Context, Poll},
};

use harpc_types::response_kind::ResponseKind;
use tower::{Layer, Service};

use crate::{body::Body, net::pack_error::PackError, request::Request, response::Response};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DecodeErrorLayer {
    _private: (),
}

impl DecodeErrorLayer {
    #[expect(
        clippy::new_without_default,
        reason = "layer construction should be explicit and we might add fields in the future"
    )]
    #[must_use]
    pub const fn new() -> Self {
        Self { _private: () }
    }
}

impl<S> Layer<S> for DecodeErrorLayer {
    type Service = DecodeErrorService<S>;

    fn layer(&self, inner: S) -> Self::Service {
        DecodeErrorService { inner }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DecodeErrorService<S> {
    inner: S,
}

// Takes a stream of `Body` and turns it into `Result<B, NetworkError>`
impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for DecodeErrorService<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone,
    ResBody: Body<Control: AsRef<ResponseKind>>,
{
    type Error = S::Error;
    type Response = Response<PackError<ResBody>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        // see: https://docs.rs/tower/latest/tower/trait.Service.html#be-careful-when-cloning-inner-services
        let clone = self.inner.clone();
        let mut inner = mem::replace(&mut self.inner, clone);

        async move {
            let response = inner.call(req).await?;
            let (parts, body) = response.into_parts();

            let body = PackError::new(body);
            let response = Response::from_parts(parts, body);

            Ok(response)
        }
    }
}
