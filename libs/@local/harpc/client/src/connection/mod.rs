use core::task::{Context, Poll};

use bytes::Buf;
use futures::Stream;
use harpc_tower::request::Request;
use tower::Service;

pub mod default;
pub mod service;

pub type DefaultConnection<C> = Connection<default::Default, C>;

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Connection<S, C> {
    service: S,
    codec: C,
}

impl<S, C> Connection<S, C> {
    pub(crate) const fn new(service: S, codec: C) -> Self {
        Self { service, codec }
    }

    pub const fn codec(&self) -> &C {
        &self.codec
    }
}

// We specifically restrict the implementation to just `Request<B>` to ensure that the `Connection`
// is only used in a client (it also simplifies trait bounds).
impl<St, S, C> Service<Request<St>> for Connection<S, C>
where
    St: Stream<Item: Buf>,
    S: Service<Request<St>>,
{
    type Error = S::Error;
    type Future = S::Future;
    type Response = S::Response;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&mut self, req: Request<St>) -> Self::Future {
        self.service.call(req)
    }
}
