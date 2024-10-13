use core::error::Error;

use harpc_codec::encode::ErrorEncoder;
use harpc_types::response_kind::ResponseKind;
use tower::{Layer, Service};

use crate::{body::Body, request::Request, response::Response};

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

// impl<S, E, ReqBody, ResBody> Service<Request<ReqBody>> for HandleBodyErrorService<S, E>
// where
//     S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send,
//     E: ErrorEncoder + Clone,
//     ReqBody: Body<Control = !>,
//     ResBody: Body<Control: AsRef<ResponseKind>>,
// {
//     type Error = S::Error;
//     type Response;

//     type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

//     fn poll_ready(
//         &mut self,
//         cx: &mut std::task::Context<'_>,
//     ) -> std::task::Poll<Result<(), Self::Error>> {
//         todo!()
//     }

//     fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
//         todo!()
//     }
// }
