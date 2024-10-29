use core::{
    mem,
    task::{Context, Poll},
};

use futures::{FutureExt, TryFutureExt};
use tower::{Layer, Service};

use crate::{request::Request, response::Response};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct MapResponseBodyLayer<F> {
    function: F,
}

impl<F> MapResponseBodyLayer<F> {
    pub const fn new(function: F) -> Self {
        Self { function }
    }
}

impl<S, F> Layer<S> for MapResponseBodyLayer<F>
where
    F: Clone,
{
    type Service = MapResponseBodyService<F, S>;

    fn layer(&self, inner: S) -> Self::Service {
        MapResponseBodyService {
            inner,
            function: self.function.clone(),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct MapResponseBodyService<F, S> {
    inner: S,
    function: F,
}

impl<F, S, Req, ResBody, ResBodyNext, Fut> Service<Req> for MapResponseBodyService<F, S>
where
    S: Service<Req, Response = Response<ResBody>>,
    F: FnOnce(ResBody) -> Fut + Clone,
    Fut: Future<Output = ResBodyNext>,
{
    type Error = S::Error;
    type Response = Response<ResBodyNext>;

    type Future = impl Future<Output = Result<Response<ResBodyNext>, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Req) -> Self::Future {
        let function = self.function.clone();

        self.inner.call(req).and_then(move |response| {
            let (parts, body) = response.into_parts();

            (function)(body)
                .map(move |body_next| Response::from_parts(parts, body_next))
                .map(Ok)
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct MapRequestBodyLayer<F> {
    function: F,
}

impl<F> MapRequestBodyLayer<F> {
    pub const fn new(function: F) -> Self {
        Self { function }
    }
}

impl<S, F> Layer<S> for MapRequestBodyLayer<F>
where
    F: Clone,
{
    type Service = MapRequestBodyService<F, S>;

    fn layer(&self, inner: S) -> Self::Service {
        MapRequestBodyService {
            inner,
            function: self.function.clone(),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct MapRequestBodyService<F, S> {
    inner: S,
    function: F,
}

impl<F, S, ReqBody, ReqBodyNext, Fut> Service<Request<ReqBody>> for MapRequestBodyService<F, S>
where
    S: Service<Request<ReqBodyNext>> + Clone,
    F: FnOnce(ReqBody) -> Fut + Clone,
    Fut: Future<Output = ReqBodyNext>,
{
    type Error = S::Error;
    type Response = S::Response;

    type Future = impl Future<Output = Result<S::Response, Self::Error>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let function = self.function.clone();

        // see: https://docs.rs/tower/latest/tower/trait.Service.html#be-careful-when-cloning-inner-services
        let clone = self.inner.clone();
        let mut inner = mem::replace(&mut self.inner, clone);

        let (parts, body) = req.into_parts();
        let body = (function)(body);

        body.then(move |body| {
            let request = Request::from_parts(parts, body);

            inner.call(request)
        })
    }
}
