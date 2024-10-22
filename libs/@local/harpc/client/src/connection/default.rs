use core::{
    marker::PhantomData,
    task::{Context, Poll},
};

use bytes::{Buf, Bytes};
use error_stack::Report;
use futures::{
    Stream, StreamExt, TryFutureExt, future,
    stream::{self, BoxStream},
};
use harpc_net::session::error::ConnectionPartiallyClosedError;
use harpc_tower::{
    body::{Frame, stream::StreamBody},
    net::{pack_error::PackError, unpack::Unpack},
    request::Request,
    response::Response,
};
use tower::{Layer, Service};

use super::service::ConnectionService;

pub(crate) struct DefaultLayer<S> {
    _marker: PhantomData<fn() -> *const S>,
}

impl<S> DefaultLayer<S> {
    pub(crate) fn new() -> Self {
        Self {
            _marker: PhantomData,
        }
    }
}

impl<S, St> Layer<S> for DefaultLayer<St> {
    type Service = DefaultService<S, St>;

    fn layer(&self, inner: S) -> Self::Service {
        DefaultService {
            inner,
            _marker: PhantomData,
        }
    }
}

#[expect(clippy::unnecessary_wraps)]
const fn map_buffer<B>(buffer: B) -> Result<Frame<B, !>, !> {
    Ok(Frame::Data(buffer))
}

#[derive_where::derive_where(Debug, Copy, Clone, PartialEq, Eq, Hash; S)]
pub struct DefaultService<S, St> {
    inner: S,
    _marker: PhantomData<fn() -> *const St>,
}

impl<S, St, ResBody> Service<Request<St>> for DefaultService<S, St>
where
    S: Service<
            Request<StreamBody<stream::Map<St, fn(St::Item) -> Result<Frame<St::Item, !>, !>>>>,
            Response = Response<ResBody>,
        >,
    St: Stream<Item: Buf> + Send,
{
    type Error = S::Error;
    type Future = future::MapOk<S::Future, fn(Response<ResBody>) -> Response<PackError<ResBody>>>;
    type Response = Response<PackError<ResBody>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<St>) -> Self::Future {
        let request = req
            .map_body(|body| {
                // See https://users.rust-lang.org/t/expected-fn-pointer-found-fn-item/67368 as to why we need the cast here
                body.map(map_buffer as fn(St::Item) -> Result<Frame<St::Item, !>, !>)
            })
            .map_body(StreamBody::new);

        self.inner
            .call(request)
            .map_ok(|response| response.map_body(PackError::new))
    }
}

#[derive_where::derive_where(Debug, Clone)]
pub struct Default<B> {
    inner: DefaultService<ConnectionService, BoxStream<'static, B>>,
}

impl<B> Default<B> {
    pub(crate) fn new(inner: DefaultService<ConnectionService, BoxStream<'static, B>>) -> Self {
        Self { inner }
    }
}

impl<B> Service<Request<BoxStream<'static, B>>> for Default<B>
where
    B: Buf + Send + 'static,
{
    type Error = Report<ConnectionPartiallyClosedError>;
    type Response = Response<PackError<Unpack>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<BoxStream<'static, B>>) -> Self::Future {
        self.inner.call(req)
    }
}
