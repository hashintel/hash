use core::{
    marker::PhantomData,
    mem,
    task::{Context, Poll},
};

use bytes::Buf;
use futures::Stream;
use harpc_codec::decode::Decoder;
use tower::{Layer, Service};

use crate::{request::Request, response::Response};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DecodeLayer<C, T> {
    codec: C,
    _marker: PhantomData<fn() -> *const T>,
}

impl<C> DecodeLayer<C, !> {
    pub const fn new<T>(codec: C) -> DecodeLayer<C, T> {
        DecodeLayer {
            codec,
            _marker: PhantomData,
        }
    }
}

impl<S, C, T> Layer<S> for DecodeLayer<C, T>
where
    C: Clone,
{
    type Service = DecodeService<S, C, T>;

    fn layer(&self, inner: S) -> Self::Service {
        DecodeService {
            inner,
            codec: self.codec.clone(),
            _marker: PhantomData,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct DecodeService<S, C, T> {
    inner: S,
    codec: C,
    _marker: PhantomData<fn() -> *const T>,
}

impl<S, C, T, ReqBody, ResBody, ResData, ResError> Service<Request<ReqBody>>
    for DecodeService<S, C, T>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone,
    ResBody: Stream<Item = Result<ResData, ResError>> + Send,
    C: Decoder + Clone,
    ResData: Buf,
    T: serde::de::DeserializeOwned,
{
    type Error = S::Error;
    type Response = Response<<C as Decoder>::Output<T, ResData, ResError, ResBody>>;

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

            let stream = codec.decode(body);

            Ok(Response::from_parts(parts, stream))
        }
    }
}

// TODO: test
