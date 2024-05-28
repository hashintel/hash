use core::task::{Context, Poll};

use error_stack::Report;
use harpc_net::codec::{ErrorEncoder, PlainError};
use harpc_wire_protocol::response::kind::ResponseKind;
use tower::{Service, ServiceExt};

use crate::{
    body::{control::Controlled, either::Either, full::Full, Body},
    request::Request,
    response::Response,
};

pub struct HandleReport<S, E> {
    inner: S,

    encoder: E,
}

impl<S, E, C, ReqBody, ResBody> Service<Request<ReqBody>> for HandleReport<S, E>
where
    S: Service<Request<ReqBody>, Error = Report<C>, Response = Response<ResBody>> + Clone + Send,
    E: ErrorEncoder + Clone,
    C: error_stack::Context,
    ReqBody: Body<Control = !>,
    ResBody: Body<Control: AsRef<ResponseKind>>,
{
    type Error = !;
    type Response = Response<Either<ResBody, Controlled<ResponseKind, Full>>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        // Taken from axum::HandleError
        // we're always ready because we clone the inner service, therefore it is unused and always
        // ready
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let encoder = self.encoder.clone();

        let clone = self.inner.clone();
        let inner = std::mem::replace(&mut self.inner, clone);

        let session = req.session();

        async move {
            match inner.oneshot(req).await {
                Ok(response) => Ok(response.map_body(Either::Left)),
                Err(report) => {
                    let error = encoder.encode_report(report).await;

                    Ok(Response::new_error(session, error).map_body(Either::Right))
                }
            }
        }
    }
}

// TODO: this is on tower level (which works)
pub struct HandleError<S, E> {
    inner: S,

    encoder: E,
}

impl<S, E, ReqBody, ResBody> Service<Request<ReqBody>> for HandleError<S, E>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send,
    S::Error: PlainError,
    E: ErrorEncoder + Clone,
    ReqBody: Body<Control = !>,
    ResBody: Body<Control: AsRef<ResponseKind>>,
{
    type Error = !;
    type Response = Response<Either<ResBody, Controlled<ResponseKind, Full>>>;

    type Future = impl Future<Output = Result<Self::Response, Self::Error>>;

    fn poll_ready(&mut self, _: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        // Taken from axum::HandleError
        // we're always ready because we clone the inner service, therefore it is unused and always
        // ready
        Poll::Ready(Ok(()))
    }

    fn call(&mut self, req: Request<ReqBody>) -> Self::Future {
        let encoder = self.encoder.clone();

        let clone = self.inner.clone();
        let inner = std::mem::replace(&mut self.inner, clone);

        let session = req.session();

        async move {
            match inner.oneshot(req).await {
                Ok(response) => Ok(response.map_body(Either::Left)),
                Err(error) => {
                    let error = encoder.encode_error(error).await;

                    Ok(Response::new_error(session, error).map_body(Either::Right))
                }
            }
        }
    }
}