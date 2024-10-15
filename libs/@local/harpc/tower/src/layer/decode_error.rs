use core::{
    marker::PhantomData,
    mem,
    task::{Context, Poll},
};

use harpc_codec::decode::ErrorDecoder;
use harpc_types::response_kind::ResponseKind;
use tower::{Layer, Service};

use crate::{body::Body, net::pack_error::PackError, request::Request, response::Response};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DecodeErrorLayer<C, E> {
    codec: C,
    _marker: PhantomData<fn() -> *const E>,
}

impl<C> DecodeErrorLayer<C, !> {
    pub const fn new<E>(codec: C) -> DecodeErrorLayer<C, E> {
        DecodeErrorLayer {
            codec,
            _marker: PhantomData,
        }
    }
}

impl<S, C, E> Layer<S> for DecodeErrorLayer<C, E>
where
    C: Clone,
{
    type Service = DecodeErrorService<S, C, E>;

    fn layer(&self, inner: S) -> Self::Service {
        DecodeErrorService {
            inner,
            codec: self.codec.clone(),
            _marker: PhantomData,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DecodeErrorService<S, C, E> {
    inner: S,
    codec: C,
    _marker: PhantomData<fn() -> *const E>,
}

// takes a stream of `Body` and turns it into `Result<B, E>`
impl<S, C, E, ReqBody, ResBody> Service<Request<ReqBody>> for DecodeErrorService<S, C, E>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone,
    ResBody: Body<Control: AsRef<ResponseKind>>,
    C: ErrorDecoder + Clone,
{
    type Error = S::Error;
    type Response = Response<PackError<ResBody, C, E>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let codec = self.codec.clone();

        // see: https://docs.rs/tower/latest/tower/trait.Service.html#be-careful-when-cloning-inner-services
        let clone = self.inner.clone();
        let mut inner = mem::replace(&mut self.inner, clone);

        async move {
            let response = inner.call(req).await?;
            let (parts, body) = response.into_parts();

            let body = PackError::<_, _, E>::new(body, codec);
            let response = Response::from_parts(parts, body);

            Ok(response)
        }
    }
}
