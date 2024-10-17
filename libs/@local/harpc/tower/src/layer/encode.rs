use core::{
    mem,
    task::{Context, Poll},
};

use futures::Stream;
use harpc_codec::encode::Encoder;
use tower::{Layer, Service};

use crate::{body::stream::StreamBody, request::Request};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct EncodeLayer<C> {
    codec: C,
}

impl<C> EncodeLayer<C> {
    pub const fn new(codec: C) -> Self {
        Self { codec }
    }
}

impl<S, C> Layer<S> for EncodeLayer<C>
where
    C: Clone,
{
    type Service = EncodeService<S, C>;

    fn layer(&self, inner: S) -> Self::Service {
        EncodeService {
            inner,
            codec: self.codec.clone(),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct EncodeService<S, C> {
    inner: S,
    codec: C,
}

impl<S, C, St> Service<Request<St>> for EncodeService<S, C>
where
    St: Stream<Item: serde::Serialize> + Send + Sync,
    S: Service<Request<StreamBody<<C as Encoder>::Output<St>>>> + Clone,
    C: Encoder + Clone,
{
    type Error = S::Error;
    type Response = S::Response;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<St>) -> Self::Future {
        let codec = self.codec.clone();

        // see: https://docs.rs/tower/latest/tower/trait.Service.html#be-careful-when-cloning-inner-services
        let clone = self.inner.clone();
        let mut inner = mem::replace(&mut self.inner, clone);

        async move {
            let (parts, body) = req.into_parts();

            let stream = codec.encode(body);
            let body = StreamBody::new(stream);

            let req = Request::from_parts(parts, body);

            inner.call(req).await
        }
    }
}

// TODO: test
